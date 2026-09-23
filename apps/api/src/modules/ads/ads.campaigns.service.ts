import {
	type AdCopy,
	type AiModels,
	type BrandContext,
	isAiError,
	type TextResult,
	writeAdCopy,
} from "@socialfly/ai";
import { apiEnv as env } from "@socialfly/config";
import { AppError, badRequest, conflict, notFound } from "@socialfly/core/errors";
import type { Logger } from "@socialfly/core/logger";
import {
	and,
	type Database,
	desc,
	eq,
	inArray,
	isNull,
	type SQL,
	schema,
	sql,
} from "@socialfly/db";
import type {
	AdsProvider,
	AdsProviderId,
	CampaignDraft,
	MediaItem,
	Targeting,
} from "@socialfly/integrations";
import type { AdsWriteAction, JobProducer } from "@socialfly/queue";
import { roleAtLeast } from "#src/middlewares/auth.ts";
import { assertBudget } from "#src/modules/ai/ai.budget.ts";
import { toAppError } from "#src/modules/ai/ai.service.ts";
import type { OrgContext } from "#src/shared/context.ts";
import type { AdAccountRow, AdsAccountsService } from "./ads.accounts.service.ts";
import {
	type AdInput,
	budgetShapeProblems,
	type CopyInput,
	type CreateCampaignInput,
	type ListCampaignsQuery,
	type UpdateCampaignInput,
} from "./ads.schemas.ts";
import {
	type AdsProviders,
	campaignDays,
	cents,
	effectiveCeiling,
	identityFields,
	identityRequired,
} from "./ads.shared.ts";

const {
	adAccounts,
	adCampaigns,
	adCampaignMetricsDaily,
	aiGenerations,
	brandProfiles,
	mediaAssets,
	organizations,
	posts,
	researchRuns,
	users,
} = schema;

type CampaignRow = typeof adCampaigns.$inferSelect;
type CampaignStatus = CampaignRow["status"];
/** Who confirmed the ad is not political / not a special category, and when. */
type Declarations = {
	notPoliticalOrSpecialCategory: true;
	confirmedBy: string;
	confirmedAt: string;
};
type StoredDraft = { targeting: Targeting; ads: AdInput[]; declarations?: Declarations | null };

const DECLARATION_PROBLEM = "Confirm the ad is not political or in a special category";

/** A declaration from the request: confirmed now by this user, withdrawn, or (undefined) unchanged. */
const declare = (
	input: { notPoliticalOrSpecialCategory: boolean } | undefined,
	userId: string,
	current: Declarations | null | undefined,
): Declarations | null => {
	if (input === undefined) return current ?? null;
	return input.notPoliticalOrSpecialCategory
		? {
				notPoliticalOrSpecialCategory: true,
				confirmedBy: userId,
				confirmedAt: new Date().toISOString(),
			}
		: null;
};

/** Where a campaign can still be edited: nothing exists on the platform yet. */
const EDITABLE: CampaignStatus[] = ["draft", "pending_approval", "rejected"];
/** Statuses whose platform campaign can be archived through the worker. */
const ARCHIVABLE_ON_PLATFORM: CampaignStatus[] = [
	"paused",
	"active",
	"completed",
	"failed",
	"unconfirmed",
];
const OVERVIEW_DEFAULT_DAYS = 28;
const OVERVIEW_MAX_DAYS = 366;

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

const invalid = (problems: string[]) =>
	new AppError(422, "ads_invalid", "This campaign cannot be submitted yet", { problems });

const changed = () =>
	conflict("This campaign changed meanwhile — reload and try again", "campaign_changed");

type Cursor = { t: string; id: string };
const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");
function decodeCursor(raw: string): Cursor {
	try {
		const c = JSON.parse(Buffer.from(raw, "base64url").toString()) as Cursor;
		if (
			typeof c.t !== "string" ||
			Number.isNaN(Date.parse(c.t)) ||
			typeof c.id !== "string" ||
			!/^[0-9a-f-]{36}$/i.test(c.id)
		)
			throw new Error("bad cursor");
		return c;
	} catch {
		throw badRequest("Invalid cursor");
	}
}

/** The campaign fields submit-time validation looks at (a row, or a row with edits applied). */
type Candidate = {
	name: string;
	objective: string;
	dailyBudget: number | null;
	lifetimeBudget: number | null;
	startAt: Date;
	endAt: Date | null;
	draft: StoredDraft;
};

/**
 * Ad campaigns up to the moment a platform is asked to do something: drafts, submit and
 * approval, the budget ceilings, and requests to create, activate, pause, archive or
 * retry — each recorded by bumping `version` and enqueueing an ads-write job.
 *
 * Status ownership (mirrors post_targets and engagement_replies): this service writes
 * draft, pending_approval, approved, rejected, and `archived` for campaigns that never
 * reached the platform; the worker's ads writer and sync (apps/worker/src/ads) write
 * creating, paused, active, completed, failed, unconfirmed and platform archiving. Nobody
 * else writes ad_campaigns.status. Every transition here is a conditional UPDATE on the
 * status (and version) it was read with, so two admins acting at once cannot both win.
 *
 * Money safety: approval creates the campaign PAUSED — nothing spends. Spending starts
 * only with `activate`, which needs an admin, a paused campaign, a budget within the
 * ceilings, and the budget typed back exactly.
 */
