import { z } from "zod";

/**
 * Every queue and its payload, in one place. The API produces, the worker
 * consumes, and both import these schemas — a payload change that breaks one side
 * fails the typecheck instead of failing at 3am in the worker.
 *
 * Payloads carry IDS, never data: the worker re-reads current state from Postgres
 * when the job runs. A post edited or canceled after scheduling must publish (or
 * not) as it is NOW, not as it was when the job was enqueued.
 */

/**
 * Publishing is one queue PER PROVIDER. BullMQ rate-limits per queue, and
 * platforms rate-limit per app: LinkedIn's limits must not throttle X, and a burst
 * of Instagram posts must not starve Reddit. The worker builds each queue's
 * limiter from that provider's declared limits.
 */
export const publishQueueName = (provider: string) => `publish-${provider}` as const;

/**
 * Sending an inbox reply creates a visible public post, so it follows publishing: one
 * queue per provider (rate limited with that provider's publish budget) and one
 * BullMQ attempt — retries are decided by the reply sender, which knows whether the
 * platform may already have the reply.
 */
export const engagementReplyQueueName = (provider: string) =>
	`engagement-reply-${provider}` as const;

export const QUEUES = {
	/** Polls targets in `processing` (IG/Threads/YouTube async media) until done. */
	publishStatus: "publish-status",
	/** Refreshes channel OAuth tokens shortly before they expire. */
	tokenRefresh: "token-refresh",
	/** Periodic safety net: re-enqueues due targets whose delayed job went missing. */
	maintenance: "maintenance",
	/** AI image generation and carousel rendering: slow, paid calls kept off the request path. */
	aiMedia: "ai-media",
	/**
	 * Read-only metrics collection. Its own queue (and concurrency) so a backlog of
	 * analytics reads can never delay a publish, which has a user-visible deadline.
	 */
	analytics: "analytics",
	/**
	 * Website research, AI-visibility checks and SEO refreshes: minutes-long jobs made
	 * of many paid calls, kept apart so they can never hold up publishing or media.
	 */
	research: "research",
	/**
	 * Engagement inbox reads and AI triage: syncing comments/mentions, keyword listening
	 * and scoring. Its own queue so an inbox backlog never delays publishing or analytics.
	 * (Sending replies uses the per-provider engagement-reply queues.)
	 */
	engagement: "engagement",
} as const;

export const publishJobSchema = z.object({
	targetId: z.uuid(),
	organizationId: z.uuid(),
	/** Must equal post_targets.schedule_version when the job runs, or the job is stale. */
	scheduleVersion: z.number().int().nonnegative(),
});
export type PublishJob = z.infer<typeof publishJobSchema>;

export const publishStatusJobSchema = z.object({
	targetId: z.uuid(),
	organizationId: z.uuid(),
	/** How many times status has been polled; bounds the wait. */
	check: z.number().int().nonnegative(),
});
export type PublishStatusJob = z.infer<typeof publishStatusJobSchema>;

export const tokenRefreshJobSchema = z.object({ channelId: z.uuid() });
export type TokenRefreshJob = z.infer<typeof tokenRefreshJobSchema>;

/** Everything else (prompt, slides, style) is read from ai_generations.input when the job runs. */
export const aiMediaJobSchema = z.object({
	generationId: z.uuid(),
	organizationId: z.uuid(),
});
export type AiMediaJob = z.infer<typeof aiMediaJobSchema>;

export const maintenanceJobSchema = z.object({
	task: z.enum(["sweep-due-targets", "schedule-token-refresh", "recover-stuck-targets"]),
});
export type MaintenanceJob = z.infer<typeof maintenanceJobSchema>;

/**
 * `plan` (on a job scheduler) finds channels with metrics due and enqueues one
 * collect job per channel; the collect jobs call the platform. Per channel rather
 * than per target because platforms answer several posts in one call.
 */
export const analyticsJobSchema = z.discriminatedUnion("task", [
	z.object({ task: z.literal("plan") }),
	z.object({
		task: z.literal("collect-posts"),
		channelId: z.uuid(),
		/**
		 * Set by a user's "refresh now": collect every post still in the collection
		 * window (not only those due by age), skipping ones captured minutes ago.
		 */
		force: z.boolean().optional(),
	}),
	z.object({ task: z.literal("collect-account"), channelId: z.uuid() }),
]);
export type AnalyticsJob = z.infer<typeof analyticsJobSchema>;

/**
 * Research work. `crawl` runs one research_runs row (crawl → brand analysis). The
 * two planners (on weekly job schedulers) fan out one per-organization job each:
 * `visibility-org` asks every configured AI engine the org's prompts, `seo-refresh`
 * updates keyword metrics and Google rankings. `force` marks a user's "run now".
 */
