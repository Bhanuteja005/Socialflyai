import {
	and,
	type Database,
	eq,
	inArray,
	recordTargetEvent,
	rollUpPostStatus,
	schema,
	sql,
} from "@socialfly/db";

const { postTargets } = schema;

/**
 * Every write to a target's publishing state goes through here: status change,
 * timeline event and post roll-up, in ONE transaction. The API never writes these
 * states and the processors never write post_targets directly.
 */
export class TargetState {
	constructor(private readonly db: Database) {}

	/**
	 * Atomically take ownership of a target for this job. Succeeds only if the
	 * target is still waiting AND the job's schedule version is current. This
	 * single conditional UPDATE is what makes duplicate jobs (sweep re-enqueue,
	 * BullMQ stall recovery, a reschedule racing an old job) harmless: exactly one
	 * of them can win, the rest see no row and exit.
	 */
	async claim(targetId: string, scheduleVersion: number) {
		return this.db.transaction(async (tx) => {
			const [row] = await tx
				.update(postTargets)
				.set({ status: "publishing", attempts: sql`${postTargets.attempts} + 1` })
				.where(
					and(
						eq(postTargets.id, targetId),
						eq(postTargets.scheduleVersion, scheduleVersion),
						inArray(postTargets.status, ["scheduled", "queued"]),
					),
				)
				.returning();
			if (!row) return null;
			await recordTargetEvent(tx, targetId, "publishing", `Attempt ${row.attempts}`);
			await rollUpPostStatus(tx, row.postId);
			return row;
		});
	}

	async published(
		target: { id: string; postId: string },
		result: { externalId: string; url: string | null },
	) {
		await this.transition(target, "published", "Published", {
			externalId: result.externalId,
			externalUrl: result.url,
			publishedAt: new Date(),
			pendingData: null,
			errorCode: null,
			errorMessage: null,
		});
	}

	async processing(target: { id: string; postId: string }, pendingData: Record<string, unknown>) {
		await this.transition(target, "processing", "Accepted — the platform is processing the media", {
			pendingData,
		});
	}

	/** Update in-flight processing state without a status change (e.g. carousel parent created). */
	async updatePending(targetId: string, pendingData: Record<string, unknown>) {
		await this.db.update(postTargets).set({ pendingData }).where(eq(postTargets.id, targetId));
	}

	async failed(target: { id: string; postId: string }, code: string, message: string) {
		await this.transition(target, "failed", message, { errorCode: code, errorMessage: message });
	}

	async unconfirmed(target: { id: string; postId: string }, message: string) {
		await this.transition(target, "unconfirmed", message, {
			errorCode: "outcome_unknown",
			errorMessage: `${message}. Check the platform before retrying — it may already be live.`,
		});
	}

	/** Back to `scheduled` for a retry. Returns the new version so the caller can enqueue it. */
	async rescheduleForRetry(
		target: { id: string; postId: string },
		runAt: Date,
		reason: string,
	): Promise<number> {
		return this.db.transaction(async (tx) => {
			const [row] = await tx
				.update(postTargets)
				.set({
					status: "scheduled",
					scheduledAt: runAt,
					scheduleVersion: sql`${postTargets.scheduleVersion} + 1`,
					errorMessage: reason,
				})
				.where(eq(postTargets.id, target.id))
				.returning({ scheduleVersion: postTargets.scheduleVersion });
			await recordTargetEvent(
				tx,
				target.id,
				"retry_scheduled",
				`${reason} — retrying at ${runAt.toISOString()}`,
			);
			await rollUpPostStatus(tx, target.postId);
			if (!row) throw new Error(`target ${target.id} vanished`);
			return row.scheduleVersion;
		});
	}

	private async transition(
		target: { id: string; postId: string },
		status: (typeof schema.targetStatus.enumValues)[number],
		message: string,
		fields: Partial<typeof postTargets.$inferInsert>,
	) {
		await this.db.transaction(async (tx) => {
			await tx
				.update(postTargets)
				.set({ status, ...fields })
				.where(eq(postTargets.id, target.id));
			await recordTargetEvent(tx, target.id, status, message);
			await rollUpPostStatus(tx, target.postId);
		});
	}
}