export class AdsCampaignsService {
	constructor(
		private readonly db: Database,
		/** Read on every call so tests can swap the text model. */
		private readonly ai: AiModels,
		private readonly jobs: JobProducer,
		/** Read at call time so tests can swap in a fake registry. */
		private readonly providers: () => AdsProviders,
		private readonly accounts: AdsAccountsService,
		private readonly logger: Logger,
	) {}

	// ── reads ───────────────────────────────────────────────────────────────────

	private async row(orgId: string, id: string) {
		const [row] = await this.db
			.select()
			.from(adCampaigns)
			.where(and(eq(adCampaigns.id, id), eq(adCampaigns.organizationId, orgId)))
			.limit(1);
		if (!row) throw notFound("Campaign");
		return row;
	}

	private async toDtos(rows: CampaignRow[]) {
		if (rows.length === 0) return [];
		const accountIds = [...new Set(rows.map((r) => r.adAccountId))];
		const userIds = [
			...new Set(
				rows
					.flatMap((r) => [r.createdBy, r.approvedBy, r.activatedBy])
					.filter((x): x is string => !!x),
			),
		];
		const [accountRows, people, spend] = await Promise.all([
			this.db
				.select({ id: adAccounts.id, name: adAccounts.name, currency: adAccounts.currency })
				.from(adAccounts)
				.where(inArray(adAccounts.id, accountIds)),
			userIds.length
				? this.db
						.select({ id: users.id, name: users.name, email: users.email })
						.from(users)
						.where(inArray(users.id, userIds))
				: Promise.resolve([]),
			this.db
				.select({
					campaignId: adCampaignMetricsDaily.campaignId,
					spend: sql<string>`coalesce(sum(${adCampaignMetricsDaily.spend}), 0)`,
				})
				.from(adCampaignMetricsDaily)
				.where(
					inArray(
						adCampaignMetricsDaily.campaignId,
						rows.map((r) => r.id),
					),
				)
				.groupBy(adCampaignMetricsDaily.campaignId),
		]);
		const account = new Map(accountRows.map((a) => [a.id, a]));
		const person = new Map(people.map((u) => [u.id, { id: u.id, name: u.name ?? u.email }]));
		const spent = new Map(
			spend.map((s) => [s.campaignId, Math.round(Number(s.spend) * 100) / 100]),
		);
		const who = (id: string | null) => (id ? (person.get(id) ?? null) : null);
		return rows.map((r) => ({
			id: r.id,
			name: r.name,
			provider: r.provider,
			adAccount: account.get(r.adAccountId) ?? {
				id: r.adAccountId,
				name: "",
				currency: r.currency,
			},
			objective: r.objective,
			status: r.status,
			dailyBudget: r.dailyBudget,
			lifetimeBudget: r.lifetimeBudget,
			currency: r.currency,
			startAt: r.startAt.toISOString(),
			endAt: iso(r.endAt),
			platformStatus: r.platformStatus,
			manageUrl: r.manageUrl,
			error: r.errorCode ? { code: r.errorCode, message: r.errorMessage ?? "" } : null,
			spendToDate: spent.get(r.id) ?? 0,
			createdBy: who(r.createdBy),
			approvedBy: who(r.approvedBy),
			approvedAt: iso(r.approvedAt),
			activatedBy: who(r.activatedBy),
			activatedAt: iso(r.activatedAt),
			rejectionReason: r.rejectionReason,
			source: r.source as "ai" | "human",
			sourcePostId: r.sourcePostId,
			createdAt: r.createdAt.toISOString(),
			updatedAt: r.updatedAt.toISOString(),
		}));
	}

	private async toDto(row: CampaignRow) {
		const [dto] = await this.toDtos([row]);
		if (!dto) throw new Error("unreachable");
		return dto;
	}

	async list(orgId: string, q: ListCampaignsQuery) {
		const filters: SQL[] = [eq(adCampaigns.organizationId, orgId)];
		if (q.status) filters.push(eq(adCampaigns.status, q.status));
		if (q.adAccountId) filters.push(eq(adCampaigns.adAccountId, q.adAccountId));
		if (q.before) {
			const c = decodeCursor(q.before);
			filters.push(
				sql`(${adCampaigns.createdAt}, ${adCampaigns.id}) < (${c.t}::timestamptz, ${c.id}::uuid)`,
			);
		}
		const rows = await this.db
			.select()
			.from(adCampaigns)
			.where(and(...filters))
			.orderBy(desc(adCampaigns.createdAt), desc(adCampaigns.id))
			.limit(q.limit + 1);
		const page = rows.slice(0, q.limit);
		const last = page.at(-1);
		return {
			items: await this.toDtos(page),
			nextCursor:
				rows.length > q.limit && last
					? encodeCursor({ t: last.createdAt.toISOString(), id: last.id })
					: null,
		};
	}

