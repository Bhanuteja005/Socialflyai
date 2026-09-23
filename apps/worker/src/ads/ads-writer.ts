import type { Logger } from "@socialfly/core/logger";
import { getMeter } from "@socialfly/core/telemetry";
import { type Database, eq, schema } from "@socialfly/db";
import { type AdsContext, type AdsProvider, isProviderError } from "@socialfly/integrations";
import type { AdsWriteAction, AdsWriteJob, JobProducer } from "@socialfly/queue";
import { decide } from "#src/publishing/retry-policy.ts";
import {
	AdAccountNeedsReauthError,
	AdAccountUnavailableError,
	type AdTokens,
} from "./ad-tokens.ts";
import type { AdCampaignState, CampaignRow, CampaignStatus } from "./campaign-state.ts";
import { buildCampaignDraft, dailyCeiling, dailyEquivalent } from "./draft.ts";
import { type AdsProviders, configuredAdsProvider } from "./providers.ts";
import { reconcileStatus } from "./reconcile.ts";

const { adAccounts, organizations } = schema;

export type AdsWriterDeps = {
	db: Database;
	providers: AdsProviders;
	tokens: AdTokens;
	state: AdCampaignState;
	jobs: JobProducer;
	logger: Logger;
	publicMediaUrl: string;
	/** ADS_MAX_DAILY_BUDGET; 0 = no server ceiling. */
	serverDailyCeiling: number;
};

const meter = getMeter("ads");
const outcomes = meter.createCounter("socialfly.ads.writes", {
	description: "Ads mutations by provider, action and outcome",
});

/** Which status each request may start from (anything else: the request is stale). */
const EXPECTED: Record<AdsWriteAction, CampaignStatus[]> = {
	create: ["approved"],
	activate: ["paused"],
	pause: ["active"],
	// Failed/unconfirmed ones only when they exist on the platform (the API archives the
	// others itself): a campaign the platform rejected after creation is cleaned up there.
	archive: ["paused", "active", "completed", "failed", "unconfirmed"],
};

const TARGET: Record<Exclude<AdsWriteAction, "create">, CampaignStatus> = {
	activate: "active",
	pause: "paused",
	archive: "archived",
};

/** Objects a failed creation left on the platform (the adapter could not clean them up). */
const orphansOf = (error: unknown): string[] =>
	isProviderError(error) ? (error.details.orphanedExternalIds ?? []) : [];

/**
 * Creates campaigns on the ad platforms and starts or stops their spend — exactly once.
 * Money is at stake, so the publishing engine's invariants apply, plus one of its own:
 *  1. Nothing spends without a person. Creation always yields a PAUSED campaign (the
 *     adapter contract); only an `activate` job — which the API enqueues only after an
 *     admin typed the budget back — calls setStatus("active").
 *  2. Never twice. A conditional claim on (version, status), one BullMQ attempt, and an
 *     unknown outcome is never retried automatically (`unconfirmed`, or `status_unconfirmed`
 *     followed by a read-only status check).
 *  3. Current state. The draft, media, account and budget ceiling are re-read here.
 */
export class AdsWriter {
	constructor(private readonly deps: AdsWriterDeps) {}

	async run(job: AdsWriteJob): Promise<void> {
		const { state, logger } = this.deps;
		const row = await state.claim(
			job.campaignId,
			job.version,
			EXPECTED[job.action],
			job.action === "create" ? { status: "creating" } : {},
		);
		if (!row) {
			// A newer request replaced this one, or another job already ran it.
			logger.debug({ campaignId: job.campaignId, version: job.version }, "stale ads job skipped");
			return;
		}
		const log = logger.child({ campaignId: row.id, action: job.action, provider: row.provider });
		const attempt = job.attempt ?? 1;

		const [account] = await this.deps.db
			.select({ account: adAccounts, orgDeletedAt: organizations.deletedAt })
			.from(adAccounts)
			.innerJoin(organizations, eq(organizations.id, adAccounts.organizationId))
			.where(eq(adAccounts.id, row.adAccountId))
			.limit(1);
		const provider = configuredAdsProvider(this.deps.providers, row.provider);
		const blocked = !account
			? "The ad account no longer exists"
			: account.orgDeletedAt
				? "The organization was deleted"
				: account.account.status !== "active"
					? account.account.status === "needs_reauth"
						? "The ad account needs to be reconnected"
						: `The ad account is ${account.account.status}`
					: !provider
						? `${row.provider} is not available on this server`
						: null;

		if (job.action === "create") {
			if (blocked || !provider || !account)
				return this.fail(row, "ad_account_unavailable", blocked ?? "");
			return this.create(row, provider, account.account, attempt, log);
		}
		if (blocked || !provider) {
			return state.statusError(
				row,
				"ad_account_unavailable",
				job.action === "pause"
					? `${blocked} — pause the campaign in the ads manager to stop spending`
					: (blocked ?? ""),
				{ clearActivation: job.action === "activate" },
			);
		}
		return this.changeStatus(row, provider, job.action, attempt, log);
	}

