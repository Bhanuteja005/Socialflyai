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

export const QUEUES = {
	/** Polls targets in `processing` (IG/Threads/YouTube async media) until done. */
	publishStatus: "publish-status",
	/** Refreshes channel OAuth tokens shortly before they expire. */
	tokenRefresh: "token-refresh",
	/** Periodic safety net: re-enqueues due targets whose delayed job went missing. */
	maintenance: "maintenance",
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

export const maintenanceJobSchema = z.object({
	task: z.enum(["sweep-due-targets", "schedule-token-refresh", "recover-stuck-targets"]),
});
export type MaintenanceJob = z.infer<typeof maintenanceJobSchema>;

/**
 * Deterministic job ids make enqueueing idempotent: scheduling the same target
 * twice (double click, API retry, sweep racing the original job) is a no-op in
 * BullMQ instead of a double post. The schedule version is part of the id so a
 * RESCHEDULE creates a new job (and the API removes the old one).
 */
export const jobIds = {
	publish: (targetId: string, scheduleVersion: number) => `publish.${targetId}.${scheduleVersion}`,
	publishStatus: (targetId: string, check: number) => `status.${targetId}.${check}`,
	tokenRefresh: (channelId: string, expiresAtEpoch: number) =>
		`refresh.${channelId}.${expiresAtEpoch}`,
};
