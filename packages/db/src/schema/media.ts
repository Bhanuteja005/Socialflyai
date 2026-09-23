import { bigint, index, integer, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { id, timestamps } from "./columns";
import { organizations } from "./organizations";

export const mediaKind = pgEnum("media_kind", ["image", "video", "document"]);
export const mediaStatus = pgEnum("media_status", ["pending_upload", "ready", "failed"]);

/**
 * Files live in object storage; this row is the index. Uploads go browser → storage
 * directly with a presigned URL (the API never proxies bytes), then the client
 * confirms and the row flips to `ready`.
 */
export const mediaAssets = pgTable(
	"media_assets",
	{
		id: id(),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		uploadedBy: uuid().references(() => users.id, { onDelete: "set null" }),
		storageKey: text().notNull(),
		fileName: text().notNull(),
		mimeType: text().notNull(),
		kind: mediaKind().notNull(),
		sizeBytes: bigint({ mode: "number" }).notNull(),
		width: integer(),
		height: integer(),
		durationMs: integer(),
		altText: text(),
		status: mediaStatus().notNull().default("pending_upload"),
		...timestamps(),
	},
	(t) => [index("media_org_created_idx").on(t.organizationId, t.createdAt)],
);