	// ── create ──────────────────────────────────────────────────────────────────

	private async create(
		row: CampaignRow,
		provider: AdsProvider,
		account: { currency: string; metadata: Record<string, unknown> },
		attempt: number,
		log: Logger,
	) {
		const { state } = this.deps;
		const built = await buildCampaignDraft(this.deps.db, row, this.deps.publicMediaUrl);
		if ("missingMedia" in built)
			return this.fail(row, "media_missing", "Some of the campaign's media was deleted");
		const { draft } = built;

		// Pure pre-flight: nothing is sent unless the draft is valid for this account.
		// Adapters that need an identity (page, board…) read it from the metadata as well.
		const accountInfo = { currency: account.currency, metadata: account.metadata };
		const problems = provider.validate(draft, accountInfo);
		if (problems.length) return this.fail(row, "invalid_campaign", problems.join("; "));

		let sent = false;
		let alreadyRefreshed = false;
		for (;;) {
			try {
				const ctx = await this.deps.tokens.context(row.adAccountId, {
					forceRefresh: alreadyRefreshed,
				});
				sent = true;
				const result = await provider.createCampaign(ctx, draft);
				outcomes.add(1, { provider: provider.id, action: "create", outcome: "created" });
				log.info({ externalId: result.campaignExternalId }, "ad campaign created (paused)");
				return await state.created(row, result);
			} catch (error) {
				if (
					error instanceof AdAccountNeedsReauthError ||
					error instanceof AdAccountUnavailableError
				)
					return this.fail(row, "ad_account_unavailable", error.message);
				const decision = decide(error, { attempt, sent, alreadyRefreshed });
				log.warn({ err: error, decision: decision.action }, "ad campaign creation failed");
				switch (decision.action) {
					case "refresh_token":
						// A 401/403 is a refusal: nothing was created, resending after a refresh is safe.
						alreadyRefreshed = true;
						sent = false;
						continue;
					case "retry": {
						outcomes.add(1, { provider: provider.id, action: "create", outcome: "retry" });
						const version = await state.requeueCreate(row, decision.reason);
						if (version === null) return;
						return this.deps.jobs.enqueueAdsWrite(
							provider.id,
							{
								campaignId: row.id,
								organizationId: row.organizationId,
								version,
								action: "create",
								attempt: attempt + 1,
							},
							decision.delayMs,
						);
					}
					case "fail":
						outcomes.add(1, { provider: provider.id, action: "create", outcome: "failed" });
						return state.failed(
							row,
							decision.code === "channel_needs_reauth"
								? "ad_account_not_authorized"
								: decision.code,
							decision.code === "channel_needs_reauth"
								? "The platform refused access to the ad account — reconnect it and retry"
								: decision.message,
							orphansOf(error),
						);
					case "unconfirmed":
						outcomes.add(1, { provider: provider.id, action: "create", outcome: "unconfirmed" });
						return state.unconfirmed(row, decision.message, orphansOf(error));
				}
			}
		}
	}

	private async fail(row: CampaignRow, code: string, message: string) {
		outcomes.add(1, { provider: row.provider, action: "create", outcome: "failed" });
		await this.deps.state.failed(row, code, message);
	}

	// ── activate / pause / archive ──────────────────────────────────────────────

