import { and, type Database, eq, inArray, schema, sql } from "@socialfly/db";
import type { CreatedCampaign } from "@socialfly/integrations";

const { adCampaigns } = schema;

export type CampaignRow = typeof adCampaigns.$inferSelect;
export type CampaignStatus = CampaignRow["status"];
type ExternalObject = { type: string; externalId: string };

/** Longer than any creation call (adapters bound each request well under a minute): the worker died. */
export const STUCK_CREATING_MS = 15 * 60_000;

/**
 * Every worker write to ad_campaigns.status goes through here. The only other writer is
 * the API's ads service, which owns the states before creation (draft, pending_approval,
 * approved, rejected) and records requests (activate, pause, archive, retry) by bumping
 * `version` and enqueueing a job. Nothing else writes ad_campaigns.status.
 *
 * Every write is conditional on the version the job claimed, so a job made stale by a
 * newer request (the user pressed pause while an activation was queued) can never
 * overwrite what that newer request decides.
 */
export class AdCampaignState {
	constructor(private readonly db: Database) {}

	/**
	 * Takes ownership of a request for this job: the row must still be at the job's version
	 * and in one of the expected statuses. The version is bumped, so a duplicate or stale
	 * job finds nothing and exactly one job per request can call the platform.
	 */
	async claim(
		campaignId: string,
		version: number,
		expected: CampaignStatus[],
		set: Partial<Pick<CampaignRow, "status">> = {},
	): Promise<CampaignRow | null> {
		const [row] = await this.db
			.update(adCampaigns)
			.set({ ...set, version: sql`${adCampaigns.version} + 1` })
			.where(
				and(
					eq(adCampaigns.id, campaignId),
					eq(adCampaigns.version, version),
					inArray(adCampaigns.status, expected),
				),
			)
			.returning();
		return row ?? null;
	}

	private mine(row: CampaignRow, status?: CampaignStatus) {
		return and(
			eq(adCampaigns.id, row.id),
			eq(adCampaigns.version, row.version),
			...(status ? [eq(adCampaigns.status, status)] : []),
		);
	}

	/** Created on the platform — PAUSED, as every adapter guarantees. Nothing spends yet. */
	async created(row: CampaignRow, result: CreatedCampaign) {
		await this.db
			.update(adCampaigns)
			.set({
				status: "paused",
				externalId: result.campaignExternalId,
				externalObjects: [
					...row.externalObjects,
					{ type: "campaign", externalId: result.campaignExternalId },
					...result.objects,
				],
				manageUrl: result.manageUrl,
				platformStatus: "paused",
				platformStatusAt: new Date(),
				errorCode: null,
				errorMessage: null,
			})
			.where(this.mine(row, "creating"));
	}

	/**
	 * The platform said no (or a check failed before sending). Objects the adapter created
	 * but could not delete are recorded so a person can remove them in the ads manager.
	 */
	async failed(row: CampaignRow, code: string, message: string, orphans: string[] = []) {
		await this.db
			.update(adCampaigns)
			.set({
				status: "failed",
				errorCode: code,
				errorMessage: withOrphans(message, orphans).slice(0, 2000),
				externalObjects: [...row.externalObjects, ...orphanObjects(orphans)],
			})
			.where(this.mine(row, "creating"));
	}

	/** The campaign may exist on the platform. Never retried automatically: the user checks first. */
	async unconfirmed(row: CampaignRow, message: string, orphans: string[] = []) {
		await this.db
			.update(adCampaigns)
			.set({
				status: "unconfirmed",
				errorCode: "outcome_unknown",
				errorMessage: withOrphans(
					`${message}. Check the ads manager before retrying — the campaign may already exist (paused)`,
					orphans,
				).slice(0, 2000),
				externalObjects: [...row.externalObjects, ...orphanObjects(orphans)],
			})
			.where(this.mine(row, "creating"));
	}

	/**
	 * Back to `approved` for an automatic retry (refused before anything was created).
	 * Returns the version the next job must carry, or null if the campaign moved on.
	 */
	async requeueCreate(row: CampaignRow, reason: string): Promise<number | null> {
		const [updated] = await this.db
			.update(adCampaigns)
			.set({ status: "approved", errorCode: "retrying", errorMessage: reason.slice(0, 1000) })
			.where(this.mine(row, "creating"))
			.returning({ version: adCampaigns.version });
		return updated?.version ?? null;
	}

	/** A status change the platform confirmed. */
	async statusApplied(row: CampaignRow, status: CampaignStatus) {
		const [updated] = await this.db
			.update(adCampaigns)
			.set({
				status,
				platformStatus: status,
				platformStatusAt: new Date(),
				errorCode: null,
				errorMessage: null,
			})
			.where(this.mine(row))
			.returning({ id: adCampaigns.id });
		return Boolean(updated);
	}

	/**
	 * A status change that did not happen (or may not have): the status stays what it was
	 * and the error explains. An activation that did not go through also forgets who asked,
	 * so "activated by" never names someone for a campaign that never ran.
	 */
	async statusError(
		row: CampaignRow,
		code: string,
		message: string,
		opts: { clearActivation?: boolean } = {},
	) {
		await this.db
			.update(adCampaigns)
			.set({
				errorCode: code,
				errorMessage: message.slice(0, 2000),
				...(opts.clearActivation ? { activatedBy: null, activatedAt: null } : {}),
			})
			.where(this.mine(row));
	}

	/**
	 * What the platform reports, from a status read (sync or reconciliation after an
	 * unknown outcome). Conditional on the version AND status we read, so it never
	 * overwrites a request made meanwhile.
	 */
	async reconcile(
		row: CampaignRow,
		platformStatus: string,
		next: { status: CampaignStatus; errorCode?: string | null; errorMessage?: string | null },
	) {
		const [updated] = await this.db
			.update(adCampaigns)
			.set({
				status: next.status,
				platformStatus,
				platformStatusAt: new Date(),
				...(next.errorCode !== undefined
					? { errorCode: next.errorCode, errorMessage: next.errorMessage ?? null }
					: {}),
			})
			.where(this.mine(row, row.status))
			.returning({ id: adCampaigns.id });
		return Boolean(updated);
	}

	/** Campaigns left in `creating` by a dead worker become unconfirmed (maintenance). */
	async recoverStuck(olderThanMs = STUCK_CREATING_MS) {
		return this.db
			.update(adCampaigns)
			.set({
				status: "unconfirmed",
				errorCode: "outcome_unknown",
				errorMessage:
					"The ads worker stopped while creating this campaign. Check the ads manager before retrying — it may already exist (paused).",
			})
			.where(
				and(
					eq(adCampaigns.status, "creating"),
					sql`${adCampaigns.updatedAt} < now() - make_interval(secs => ${olderThanMs / 1000})`,
				),
			)
			.returning({ id: adCampaigns.id });
	}
}

const withOrphans = (message: string, orphans: string[]) =>
	orphans.length
		? `${message} (left on the platform and not cleaned up: ${orphans.join(", ")} — remove them in the ads manager)`
		: message;

const orphanObjects = (orphans: string[]): ExternalObject[] =>
	orphans.map((externalId) => ({ type: "orphan", externalId }));