	async get(orgId: string, id: string) {
		const row = await this.row(orgId, id);
		const daily = await this.db
			.select()
			.from(adCampaignMetricsDaily)
			.where(eq(adCampaignMetricsDaily.campaignId, row.id))
			.orderBy(adCampaignMetricsDaily.day)
			.limit(OVERVIEW_MAX_DAYS * 2);
		const sum = (k: "impressions" | "clicks" | "conversions") =>
			daily.reduce((n, d) => n + (d[k] ?? 0), 0);
		const spend = Math.round(daily.reduce((n, d) => n + d.spend, 0) * 100) / 100;
		const impressions = sum("impressions");
		const clicks = sum("clicks");
		const ratio = (a: number, b: number, scale = 1) =>
			b > 0 ? Math.round((a / b) * scale * 10_000) / 10_000 : null;
		const stored = row.draft as unknown as StoredDraft;
		const declared = stored.declarations ?? null;
		const [confirmer] = declared
			? await this.db
					.select({ id: users.id, name: users.name, email: users.email })
					.from(users)
					.where(eq(users.id, declared.confirmedBy))
					.limit(1)
			: [];
		return {
			...(await this.toDto(row)),
			draft: { targeting: stored.targeting, ads: stored.ads },
			declarations: declared
				? {
						notPoliticalOrSpecialCategory: true as const,
						confirmedBy: confirmer
							? { id: confirmer.id, name: confirmer.name ?? confirmer.email }
							: null,
						confirmedAt: declared.confirmedAt,
					}
				: null,
			metrics: {
				totals: {
					spend,
					impressions,
					clicks,
					conversions: sum("conversions"),
					ctr: ratio(clicks, impressions),
					cpc: ratio(spend, clicks),
					cpm: ratio(spend, impressions, 1000),
				},
				daily: daily.map((d) => ({
					date: d.day,
					spend: d.spend,
					impressions: d.impressions,
					clicks: d.clicks,
					conversions: d.conversions,
				})),
			},
		};
	}

	// ── validation ──────────────────────────────────────────────────────────────

	private provider(id: string): AdsProvider | null {
		const p = this.providers().get(id);
		return p?.isConfigured() ? p : null;
	}

	private async ceiling(orgId: string) {
		const [org] = await this.db
			.select({ ceiling: organizations.adsMaxDailyBudget })
			.from(organizations)
			.where(eq(organizations.id, orgId))
			.limit(1);
		return effectiveCeiling(env.ADS_MAX_DAILY_BUDGET, org?.ceiling ?? null);
	}

	/** Problems with the budget against the ceilings (server and organization). */
	private async budgetProblems(orgId: string, c: Candidate, currency: string) {
		const ceiling = await this.ceiling(orgId);
		if (ceiling === null) return [];
		if (c.dailyBudget !== null && c.dailyBudget > ceiling)
			return [
				`The daily budget of ${c.dailyBudget} ${currency} is above the limit of ${ceiling} ${currency} per day`,
			];
		if (c.lifetimeBudget !== null) {
			const days = campaignDays(c.startAt, c.endAt);
			const perDay = c.lifetimeBudget / days;
			if (perDay > ceiling + 1e-9)
				return [
					`The lifetime budget of ${c.lifetimeBudget} ${currency} over ${days} day${days === 1 ? "" : "s"} is ${Math.round(perDay * 100) / 100} ${currency} per day, above the limit of ${ceiling} ${currency} per day`,
				];
		}
		return [];
	}

	/** The organization's ready media for these ids; ids missing from the map are unusable. */
	private async media(orgId: string, ids: string[]) {
		if (ids.length === 0) return new Map<string, MediaItem>();
		const rows = await this.db
			.select()
			.from(mediaAssets)
			.where(
				and(
					inArray(mediaAssets.id, ids),
					eq(mediaAssets.organizationId, orgId),
					eq(mediaAssets.status, "ready"),
				),
			);
		const base = env.S3_PUBLIC_URL.replace(/\/+$/, "");
		return new Map(
			rows.map((a): [string, MediaItem] => [
				a.id,
				{
					url: `${base}/${a.storageKey}`,
					kind: a.kind === "video" ? "video" : "image",
					mimeType: a.mimeType,
					sizeBytes: a.sizeBytes,
					width: a.width,
					height: a.height,
					durationMs: a.durationMs,
					altText: a.altText,
				},
			]),
		);
	}

