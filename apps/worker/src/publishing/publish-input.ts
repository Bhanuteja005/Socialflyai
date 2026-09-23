import { and, asc, type Database, eq, schema } from "@socialfly/db";
import type { MediaItem, PublishInput } from "@socialfly/integrations";

const { posts, postMedia, mediaAssets, channels } = schema;

export type TargetRow = typeof schema.postTargets.$inferSelect;

/**
 * Builds what the adapter sees from CURRENT database state — never from the job
 * payload — so a post edited after scheduling publishes as it is now.
 */
export async function loadPublishContext(db: Database, target: TargetRow, publicBaseUrl: string) {
	const [post] = await db
		.select()
		.from(posts)
		.where(and(eq(posts.id, target.postId), eq(posts.organizationId, target.organizationId)))
		.limit(1);
	const [channel] = await db
		.select()
		.from(channels)
		.where(eq(channels.id, target.channelId))
		.limit(1);
	const media = await db
		.select({ asset: mediaAssets })
		.from(postMedia)
		.innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaId))
		.where(eq(postMedia.postId, target.postId))
		.orderBy(asc(postMedia.position));

	const base = publicBaseUrl.replace(/\/+$/, "");
	const input: PublishInput = {
		text: target.contentOverride ?? post?.content ?? "",
		settings: target.settings,
		media: media.map(
			({ asset }): MediaItem => ({
				url: `${base}/${asset.storageKey}`,
				kind: asset.kind === "video" ? "video" : "image",
				mimeType: asset.mimeType,
				sizeBytes: asset.sizeBytes,
				width: asset.width,
				height: asset.height,
				durationMs: asset.durationMs,
				altText: asset.altText,
			}),
		),
	};
	return { post, channel, input };
}
