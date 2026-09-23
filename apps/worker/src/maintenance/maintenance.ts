import type { Logger } from "@socialfly/core/logger";
import { and, type Database, eq, inArray, isNotNull, lt, lte, schema, sql } from "@socialfly/db";
import type { JobProducer, MaintenanceJob } from "@socialfly/queue";
import type { TargetState } from "#src/publishing/target-state.ts";

const { postTargets, channels, aiGenerations, researchRuns } = schema;

/** A target left in `publishing` this long means its worker died mid-attempt. */
const STUCK_PUBLISHING_MS = 15 * 60_000;
/** Processing with no progress this long: the status-poll chain was lost. */
const STUCK_PROCESSING_MS = 2 * 3600_000;
/** Far beyond any real image call (providers time out at ~3 min, with one retry). */
const STUCK_AI_GENERATION_MS = 30 * 60_000;
/** A crawl is capped at 8 minutes and one analysis call; 30 minutes means the job was lost. */
const STUCK_RESEARCH_RUN_MS = 30 * 60_000;

/**
 * Periodic self-healing. BullMQ delayed jobs are the primary scheduler; these
 * tasks make the system correct even when a job is lost (Redis restore, a
 * crashed enqueue after a DB commit, a worker killed mid-publish).
 */
export class Maintenance {
	constructor(
		private readonly db: Database,
		private readonly jobs: JobProducer,
		private readonly state: TargetState,
		private readonly logger: Logger,
	) {}

	async run(job: MaintenanceJob) {
		switch (job.task) {
			case "sweep-due-targets":
				return this.sweepDueTargets();
			case "recover-stuck-targets": {
				// AI media recovery rides on this schedule because the task enum lives in
				// packages/queue; a separate task id would need a queue-package change for
				// no behavioural gain — both are "a worker died mid-job" sweeps.
				const targets = await this.recoverStuckTargets();
				const aiGenerations = await this.recoverStuckAiGenerations();
				const researchRuns = await this.recoverStuckResearchRuns();
				return {
					...targets,
					aiGenerations: aiGenerations.recovered,
					researchRuns: researchRuns.recovered,
				};
			}
			case "schedule-token-refresh":
				return this.scheduleTokenRefresh();
		}
	}

	/** Re-enqueue anything due within the next minute that has no live job. */
	async sweepDueTargets() {
		const due = await this.db
			.select({ target: postTargets, provider: channels.provider })
			.from(postTargets)
			.innerJoin(channels, eq(channels.id, postTargets.channelId))
			.where(
				and(
					inArray(postTargets.status, ["scheduled", "queued"]),
					lte(postTargets.scheduledAt, sql`now() + interval '1 minute'`),
				),
			)
			.limit(1000);

		let recovered = 0;
		for (const { target, provider } of due) {
			const added = await this.jobs.ensurePublish(
				provider,
				{
					targetId: target.id,
					organizationId: target.organizationId,
					scheduleVersion: target.scheduleVersion,
				},
				target.scheduledAt,
			);
			if (added) recovered++;
		}
		if (recovered > 0)
			this.logger.warn({ recovered }, "sweep re-enqueued targets with no live job");
		return { checked: due.length, recovered };
	}

	/**
	 * Targets stuck mid-flight become `unconfirmed`, never retried: the attempt may
	 * have reached the platform before the worker died.
	 */
	async recoverStuckTargets() {
		const stuck = await this.db
			.select({ id: postTargets.id, postId: postTargets.postId, status: postTargets.status })
			.from(postTargets)
			.where(
				sql`(${postTargets.status} = 'publishing' and ${postTargets.updatedAt} < now() - make_interval(secs => ${STUCK_PUBLISHING_MS / 1000}))
				 or (${postTargets.status} = 'processing' and ${postTargets.updatedAt} < now() - make_interval(secs => ${STUCK_PROCESSING_MS / 1000}))`,
			)
			.limit(500);
		for (const target of stuck) {
			await this.state.unconfirmed(
				target,
				target.status === "publishing"
					? "The publishing worker stopped mid-attempt"
					: "The platform never reported that processing finished",
			);
		}
		if (stuck.length > 0)
			this.logger.error({ count: stuck.length }, "stuck targets marked unconfirmed");
		return { recovered: stuck.length };
	}

	/**
	 * AI media generations whose job was lost (Redis restore, enqueue failed after the
	 * row was inserted, worker killed past its retries) would spin forever in the UI.
	 * Failing them is safe: a late job sees `failed` and never generates or bills.
	 */
	async recoverStuckAiGenerations() {
		const stuck = await this.db
			.update(aiGenerations)
			.set({
				status: "failed",
				errorCode: "timeout",
				errorMessage: "This generation took too long and was stopped. Please try again.",
				completedAt: new Date(),
			})
			.where(
				and(
					inArray(aiGenerations.status, ["pending", "running"]),
					lt(
						aiGenerations.createdAt,
						sql`now() - make_interval(secs => ${STUCK_AI_GENERATION_MS / 1000})`,
					),
				),
			)
			.returning({ id: aiGenerations.id });
		if (stuck.length > 0)
			this.logger.error({ count: stuck.length }, "stuck ai generations marked failed");
		return { recovered: stuck.length };
	}

	/**
	 * Research runs whose job was lost would block the org's next run forever (the API
	 * allows one active run). Failing them is safe: a late job sees `failed` and stops,
	 * and a brief that does finish late still wins (see research/crawl.ts).
	 */
	async recoverStuckResearchRuns() {
		const stuck = await this.db
			.update(researchRuns)
			.set({
				status: "failed",
				errorCode: "timeout",
				errorMessage: "This research took too long and was stopped. Please try again.",
				completedAt: new Date(),
			})
			.where(
				and(
					inArray(researchRuns.status, ["pending", "crawling", "analyzing"]),
					lt(
						researchRuns.createdAt,
						sql`now() - make_interval(secs => ${STUCK_RESEARCH_RUN_MS / 1000})`,
					),
				),
			)
			.returning({ id: researchRuns.id });
		if (stuck.length > 0)
			this.logger.error({ count: stuck.length }, "stuck research runs marked failed");
		return { recovered: stuck.length };
	}

	/** Make sure every refreshable token expiring within a day has a refresh job. */
	async scheduleTokenRefresh() {
		const expiring = await this.db
			.select({ id: channels.id, tokenExpiresAt: channels.tokenExpiresAt })
			.from(channels)
			.where(
				and(
					eq(channels.status, "active"),
					isNotNull(channels.refreshTokenEnc),
					lte(channels.tokenExpiresAt, sql`now() + interval '1 day'`),
				),
			);
		for (const channel of expiring) {
			if (channel.tokenExpiresAt) {
				await this.jobs.scheduleTokenRefresh({ channelId: channel.id }, channel.tokenExpiresAt);
			}
		}
		return { scheduled: expiring.length };
	}
}