	/**
	 * Everything that must hold before a campaign may be approved (and so created): a
	 * usable account with its identity chosen, what the platform supports, the budget
	 * within the ceilings, media that is the organization's and ready, and the adapter's
	 * own pure checks. All problems are reported at once so the user fixes them in one go.
	 */
	private async assertSubmittable(orgId: string, c: Candidate, account: AdAccountRow) {
		const problems: string[] = [];
		const provider = this.provider(account.provider);
		if (account.status !== "active")
			problems.push(
				account.status === "needs_reauth"
					? "The ad account needs to be reconnected"
					: `The ad account is ${account.status} — it cannot run campaigns right now`,
			);
		for (const key of identityRequired(account.provider, account.metadata)) {
			const field = identityFields(account.provider).find((f) => f.key === key);
			problems.push(`Choose the ${field?.label ?? key} for this ad account first`);
		}
		if (!provider) problems.push(`${account.provider} is not available on this server`);
		problems.push(
			...budgetShapeProblems({
				dailyBudget: c.dailyBudget,
				lifetimeBudget: c.lifetimeBudget,
				startAt: c.startAt.toISOString(),
				endAt: c.endAt?.toISOString() ?? null,
			}),
		);
		if (c.endAt && c.endAt.getTime() <= Date.now()) problems.push("The end date is in the past");
		if (c.draft.declarations?.notPoliticalOrSpecialCategory !== true)
			problems.push(DECLARATION_PROBLEM);
		problems.push(...(await this.budgetProblems(orgId, c, account.currency)));
		if (
			account.provider === "meta_ads" &&
			(c.objective === "leads" || c.objective === "sales") &&
			typeof account.metadata.pixelId !== "string"
		)
			problems.push("Leads and sales campaigns on Meta need the ad account's Meta pixel");

		const ids = [...new Set(c.draft.ads.flatMap((a) => a.mediaIds))];
		const media = await this.media(orgId, ids);
		const missing = ids.filter((id) => !media.has(id));
		if (missing.length)
			problems.push(
				`${missing.length} media item${missing.length === 1 ? " is" : "s are"} not available (deleted, still uploading, or not in this organization)`,
			);

		if (provider) {
			const caps = provider.capabilities;
			if (!caps.objectives.includes(c.objective as CampaignDraft["objective"]))
				problems.push(`${provider.displayName} does not support the "${c.objective}" objective`);
			const formats = [...new Set(c.draft.ads.map((a) => a.format))].filter(
				(f) => !caps.formats.includes(f),
			);
			if (formats.length)
				problems.push(`${provider.displayName} does not support ${formats.join(", ")} ads`);
			if (c.draft.ads.length > caps.maxAdsPerCampaign)
				problems.push(`${provider.displayName} allows at most ${caps.maxAdsPerCampaign} ads`);
			if (missing.length === 0) {
				const draft: CampaignDraft = {
					name: c.name,
					objective: c.objective as CampaignDraft["objective"],
					...(c.dailyBudget !== null ? { dailyBudget: c.dailyBudget } : {}),
					...(c.lifetimeBudget !== null ? { lifetimeBudget: c.lifetimeBudget } : {}),
					startAt: c.startAt.toISOString(),
					endAt: c.endAt?.toISOString() ?? null,
					targeting: c.draft.targeting,
					ads: c.draft.ads.map(({ mediaIds, ...ad }) => ({
						...ad,
						media: mediaIds.map((id) => media.get(id) as MediaItem),
					})),
				};
				// The metadata lets adapters report a missing page/board/identity too.
				const accountInfo = { currency: account.currency, metadata: account.metadata };
				problems.push(...provider.validate(draft, accountInfo));
			}
		}
		const unique = [...new Set(problems)];
		if (unique.length) throw invalid(unique);
	}

	private async accountFor(orgId: string, id: string) {
		return this.accounts.row(orgId, id);
	}

	private async assertPost(orgId: string, postId: string | null | undefined) {
		if (!postId) return;
		const [post] = await this.db
			.select({ id: posts.id })
			.from(posts)
			.where(and(eq(posts.id, postId), eq(posts.organizationId, orgId), isNull(posts.deletedAt)))
			.limit(1);
		if (!post) throw notFound("Post");
	}

	/** An editor's submit waits for an admin; an admin's or owner's is approved at once. */
	private submitStatus(org: OrgContext): "pending_approval" | "approved" {
		return roleAtLeast(org.role, "admin") ? "approved" : "pending_approval";
	}

	/**
	 * Hands a request to the worker. For approvals the row is committed first, so a failed
	 * enqueue loses nothing: the maintenance sweep re-enqueues campaigns left `approved`
	 * without a job. Activation, pause and archive have no such marker, so their enqueue
	 * failure is reported to the user (who presses again) instead of being swallowed.
	 */
	private async enqueue(row: CampaignRow, action: AdsWriteAction) {
		const job = {
			campaignId: row.id,
			organizationId: row.organizationId,
			version: row.version,
			action,
		};
		try {
			await this.jobs.enqueueAdsWrite(row.provider, job);
		} catch (error) {
			this.logger.warn({ err: error, campaignId: row.id, action }, "ads enqueue failed");
			if (action !== "create")
				throw new AppError(503, "queue_unavailable", "Could not reach the ads worker — try again");
		}
	}

	// ── drafts & approval ───────────────────────────────────────────────────────

	async create(org: OrgContext, userId: string, input: CreateCampaignInput) {
		const account = await this.accountFor(org.id, input.adAccountId);
		await this.assertPost(org.id, input.sourcePostId);
		const candidate: Candidate = {
			name: input.name,
			objective: input.objective,
			dailyBudget: input.dailyBudget ?? null,
			lifetimeBudget: input.lifetimeBudget ?? null,
			startAt: new Date(input.startAt),
			endAt: input.endAt ? new Date(input.endAt) : null,
			draft: {
				targeting: input.targeting,
				ads: input.ads,
				declarations: declare(input.declarations, userId, null),
			},
		};
		const status = input.submit ? this.submitStatus(org) : "draft";
		if (status !== "draft") await this.assertSubmittable(org.id, candidate, account);
		const approved = status === "approved";
		const [row] = await this.db
			.insert(adCampaigns)
			.values({
				organizationId: org.id,
				adAccountId: account.id,
				provider: account.provider,
				currency: account.currency,
				name: candidate.name,
				objective: candidate.objective,
				status,
				draft: candidate.draft as unknown as Record<string, unknown>,
				dailyBudget: candidate.dailyBudget,
				lifetimeBudget: candidate.lifetimeBudget,
				startAt: candidate.startAt,
				endAt: candidate.endAt,
				sourcePostId: input.sourcePostId ?? null,
				source: input.source ?? "human",
				createdBy: userId,
				// The version is the create job's: 1 for a campaign approved on submit.
				version: approved ? 1 : 0,
				...(approved ? { approvedBy: userId, approvedAt: new Date() } : {}),
			})
			.returning();
		const created = row as CampaignRow;
		if (approved) await this.enqueue(created, "create");
		return this.toDto(created);
	}

