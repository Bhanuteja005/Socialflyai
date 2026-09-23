import { and, type Database, eq, inArray, schema } from "@socialfly/db";
import type { AdDraft, CampaignDraft, MediaItem, Targeting } from "@socialfly/integrations";
import type { CampaignRow } from "./campaign-state.ts";

const { mediaAssets, organizations } = schema;

/** The stored draft: CampaignDraft's targeting and ads, with media as our media ids. */
export type StoredDraft = {
	targeting: Targeting;
	ads: (Omit<AdDraft, "media"> & { mediaIds: string[] })[];
};

/**
 * Rebuilds the adapter's CampaignDraft from CURRENT database state — media ids resolved
 * to public URLs, the organization's ready media only (never another tenant's asset,
 * never a half-uploaded one). Returns the ids that could not be resolved instead.
 */
export async function buildCampaignDraft(
	db: Database,
	campaign: CampaignRow,
	publicBaseUrl: string,
): Promise<{ draft: CampaignDraft } | { missingMedia: string[] }> {
	const stored = campaign.draft as unknown as StoredDraft;
	const ids = [...new Set(stored.ads.flatMap((a) => a.mediaIds))];
	const rows = ids.length
		? await db
				.select()
				.from(mediaAssets)
				.where(
					and(
						inArray(mediaAssets.id, ids),
						eq(mediaAssets.organizationId, campaign.organizationId),
						eq(mediaAssets.status, "ready"),
					),
				)
		: [];
	const byId = new Map(rows.map((r) => [r.id, r]));
	const missing = ids.filter((id) => !byId.has(id));
	if (missing.length) return { missingMedia: missing };

	const base = publicBaseUrl.replace(/\/+$/, "");
	const media = (id: string): MediaItem => {
		const asset = byId.get(id) as (typeof rows)[number];
		return {
			url: `${base}/${asset.storageKey}`,
			kind: asset.kind === "video" ? "video" : "image",
			mimeType: asset.mimeType,
			sizeBytes: asset.sizeBytes,
			width: asset.width,
			height: asset.height,
			durationMs: asset.durationMs,
			altText: asset.altText,
		};
	};
	return {
		draft: {
			name: campaign.name,
			objective: campaign.objective as CampaignDraft["objective"],
			...(campaign.dailyBudget !== null ? { dailyBudget: campaign.dailyBudget } : {}),
			...(campaign.lifetimeBudget !== null ? { lifetimeBudget: campaign.lifetimeBudget } : {}),
			startAt: campaign.startAt.toISOString(),
			endAt: campaign.endAt?.toISOString() ?? null,
			targeting: stored.targeting,
			ads: stored.ads.map(({ mediaIds, ...ad }) => ({ ...ad, media: mediaIds.map(media) })),
		},
	};
}

/**
 * The daily-budget ceiling for an organization: the lower of the server's
 * ADS_MAX_DAILY_BUDGET and the organization's own limit; null = none. The worker's copy
 * of the API rule (apps/api/src/modules/ads/ads.shared.ts), checked again right before
 * spending starts — defence in depth against a ceiling lowered after approval.
 */
export async function dailyCeiling(db: Database, orgId: string, serverCeiling: number) {
	const [org] = await db
		.select({ ceiling: organizations.adsMaxDailyBudget })
		.from(organizations)
		.where(eq(organizations.id, orgId))
		.limit(1);
	const limits = [serverCeiling > 0 ? serverCeiling : null, org?.ceiling ?? null].filter(
		(n): n is number => n !== null && n > 0,
	);
	return limits.length ? Math.min(...limits) : null;
}

/** Average daily spend a campaign allows: its daily budget, or lifetime ÷ days (at least 1). */
export function dailyEquivalent(c: {
	dailyBudget: number | null;
	lifetimeBudget: number | null;
	startAt: Date;
	endAt: Date | null;
}) {
	if (c.dailyBudget !== null) return c.dailyBudget;
	if (c.lifetimeBudget === null) return 0;
	const days = c.endAt
		? Math.max(1, Math.ceil((c.endAt.getTime() - c.startAt.getTime()) / 86_400_000))
		: 1;
	return c.lifetimeBudget / days;
}
