import type { AdsProvider } from "@socialfly/integrations";
import type { AdCampaignState, CampaignRow, CampaignStatus } from "./campaign-state.ts";

type PlatformStatus = Awaited<ReturnType<AdsProvider["getCampaignStatus"]>>;

/**
 * Maps what the platform reports onto our status. A user can pause, resume or delete a
 * campaign in the platform's own ads manager, and platforms reject campaigns in review:
 * the platform is the truth for a created campaign. `in_review` changes nothing (the
 * campaign stays paused or active as far as we are concerned; platformStatus shows it).
 * A campaign past its end date that the platform still lists is completed.
 */
export function nextStatus(
	row: Pick<CampaignRow, "status" | "endAt">,
	platform: PlatformStatus,
	now = new Date(),
): { status: CampaignStatus; rejected?: true } {
	const ended = row.endAt !== null && row.endAt.getTime() < now.getTime();
	switch (platform) {
		case "active":
			return { status: ended ? "completed" : "active" };
		case "paused":
			return { status: ended ? "completed" : "paused" };
		case "archived":
		case "deleted":
			return { status: "archived" };
		case "rejected":
			return { status: "failed", rejected: true };
		case "in_review":
			return { status: row.status };
	}
}

/**
 * Writes a platform status read. A `status_unconfirmed` flag is cleared once the platform
 * has answered — unless the answer contradicts the change we tried (`confirms`), in which
 * case the flag stays with an explanation so the user decides whether to try again.
 */
export async function reconcileStatus(
	state: AdCampaignState,
	row: CampaignRow,
	platform: PlatformStatus,
	opts: { confirms?: CampaignStatus; now?: Date } = {},
) {
	const next = nextStatus(row, platform, opts.now);
	if (next.rejected) {
		return state.reconcile(row, platform, {
			status: "failed",
			errorCode: "rejected_by_platform",
			errorMessage:
				"The platform rejected this campaign in review — see the ads manager for the reason",
		});
	}
	const flagged = row.errorCode === "status_unconfirmed";
	if (!flagged) return state.reconcile(row, platform, { status: next.status });
	const confirmed = opts.confirms === undefined || opts.confirms === next.status;
	return state.reconcile(
		row,
		platform,
		confirmed
			? { status: next.status, errorCode: null }
			: {
					status: next.status,
					errorCode: "status_unconfirmed",
					errorMessage: `The change could not be confirmed and the platform reports the campaign as ${platform} — try again if needed`,
				},
	);
}