	async update(org: OrgContext, userId: string, id: string, input: UpdateCampaignInput) {
		const row = await this.row(org.id, id);
		if (!EDITABLE.includes(row.status))
			throw conflict(
				"Only drafts, rejected campaigns and campaigns waiting for approval can be edited",
				"campaign_not_editable",
			);
		const account =
			input.adAccountId && input.adAccountId !== row.adAccountId
				? await this.accountFor(org.id, input.adAccountId)
				: await this.accountRow(org.id, row.adAccountId);
		if (input.sourcePostId !== undefined) await this.assertPost(org.id, input.sourcePostId);
		const stored = row.draft as unknown as StoredDraft;
		const candidate: Candidate = {
			name: input.name ?? row.name,
			objective: input.objective ?? row.objective,
			dailyBudget: input.dailyBudget !== undefined ? input.dailyBudget : row.dailyBudget,
			lifetimeBudget:
				input.lifetimeBudget !== undefined ? input.lifetimeBudget : row.lifetimeBudget,
			startAt: input.startAt ? new Date(input.startAt) : row.startAt,
			endAt: input.endAt !== undefined ? (input.endAt ? new Date(input.endAt) : null) : row.endAt,
			draft: {
				targeting: input.targeting ?? stored.targeting,
				ads: input.ads ?? stored.ads,
				declarations: declare(input.declarations, userId, stored.declarations),
			},
		};
		const shape = budgetShapeProblems({
			dailyBudget: candidate.dailyBudget,
			lifetimeBudget: candidate.lifetimeBudget,
			startAt: candidate.startAt.toISOString(),
			endAt: candidate.endAt?.toISOString() ?? null,
		});
		if (shape.length) throw invalid(shape);

		// submit true → (re)submit; false → back to draft; absent → the status is kept: a
		// pending campaign edited stays pending (and is approved as edited), a rejected one
		// stays rejected until it is resubmitted.
		const status: CampaignStatus =
			input.submit === true
				? this.submitStatus(org)
				: input.submit === false
					? "draft"
					: row.status;
		if (status === "pending_approval" || status === "approved")
			await this.assertSubmittable(org.id, candidate, account);
		const approved = status === "approved";
		const [updated] = await this.db
			.update(adCampaigns)
			.set({
				adAccountId: account.id,
				provider: account.provider,
				currency: account.currency,
				name: candidate.name,
				objective: candidate.objective,
				status,
				draft: candidate.draft as unknown as Record<string, unknown>,
				dailyBudget: candidate.dailyBudget,
				lifetimeBudget: candidate.lifetimeBudget,
				startAt: candidate.startAt,
				endAt: candidate.endAt,
				...(input.sourcePostId !== undefined ? { sourcePostId: input.sourcePostId } : {}),
				// "ai" means the AI writer's copy unedited; editing the ads makes it the user's.
				source: input.source ?? (input.ads ? "human" : row.source),
				...(approved
					? { approvedBy: userId, approvedAt: new Date(), version: sql`${adCampaigns.version} + 1` }
					: { approvedBy: null, approvedAt: null }),
				...(status !== "rejected" ? { rejectionReason: null } : {}),
			})
			.where(and(eq(adCampaigns.id, row.id), eq(adCampaigns.status, row.status)))
			.returning();
		if (!updated) throw changed();
		if (approved) await this.enqueue(updated, "create");
		return this.toDto(updated);
	}

	/** The campaign's account even when disconnected (so an edit can report it, not 404). */
	private async accountRow(orgId: string, id: string) {
		const [row] = await this.db
			.select()
			.from(adAccounts)
			.where(and(eq(adAccounts.id, id), eq(adAccounts.organizationId, orgId)))
			.limit(1);
		if (!row) throw notFound("Ad account");
		return row;
	}

	private candidate(row: CampaignRow): Candidate {
		return {
			name: row.name,
			objective: row.objective,
			dailyBudget: row.dailyBudget,
			lifetimeBudget: row.lifetimeBudget,
			startAt: row.startAt,
			endAt: row.endAt,
			draft: row.draft as unknown as StoredDraft,
		};
	}

	/** Approval creates the campaign on the platform — PAUSED. It does not spend. */
	async approve(orgId: string, userId: string, id: string) {
		const row = await this.row(orgId, id);
		if (row.status !== "pending_approval")
			throw conflict("Only campaigns waiting for approval can be approved", "not_pending");
		await this.assertSubmittable(
			orgId,
			this.candidate(row),
			await this.accountRow(orgId, row.adAccountId),
		);
		const [updated] = await this.db
			.update(adCampaigns)
			.set({
				status: "approved",
				approvedBy: userId,
				approvedAt: new Date(),
				rejectionReason: null,
				version: sql`${adCampaigns.version} + 1`,
			})
			.where(and(eq(adCampaigns.id, id), eq(adCampaigns.status, "pending_approval")))
			.returning();
		if (!updated) throw changed();
		await this.enqueue(updated, "create");
		return this.toDto(updated);
	}

