import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ChannelStatus, PostStatus, TargetStatus } from "@/lib/api-types";
import { POST_STATUS, TARGET_STATUS } from "@/lib/status";
import { ProviderIcon } from "./provider-icon";

export function PostStatusBadge({ status }: { status: PostStatus }) {
	const meta = POST_STATUS[status];
	return (
		<Badge tone={meta.tone} dot>
			{meta.label}
		</Badge>
	);
}

export function TargetStatusBadge({ status }: { status: TargetStatus }) {
	const meta = TARGET_STATUS[status];
	return (
		<Badge tone={meta.tone} dot>
			{meta.label}
		</Badge>
	);
}

export function ChannelStatusBadge({ status }: { status: ChannelStatus }) {
	if (status === "active")
		return (
			<Badge tone="success" dot>
				Active
			</Badge>
		);
	if (status === "needs_reauth")
		return (
			<Badge tone="warning" dot>
				Needs reconnect
			</Badge>
		);
	return (
		<Badge tone="neutral" dot>
			Disconnected
		</Badge>
	);
}

/** Channel avatar with its platform badge in the corner. */
export function ChannelAvatar({
	channel,
	size = "md",
}: {
	channel: { name: string; avatarUrl: string | null; provider: string };
	size?: "sm" | "md" | "lg";
}) {
	return (
		<Avatar
			src={channel.avatarUrl}
			name={channel.name}
			size={size}
			badge={<ProviderIcon provider={channel.provider} size={size === "lg" ? "sm" : "xs"} />}
		/>
	);
}
