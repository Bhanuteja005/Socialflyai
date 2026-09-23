import { and, type Database, eq, schema, sql } from "@socialfly/db";

const { engagementReplies, engagementItems } = schema;

export type ReplyRow = typeof engagementReplies.$inferSelect;
type Ref = { id: string };

/** Longer than any reply call (adapters time out well under a minute): the sender died. */
export const STUCK_SENDING_MS = 10 * 60_000;

/**
 * Every write to a reply's SENDING state goes through here (queued → sending → sent |
 * failed | unconfirmed, and back to queued for a retry). The only other writer of
 * engagement_replies.status is the API's inbox service, which owns the states before a
 * reply is queued (draft, pending_approval, approved, rejected) and manual retries —
 * the same split as post_targets (see publishing/target-state.ts).
 */
export class ReplyState {
	constructor(private readonly db: Database) {}

	/**
	 * Takes ownership of a queued reply for this job. The conditional UPDATE is what makes
	 * duplicate or stale jobs harmless: it requires the reply to still be queued AND the
	 * job's version to equal the reply's attempt count, and bumps that count, so exactly
	 * one job per queueing can ever send.
	 */
	async claim(replyId: string, version: number): Promise<ReplyRow | null> {
		const [row] = await this.db
			.update(engagementReplies)
			.set({ status: "sending", attempts: sql`${engagementReplies.attempts} + 1` })
			.where(
				and(
					eq(engagementReplies.id, replyId),
					eq(engagementReplies.status, "queued"),
					eq(engagementReplies.attempts, version),
				),
			)
			.returning();
		return row ?? null;
	}

	/**
	 * Sent: the reply carries the platform's id and link, the item it answers is
	 * "replied", and our reply joins the thread right away (as a from-self item, which the
	 * next sync would have added anyway — the unique key makes that a no-op).
	 */
	async sent(
		reply: ReplyRow,
		result: { externalId: string; url: string | null },
		thread: {
			organizationId: string;
			channelId: string;
			provider: string;
			postExternalId: string | null;
			parentExternalId: string;
			postTargetId: string | null;
			author: typeof engagementItems.$inferInsert.author;
		},
	) {
		await this.db.transaction(async (tx) => {
			const now = new Date();
			await tx
				.update(engagementReplies)
				.set({
					status: "sent",
					externalId: result.externalId,
					externalUrl: result.url,
					sentAt: now,
					errorCode: null,
					errorMessage: null,
				})
				.where(eq(engagementReplies.id, reply.id));
			await tx
				.update(engagementItems)
				.set({ status: "replied" })
				.where(eq(engagementItems.id, reply.itemId));
			await tx
				.insert(engagementItems)
				.values({
					organizationId: thread.organizationId,
					channelId: thread.channelId,
					provider: thread.provider,
					kind: "reply",
					externalId: result.externalId,
					postExternalId: thread.postExternalId,
					parentExternalId: thread.parentExternalId,
					postTargetId: thread.postTargetId,
					author: thread.author,
					fromSelf: true,
					text: reply.text,
					url: result.url,
					postedAt: now,
					status: "read",
				})
				.onConflictDoNothing({ target: [engagementItems.channelId, engagementItems.externalId] });
		});
	}

	async failed(reply: Ref, code: string, message: string) {
		await this.db
			.update(engagementReplies)
			.set({ status: "failed", errorCode: code, errorMessage: message.slice(0, 1000) })
			.where(eq(engagementReplies.id, reply.id));
	}

	/** The platform may have posted it. Never retried automatically: the user checks first. */
	async unconfirmed(reply: Ref, message: string) {
		await this.db
			.update(engagementReplies)
			.set({
				status: "unconfirmed",
				errorCode: "outcome_unknown",
				errorMessage: `${message}. Check the platform before retrying — the reply may already be live.`,
			})
			.where(eq(engagementReplies.id, reply.id));
	}

	/**
	 * Back to `queued` for an automatic retry (the platform refused before accepting it).
	 * Returns the version the next job must carry, or null if the reply moved on.
	 */
	async requeue(reply: Ref, reason: string): Promise<number | null> {
		const [row] = await this.db
			.update(engagementReplies)
			.set({ status: "queued", errorCode: "retrying", errorMessage: reason.slice(0, 1000) })
			.where(and(eq(engagementReplies.id, reply.id), eq(engagementReplies.status, "sending")))
			.returning({ attempts: engagementReplies.attempts });
		return row?.attempts ?? null;
	}

	/** Replies left in `sending` by a dead worker become unconfirmed (maintenance). */
	async recoverStuck(olderThanMs = STUCK_SENDING_MS) {
		return this.db
			.update(engagementReplies)
			.set({
				status: "unconfirmed",
				errorCode: "outcome_unknown",
				errorMessage:
					"The reply worker stopped mid-send. Check the platform before retrying — the reply may already be live.",
			})
			.where(
				and(
					eq(engagementReplies.status, "sending"),
					sql`${engagementReplies.updatedAt} < now() - make_interval(secs => ${olderThanMs / 1000})`,
				),
			)
			.returning({ id: engagementReplies.id });
	}
}