	async reject(orgId: string, id: string, reason: string) {
		await this.row(orgId, id);
		const [updated] = await this.db
			.update(adCampaigns)
			.set({ status: "rejected", rejectionReason: reason, approvedBy: null, approvedAt: null })
			.where(and(eq(adCampaigns.id, id), eq(adCampaigns.status, "pending_approval")))
			.returning();
		if (!updated)
			throw conflict("Only campaigns waiting for approval can be rejected", "not_pending");
		return this.toDto(updated);
	}

	// ── spend: activate / pause / archive ───────────────────────────────────────

	/**
	 * Starts spending. Only from `paused`, only for admins, and only when the admin typed
	 * back the exact budget (the campaign's daily budget, or its lifetime budget). The
	 * ceilings are checked again (they may have been lowered since approval), and the
	 * worker checks them once more right before calling the platform.
	 */
	async activate(orgId: string, userId: string, id: string, confirmBudget: number) {
		const row = await this.row(orgId, id);
		if (row.status !== "paused")
			throw conflict("Only paused campaigns can be activated", "not_paused");
		const budget = row.dailyBudget ?? row.lifetimeBudget ?? 0;
		if (cents(confirmBudget) !== cents(budget)) {
			throw new AppError(
				422,
				"confirm_mismatch",
				`Type the campaign's ${row.dailyBudget !== null ? "daily" : "lifetime"} budget exactly to activate it`,
				{ currency: row.currency },
			);
		}
		const account = await this.accountRow(orgId, row.adAccountId);
		const problems = [
			...(account.status !== "active" ? [`The ad account is ${account.status}`] : []),
			...(this.provider(row.provider) ? [] : [`${row.provider} is not available on this server`]),
			...(await this.budgetProblems(orgId, this.candidate(row), row.currency)),
		];
		if (problems.length) throw invalid(problems);
		const [updated] = await this.db
			.update(adCampaigns)
			.set({
				activatedBy: userId,
				activatedAt: new Date(),
				errorCode: null,
				errorMessage: null,
				version: sql`${adCampaigns.version} + 1`,
			})
			.where(
				and(
					eq(adCampaigns.id, id),
					eq(adCampaigns.status, "paused"),
					eq(adCampaigns.version, row.version),
				),
			)
			.returning();
		if (!updated) throw changed();
		await this.enqueue(updated, "activate");
		return this.toDto(updated);
	}

	async pause(orgId: string, id: string) {
		const row = await this.row(orgId, id);
		if (row.status !== "active")
			throw conflict("Only active campaigns can be paused", "not_active");
		const updated = await this.request(row, "active");
		await this.enqueue(updated, "pause");
		return this.toDto(updated);
	}

	/**
	 * Stops a campaign for good. One that exists on the platform is archived there by the
	 * worker; one that never got there (a failed or unconfirmed creation without a platform
	 * id) is simply archived here.
	 */
	async archive(orgId: string, id: string) {
		const row = await this.row(orgId, id);
		if (row.externalId && ARCHIVABLE_ON_PLATFORM.includes(row.status)) {
			const updated = await this.request(row, row.status);
			await this.enqueue(updated, "archive");
			return this.toDto(updated);
		}
		if (!row.externalId && (row.status === "failed" || row.status === "unconfirmed")) {
			const [updated] = await this.db
				.update(adCampaigns)
				.set({ status: "archived" })
				.where(and(eq(adCampaigns.id, id), eq(adCampaigns.status, row.status)))
				.returning();
			if (!updated) throw changed();
			return this.toDto(updated);
		}
		throw conflict(
			row.status === "approved" || row.status === "creating"
				? "This campaign is being created — archive it once it is paused"
				: "Drafts and rejected campaigns are deleted, not archived",
			"not_archivable",
		);
	}

	/** Records a request: bumps the version (older jobs go stale) while the status holds. */
	private async request(row: CampaignRow, status: CampaignStatus) {
		const [updated] = await this.db
			.update(adCampaigns)
			.set({ errorCode: null, errorMessage: null, version: sql`${adCampaigns.version} + 1` })
			.where(
				and(
					eq(adCampaigns.id, row.id),
					eq(adCampaigns.status, status),
					eq(adCampaigns.version, row.version),
				),
			)
			.returning();
		if (!updated) throw changed();
		return updated;
	}

	/**
	 * Creates a failed campaign again. `unconfirmed` needs an explicit "I checked the ads
	 * manager and it is not there" — the first attempt may have created it (the same rule
	 * as posts and inbox replies). A campaign that exists on the platform is never created
	 * a second time: archive it and start a new one.
	 */
	async retry(orgId: string, id: string, confirmNotCreated: boolean) {
		const row = await this.row(orgId, id);
		if (row.status === "unconfirmed" && !confirmNotCreated) {
			throw new AppError(
				409,
				"confirm_required",
				"This campaign may already exist on the platform. Check the ads manager, then confirm to create it again.",
			);
		}
		if (row.status !== "failed" && row.status !== "unconfirmed")
			throw conflict("Only failed campaigns can be retried", "not_retryable");
		if (row.externalId)
			throw conflict(
				"This campaign exists on the platform — archive it and create a new one",
				"already_created",
			);
		await this.assertSubmittable(
			orgId,
			this.candidate(row),
			await this.accountRow(orgId, row.adAccountId),
		);
		const [updated] = await this.db
			.update(adCampaigns)
			.set({
				status: "approved",
				errorCode: null,
				errorMessage: null,
				version: sql`${adCampaigns.version} + 1`,
			})
			.where(and(eq(adCampaigns.id, id), eq(adCampaigns.status, row.status)))
			.returning();
		if (!updated) throw changed();
		await this.enqueue(updated, "create");
		return this.toDto(updated);
	}

