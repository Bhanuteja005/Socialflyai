import { apiEnv as env } from "@socialfly/config";
import { AppError, badRequest, conflict, notFound } from "@socialfly/core/errors";
import { newId } from "@socialfly/core/ids";
import { and, type Database, desc, eq, lt, schema } from "@socialfly/db";
import type { S3Client } from "bun";

const { mediaAssets } = schema;
type AssetRow = typeof mediaAssets.$inferSelect;

/** What the composer accepts at all; each platform narrows this further (see capabilities). */
const ACCEPTED: Record<string, "image" | "video"> = {
	"image/jpeg": "image",
	"image/png": "image",
	"image/gif": "image",
	"image/webp": "image",
	"video/mp4": "video",
	"video/quicktime": "video",
};

const UPLOAD_URL_TTL_SECONDS = 15 * 60;

export const publicUrl = (key: string) => `${env.S3_PUBLIC_URL.replace(/\/+$/, "")}/${key}`;

export const toMediaDto = (a: AssetRow) => ({
	id: a.id,
	fileName: a.fileName,
	mimeType: a.mimeType,
	kind: a.kind,
	sizeBytes: a.sizeBytes,
	width: a.width,
	height: a.height,
	durationMs: a.durationMs,
	altText: a.altText,
	status: a.status,
	/** "ai" when produced by a generation — the library badges and filters on it. */
	source: a.source,
	url: publicUrl(a.storageKey),
	createdAt: a.createdAt.toISOString(),
});

export class MediaService {
	constructor(
		private readonly db: Database,
		private readonly storage: S3Client,
	) {}

	/**
	 * Step 1 of an upload: reserve a row and hand the browser a presigned PUT URL.
	 * The file goes browser → storage directly; the API never proxies bytes.
	 */
	async createUpload(
		orgId: string,
		userId: string,
		input: { fileName: string; mimeType: string; sizeBytes: number },
	) {
		const kind = ACCEPTED[input.mimeType];
		if (!kind) throw badRequest(`${input.mimeType} files are not supported`);
		if (input.sizeBytes > env.MEDIA_MAX_UPLOAD_MB * 1024 * 1024) {
			throw badRequest(`Files must be under ${env.MEDIA_MAX_UPLOAD_MB} MB`);
		}

		const id = newId();
		const safeName = input.fileName.replace(/[^\w.-]+/g, "_").slice(-100) || "file";
		const storageKey = `orgs/${orgId}/media/${id}/${safeName}`;
		const [asset] = (await this.db
			.insert(mediaAssets)
			.values({
				id,
				organizationId: orgId,
				uploadedBy: userId,
				storageKey,
				fileName: input.fileName.slice(0, 255),
				mimeType: input.mimeType,
				kind,
				sizeBytes: input.sizeBytes,
			})
			.returning()) as [AssetRow];

		const uploadUrl = this.storage.presign(storageKey, {
			method: "PUT",
			expiresIn: UPLOAD_URL_TTL_SECONDS,
			type: input.mimeType,
		});
		return {
			asset: toMediaDto(asset),
			upload: { url: uploadUrl, method: "PUT", headers: { "Content-Type": input.mimeType } },
		};
	}

	/**
	 * Step 2: the browser reports the upload finished (plus dimensions it measured).
	 * We confirm the object really exists and matches the declared size before
	 * marking it usable — the client's word alone is not enough.
	 */
	async completeUpload(
		orgId: string,
		id: string,
		dims: { width?: number; height?: number; durationMs?: number },
	) {
		const asset = await this.get(orgId, id);
		if (asset.status === "ready") return toMediaDto(asset);

		const stat = await this.storage
			.file(asset.storageKey)
			.stat()
			.catch(() => null);
		if (!stat) throw new AppError(409, "upload_missing", "The file has not finished uploading");
		if (stat.size !== asset.sizeBytes) {
			await this.db.update(mediaAssets).set({ status: "failed" }).where(eq(mediaAssets.id, id));
			throw new AppError(
				409,
				"upload_size_mismatch",
				"The uploaded file does not match what was declared",
			);
		}

		const [row] = (await this.db
			.update(mediaAssets)
			.set({ status: "ready", width: dims.width, height: dims.height, durationMs: dims.durationMs })
			.where(eq(mediaAssets.id, id))
			.returning()) as [AssetRow];
		return toMediaDto(row);
	}

	/**
	 * Keyset pagination on id — UUIDv7 ids are time-ordered, so this is newest-first,
	 * stable under concurrent inserts, and O(page) at any depth (unlike OFFSET).
	 */
	async list(orgId: string, opts: { kind?: "image" | "video"; before?: string; limit: number }) {
		const rows = await this.db
			.select()
			.from(mediaAssets)
			.where(
				and(
					eq(mediaAssets.organizationId, orgId),
					eq(mediaAssets.status, "ready"),
					opts.kind ? eq(mediaAssets.kind, opts.kind) : undefined,
					opts.before ? lt(mediaAssets.id, opts.before) : undefined,
				),
			)
			.orderBy(desc(mediaAssets.id))
			.limit(opts.limit + 1);
		const page = rows.slice(0, opts.limit);
		return {
			items: page.map(toMediaDto),
			nextCursor: rows.length > opts.limit ? (page.at(-1)?.id ?? null) : null,
		};
	}

	async updateAltText(orgId: string, id: string, altText: string | null) {
		await this.get(orgId, id);
		const [row] = (await this.db
			.update(mediaAssets)
			.set({ altText })
			.where(eq(mediaAssets.id, id))
			.returning()) as [AssetRow];
		return toMediaDto(row);
	}

	async remove(orgId: string, id: string) {
		const asset = await this.get(orgId, id);
		try {
			await this.db.delete(mediaAssets).where(eq(mediaAssets.id, id));
		} catch (error) {
			const e = error as { code?: string; cause?: { code?: string } };
			if (e.code === "23503" || e.cause?.code === "23503") {
				throw conflict(
					"This file is used by a post — remove it from the post first",
					"media_in_use",
				);
			}
			throw error;
		}
		await this.storage.delete(asset.storageKey).catch(() => {});
	}

	private async get(orgId: string, id: string) {
		const [asset] = await this.db
			.select()
			.from(mediaAssets)
			.where(and(eq(mediaAssets.id, id), eq(mediaAssets.organizationId, orgId)))
			.limit(1);
		if (!asset) throw notFound("Media");
		return asset;
	}
}