	private async changeStatus(
		row: CampaignRow,
		provider: AdsProvider,
		action: Exclude<AdsWriteAction, "create">,
		attempt: number,
		log: Logger,
	) {
		const { state } = this.deps;
		const target = TARGET[action];
		const activation = action === "activate";
		if (!row.externalId)
			return state.statusError(row, "not_created", "This campaign does not exist on the platform", {
				clearActivation: activation,
			});

		if (activation) {
			// Checked again right before money starts moving: the ceiling may have been
			// lowered since the admin confirmed.
			const ceiling = await dailyCeiling(
				this.deps.db,
				row.organizationId,
				this.deps.serverDailyCeiling,
			);
			if (ceiling !== null && dailyEquivalent(row) > ceiling + 1e-9) {
				return state.statusError(
					row,
					"budget_over_ceiling",
					`The budget is above the daily limit of ${ceiling} ${row.currency}`,
					{ clearActivation: true },
				);
			}
		}

		const externalId = row.externalId;
		let sent = false;
		let alreadyRefreshed = false;
		for (;;) {
			try {
				const ctx = await this.deps.tokens.context(row.adAccountId, {
					forceRefresh: alreadyRefreshed,
				});
				sent = true;
				if (action === "archive") {
					// Where the platform cannot archive, pausing is what stops the spend.
					if (provider.archiveCampaign) await provider.archiveCampaign(ctx, externalId);
					else await provider.setStatus(ctx, externalId, "paused");
				} else {
					await provider.setStatus(ctx, externalId, target as "active" | "paused");
				}
				outcomes.add(1, { provider: provider.id, action, outcome: "applied" });
				log.info({ externalId, status: target }, "ad campaign status changed");
				const applied = await state.statusApplied(row, target);
				if (!applied) log.warn("campaign changed meanwhile; the next sync reconciles its status");
				return;
			} catch (error) {
				if (
					error instanceof AdAccountNeedsReauthError ||
					error instanceof AdAccountUnavailableError
				)
					return state.statusError(row, "ad_account_unavailable", error.message, {
						clearActivation: activation,
					});
				const decision = decide(error, { attempt, sent, alreadyRefreshed });
				log.warn({ err: error, decision: decision.action }, "ad campaign status change failed");
				switch (decision.action) {
					case "refresh_token":
						alreadyRefreshed = true;
						sent = false;
						continue;
					case "retry":
						// The status did not change; the same request goes again later under the
						// version this job claimed (a newer request makes it stale).
						outcomes.add(1, { provider: provider.id, action, outcome: "retry" });
						return this.deps.jobs.enqueueAdsWrite(
							provider.id,
							{
								campaignId: row.id,
								organizationId: row.organizationId,
								version: row.version,
								action,
								attempt: attempt + 1,
							},
							decision.delayMs,
						);
					case "fail":
						outcomes.add(1, { provider: provider.id, action, outcome: "failed" });
						return state.statusError(row, `${action}_failed`, decision.message, {
							clearActivation: activation,
						});
					case "unconfirmed":
						outcomes.add(1, { provider: provider.id, action, outcome: "unconfirmed" });
						return this.unconfirmedStatus(row, provider, target, decision.message, log);
				}
			}
		}
	}

	/**
	 * The status call's outcome is unknown. Setting it again blindly is not the answer (an
	 * activation could run twice on a platform with side effects), but a status READ is
	 * safe: keep the stored status, flag it, and ask the platform what it has right now.
	 */
	private async unconfirmedStatus(
		row: CampaignRow,
		provider: AdsProvider,
		target: CampaignStatus,
		message: string,
		log: Logger,
	) {
		const { state } = this.deps;
		await state.statusError(
			row,
			"status_unconfirmed",
			`${message}. Check the ads manager — the change may or may not have been applied`,
		);
		let ctx: AdsContext;
		let platform: Awaited<ReturnType<AdsProvider["getCampaignStatus"]>>;
		try {
			ctx = await this.deps.tokens.context(row.adAccountId);
			platform = await provider.getCampaignStatus(ctx, row.externalId as string);
		} catch (error) {
			log.warn({ err: error }, "status read after an unknown outcome failed; sync will retry");
			return;
		}
		const fresh = { ...row, errorCode: "status_unconfirmed" };
		await reconcileStatus(state, fresh, platform, { confirms: target });
	}
}