	async remove(orgId: string, id: string) {
		await this.row(orgId, id);
		const rows = await this.db
			.delete(adCampaigns)
			.where(
				and(
					eq(adCampaigns.id, id),
					eq(adCampaigns.organizationId, orgId),
					inArray(adCampaigns.status, ["draft", "rejected"]),
				),
			)
			.returning({ id: adCampaigns.id });
		if (rows.length === 0)
			throw conflict("Only drafts and rejected campaigns can be deleted", "campaign_not_deletable");
	}

	// ── settings & overview ─────────────────────────────────────────────────────

	async settings(orgId: string) {
		const [org] = await this.db
			.select({ ceiling: organizations.adsMaxDailyBudget })
			.from(organizations)
			.where(eq(organizations.id, orgId))
			.limit(1);
		const orgCeiling = org?.ceiling ?? null;
		return {
			maxDailyBudget: effectiveCeiling(env.ADS_MAX_DAILY_BUDGET, orgCeiling),
			serverCeiling: env.ADS_MAX_DAILY_BUDGET > 0 ? env.ADS_MAX_DAILY_BUDGET : null,
			orgCeiling,
		};
	}

	/** An organization can lower the server's ceiling, never raise it. */
	async updateSettings(orgId: string, value: number | null) {
		const server = env.ADS_MAX_DAILY_BUDGET;
		if (value !== null && server > 0 && value > server) {
			throw new AppError(
				422,
				"ceiling_too_high",
				`The daily limit can be at most ${server} (this server's ceiling)`,
				{ serverCeiling: server },
			);
		}
		await this.db
			.update(organizations)
			.set({ adsMaxDailyBudget: value })
			.where(eq(organizations.id, orgId));
		return this.settings(orgId);
	}

