import type { BadgeTone } from "@socialfly/ui/components/badge";
import type { ChannelStatus, GenerationStatus, PostStatus } from "./api-types";

type StatusMeta = { label: string; tone: BadgeTone };

export const POST_STATUS: Record<PostStatus, StatusMeta> = {
	draft: { label: "Draft", tone: "neutral" },
	pending_approval: { label: "Pending approval", tone: "violet" },
	scheduled: { label: "Scheduled", tone: "info" },
	publishing: { label: "Publishing", tone: "warning" },
	published: { label: "Published", tone: "success" },
	partially_published: { label: "Partially published", tone: "warning" },
	failed: { label: "Failed", tone: "danger" },
	canceled: { label: "Canceled", tone: "neutral" },
};

export const GENERATION_STATUS: Record<GenerationStatus, StatusMeta> = {
	pending: { label: "Pending", tone: "neutral" },
	running: { label: "Running", tone: "info" },
	succeeded: { label: "Succeeded", tone: "success" },
	failed: { label: "Failed", tone: "danger" },
};

export const CHANNEL_STATUS: Record<ChannelStatus, StatusMeta> = {
	active: { label: "Active", tone: "success" },
	needs_reauth: { label: "Needs reconnect", tone: "warning" },
	disconnected: { label: "Disconnected", tone: "neutral" },
};

/** Status labels for maps typed by the server; unknown keys still render. */
export function statusMeta<K extends string>(map: Record<K, StatusMeta>, key: string): StatusMeta {
	return (map as Record<string, StatusMeta>)[key] ?? { label: key, tone: "neutral" };
}
