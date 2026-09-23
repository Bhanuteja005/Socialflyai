import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../client";
import { posts, postTargetEvents, postTargets, type targetStatus } from "../schema";

type TargetStatus = (typeof targetStatus.enumValues)[number];
type PostStatus = (typeof posts.status.enumValues)[number];

/**
 * A post's status is DERIVED from its targets; this is the one definition of how.
 * Called after every target transition (API and worker), inside the same
 * transaction, so the post row never disagrees with its targets.
 */
export function derivePostStatus(statuses: TargetStatus[], current: PostStatus): PostStatus {
	if (statuses.length === 0) return current === "pending_approval" ? current : "draft";
	const all = (s: TargetStatus) => statuses.every((t) => t === s);
	const any = (...s: TargetStatus[]) => statuses.some((t) => s.includes(t));

	if (all("draft")) return current === "pending_approval" ? current : "draft";
	if (all("canceled")) return "canceled";
	if (any("queued", "publishing", "processing")) return "publishing";
	if (any("scheduled", "draft")) return any("published") ? "publishing" : "scheduled";

	// Everything is terminal from here on.
	const live = statuses.filter((s) => s !== "canceled");
	if (live.every((s) => s === "published")) return "published";
	if (live.some((s) => s === "published")) return "partially_published";
	return "failed"; // failed and/or unconfirmed only
}

export async function rollUpPostStatus(db: DbOrTx, postId: string): Promise<PostStatus> {
	const [post] = await db.select({ status: posts.status }).from(posts).where(eq(posts.id, postId));
	if (!post) throw new Error(`post ${postId} not found`);
	const rows = await db
		.select({ status: postTargets.status })
		.from(postTargets)
		.where(eq(postTargets.postId, postId));
	const next = derivePostStatus(
		rows.map((r) => r.status),
		post.status,
	);
	if (next !== post.status)
		await db
			.update(posts)
			.set({ status: next })
			.where(and(eq(posts.id, postId)));
	return next;
}

/** Append to a target's timeline (shown in the post detail view and used for support). */
export async function recordTargetEvent(
	db: DbOrTx,
	targetId: string,
	type: string,
	message?: string,
	data?: Record<string, unknown>,
) {
	await db.insert(postTargetEvents).values({ targetId, type, message, data });
}