	/**
	 * Delivery and spend over a date range. Money is never added across currencies: totals
	 * and per-provider rows are per currency, and the note says why there is no grand total.
	 */
	async overview(orgId: string, q: { from?: string; to?: string }) {
		const to = q.to ?? new Date().toISOString().slice(0, 10);
		const from =
			q.from ??
			new Date(Date.parse(`${to}T00:00:00Z`) - (OVERVIEW_DEFAULT_DAYS - 1) * 86_400_000)
				.toISOString()
				.slice(0, 10);
		const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
		if (Number.isNaN(span) || span < 0 || span >= OVERVIEW_MAX_DAYS)
			throw badRequest(`Choose a range of at most ${OVERVIEW_MAX_DAYS} days`);

		type Totals = {
			spend: string;
			impressions: string;
			clicks: string;
			conversions: string;
		};
		const numbers = (r: Totals) => ({
			spend: Math.round(Number(r.spend) * 100) / 100,
			impressions: Number(r.impressions),
			clicks: Number(r.clicks),
			conversions: Number(r.conversions),
		});
		// Raw SQL with explicit aliases: two tables, grouped several ways.
		const range = sql`m.organization_id = ${orgId} and m.day between ${from}::date and ${to}::date`;
		const sums = sql`coalesce(sum(m.spend), 0) as spend, coalesce(sum(m.impressions), 0) as impressions,
			coalesce(sum(m.clicks), 0) as clicks, coalesce(sum(m.conversions), 0) as conversions`;
		const [totals, byCampaign, byProvider, byDay] = await Promise.all([
			this.db.execute(sql`
				select c.currency, ${sums}
				from ad_campaign_metrics_daily m join ad_campaigns c on c.id = m.campaign_id
				where ${range} group by c.currency order by c.currency
			`) as unknown as Promise<(Totals & { currency: string })[]>,
			this.db.execute(sql`
				select c.id, c.name, c.provider, c.status, c.currency, ${sums}
				from ad_campaign_metrics_daily m join ad_campaigns c on c.id = m.campaign_id
				where ${range} group by c.id order by sum(m.spend) desc, c.id limit 100
			`) as unknown as Promise<
				(Totals & {
					id: string;
					name: string;
					provider: string;
					status: string;
					currency: string;
				})[]
			>,
			this.db.execute(sql`
				select c.provider, c.currency, ${sums}
				from ad_campaign_metrics_daily m join ad_campaigns c on c.id = m.campaign_id
				where ${range} group by c.provider, c.currency order by c.provider, c.currency
			`) as unknown as Promise<(Totals & { provider: string; currency: string })[]>,
			this.db.execute(sql`
				select c.currency, to_char(m.day, 'YYYY-MM-DD') as day, ${sums}
				from ad_campaign_metrics_daily m join ad_campaigns c on c.id = m.campaign_id
				where ${range} group by c.currency, m.day
			`) as unknown as Promise<(Totals & { currency: string; day: string })[]>,
		]);
		// Every day of the range, zero-filled, so a chart has no gaps. Days are the accounts'
		// own (as the platforms report and we store them), per currency group.
		const days: string[] = [];
		for (
			let t = Date.parse(`${from}T00:00:00Z`);
			t <= Date.parse(`${to}T00:00:00Z`);
			t += 86_400_000
		)
			days.push(new Date(t).toISOString().slice(0, 10));
		const perDay = new Map(byDay.map((d) => [`${d.currency}:${d.day}`, numbers(d)]));
		const zero = { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
		const daily = (currency: string) =>
			days.map((date) => ({ date, ...(perDay.get(`${currency}:${date}`) ?? zero) }));
		return {
			from,
			to,
			totals: totals.map((t) => ({
				currency: t.currency,
				...numbers(t),
				daily: daily(t.currency),
			})),
			byCampaign: byCampaign.map((c) => ({
				campaignId: c.id,
				name: c.name,
				provider: c.provider,
				status: c.status as CampaignStatus,
				currency: c.currency,
				...numbers(c),
			})),
			byProvider: byProvider.map((p) => ({
				provider: p.provider,
				currency: p.currency,
				...numbers(p),
			})),
			currencyNote:
				totals.length > 1
					? "Your ad accounts use different currencies, so spend is totalled per currency and never added together."
					: null,
		};
	}

	// ── AI copy ─────────────────────────────────────────────────────────────────

	/**
	 * Ad copy variants and targeting ideas from the text model, synchronous like the
	 * composer's AI. Budgeted and metered like every text task (one ai_generations row,
	 * kind `ad_copy`, failed calls included). Nothing is saved as a campaign.
	 */
	async copy(orgId: string, userId: string, input: CopyInput) {
		const model = this.ai.text;
		if (!model)
			throw new AppError(
				503,
				"ai_not_configured",
				"AI text generation is not set up on this server",
			);
		const account = await this.accountFor(orgId, input.adAccountId);
		let sourcePost: { text: string } | null = null;
		if (input.sourcePostId) {
			const [post] = await this.db
				.select({ content: posts.content })
				.from(posts)
				.where(
					and(
						eq(posts.id, input.sourcePostId),
						eq(posts.organizationId, orgId),
						isNull(posts.deletedAt),
					),
				)
				.limit(1);
			if (!post) throw notFound("Post");
			sourcePost = { text: post.content };
		}
		await assertBudget(this.db, orgId);
		const [brand, research] = await Promise.all([this.brand(orgId), this.research(orgId)]);

		const base = {
			organizationId: orgId,
			userId,
			kind: "ad_copy" as const,
			input: {
				adAccountId: account.id,
				provider: account.provider,
				objective: input.objective,
				format: input.format,
				variants: input.variants,
				sourcePostId: input.sourcePostId ?? null,
			},
		};
		const started = performance.now();
		let result: TextResult<AdCopy>;
		try {
			result = await writeAdCopy(model, brand, {
				objective: input.objective,
				platform: account.provider as AdsProviderId,
				product: input.product,
				audience: input.audience,
				destinationUrl: input.destinationUrl,
				format: input.format,
				variants: input.variants,
				sourcePost,
				research,
			});
		} catch (error) {
			await this.db.insert(aiGenerations).values({
				...base,
				status: "failed",
				model: model.id,
				errorCode: isAiError(error) ? error.kind : "internal",
				errorMessage: error instanceof Error ? error.message.slice(0, 1000) : String(error),
				durationMs: Math.round(performance.now() - started),
				completedAt: new Date(),
			});
			throw toAppError(error);
		}
		const [gen] = await this.db
			.insert(aiGenerations)
			.values({
				...base,
				status: "succeeded",
				model: result.model,
				output: result.output,
				inputTokens: result.usage.inputTokens,
				outputTokens: result.usage.outputTokens,
				costMicros: result.costMicros,
				durationMs: Math.round(performance.now() - started),
				completedAt: new Date(),
			})
			.returning({ id: aiGenerations.id });
		if (!gen) throw new Error("ai_generations insert returned no row");
		return { ...result.output, generationId: gen.id };
	}

	private async brand(orgId: string): Promise<BrandContext | null> {
		const [row] = await this.db
			.select()
			.from(brandProfiles)
			.where(eq(brandProfiles.organizationId, orgId))
			.limit(1);
		if (!row) return null;
		return {
			brandName: row.brandName,
			description: row.description,
			audience: row.audience,
			voice: row.voice,
			website: row.website,
			keywords: row.keywords,
			avoid: row.avoid,
			examplePosts: row.examplePosts,
		};
	}

	/** The latest successful website research brief, when there is one. */
	private async research(orgId: string) {
		const [run] = await this.db
			.select({ insights: researchRuns.insights })
			.from(researchRuns)
			.where(and(eq(researchRuns.organizationId, orgId), eq(researchRuns.status, "succeeded")))
			.orderBy(desc(researchRuns.createdAt))
			.limit(1);
		const i = run?.insights;
		if (!i) return null;
		const text = (v: unknown) => (typeof v === "string" ? v : "");
		return {
			valueProposition: text(i.valueProposition),
			audience: text(i.audience),
			buyerQuestions: Array.isArray(i.buyerQuestions)
				? i.buyerQuestions.filter((q): q is string => typeof q === "string")
				: [],
		};
	}
}