export const researchJobSchema = z.discriminatedUnion("task", [
	z.object({ task: z.literal("crawl"), runId: z.uuid() }),
	z.object({ task: z.literal("visibility-plan") }),
	z.object({
		task: z.literal("visibility-org"),
		organizationId: z.uuid(),
		force: z.boolean().optional(),
	}),
	z.object({ task: z.literal("seo-plan") }),
	z.object({
		task: z.literal("seo-refresh"),
		organizationId: z.uuid(),
		force: z.boolean().optional(),
	}),
]);
export type ResearchJob = z.infer<typeof researchJobSchema>;

/**
 * `plan` (on a job scheduler) fans out: `sync-channel` reads new comments and
 * mentions for one channel, `listen` runs one keyword-listening query, `triage`
 * scores an organization's untriaged items with the text model.
 */
export const engagementJobSchema = z.discriminatedUnion("task", [
	z.object({ task: z.literal("plan") }),
	z.object({ task: z.literal("sync-channel"), channelId: z.uuid() }),
	z.object({ task: z.literal("listen"), queryId: z.uuid() }),
	z.object({ task: z.literal("triage"), organizationId: z.uuid() }),
]);
export type EngagementJob = z.infer<typeof engagementJobSchema>;

export const engagementReplyJobSchema = z.object({
	replyId: z.uuid(),
	organizationId: z.uuid(),
	/** Must equal engagement_replies.attempts when the job runs, or the job is stale. */
	version: z.number().int().nonnegative(),
});
export type EngagementReplyJob = z.infer<typeof engagementReplyJobSchema>;

/**
 * Deterministic job ids make enqueueing idempotent: scheduling the same target
 * twice (double click, API retry, sweep racing the original job) is a no-op in
 * BullMQ instead of a double post. The schedule version is part of the id so a
 * RESCHEDULE creates a new job (and the API removes the old one).
 */
export const jobIds = {
	publish: (targetId: string, scheduleVersion: number) => `publish.${targetId}.${scheduleVersion}`,
	publishStatus: (targetId: string, check: number) => `status.${targetId}.${check}`,
	aiMedia: (generationId: string) => `ai-media.${generationId}`,
	tokenRefresh: (channelId: string, expiresAtEpoch: number) =>
		`refresh.${channelId}.${expiresAtEpoch}`,
	/**
	 * Analytics ids carry a time bucket: every planner run within the bucket (and
	 * every replica) maps to the same id, so duplicates collapse while the finished
	 * job is retained, and the next bucket gets a fresh job.
	 */
	analyticsPosts: (channelId: string, hourBucket: number) =>
		`analytics.posts.${channelId}.${hourBucket}`,
	analyticsAccount: (channelId: string, utcDay: string) =>
		`analytics.account.${channelId}.${utcDay}`,
	/** User-requested refresh: its own 10-minute bucket so it is not swallowed by the hourly job. */
	analyticsRefresh: (kind: "posts" | "account", channelId: string, tenMinuteBucket: number) =>
		`analytics.refresh.${kind}.${channelId}.${tenMinuteBucket}`,
	/** One job per research run: a double submit or a replayed enqueue is a no-op. */
	researchCrawl: (runId: string) => `research.crawl.${runId}`,
	/**
	 * Scheduled per-org jobs carry the week number, so every planner run and replica
	 * in a week collapses onto one job; a forced run gets a 10-minute bucket of its own
	 * so it is not swallowed by that week's scheduled job.
	 */
	researchOrg: (kind: "visibility" | "seo", organizationId: string, weekBucket: number) =>
		`research.${kind}.${organizationId}.w${weekBucket}`,
	researchOrgForced: (
		kind: "visibility" | "seo",
		organizationId: string,
		tenMinuteBucket: number,
	) => `research.${kind}.${organizationId}.f${tenMinuteBucket}`,
	/** Per reply and version: enqueueing twice is a no-op; a requeue bumps the version. */
	engagementReply: (replyId: string, version: number) => `engagement-reply.${replyId}.${version}`,
	/**
	 * Inbox jobs carry a 10-minute bucket (the planner cadence): planner runs on every
	 * replica collapse onto one job per bucket.
	 */
	engagementSync: (channelId: string, bucket: number) => `engagement.sync.${channelId}.${bucket}`,
	/** A user's "sync now": its own bucket so it is not swallowed by the planner's job. */
	engagementSyncNow: (channelId: string, bucket: number) =>
		`engagement.sync-now.${channelId}.${bucket}`,
	engagementListen: (queryId: string, bucket: number) => `engagement.listen.${queryId}.${bucket}`,
	engagementTriage: (organizationId: string, bucket: number) =>
		`engagement.triage.${organizationId}.${bucket}`,
};

/** Bucket width for engagement job ids (see jobIds.engagementSync). */
export const ENGAGEMENT_BUCKET_MS = 10 * 60_000;

export const WEEK_MS = 7 * 24 * 3600_000;
