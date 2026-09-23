import type { BadgeTone } from "@/components/ui/badge";
import type { PostStatus, Role, TargetStatus } from "./api-types";

type StatusMeta = { label: string; tone: BadgeTone /** Calendar / dot colour */; dot: string };

export const POST_STATUS: Record<PostStatus, StatusMeta> = {
	draft: { label: "Draft", tone: "neutral", dot: "bg-subtle-foreground" },
	pending_approval: { label: "Pending approval", tone: "violet", dot: "bg-violet" },
	scheduled: { label: "Scheduled", tone: "info", dot: "bg-info" },
	publishing: { label: "Publishing", tone: "warning", dot: "bg-warning" },
	published: { label: "Published", tone: "success", dot: "bg-success" },
	partially_published: { label: "Partially published", tone: "warning", dot: "bg-warning" },
	failed: { label: "Failed", tone: "danger", dot: "bg-danger" },
	canceled: { label: "Canceled", tone: "neutral", dot: "bg-border-strong" },
};

export const TARGET_STATUS: Record<TargetStatus, StatusMeta> = {
	draft: { label: "Draft", tone: "neutral", dot: "bg-subtle-foreground" },
	scheduled: { label: "Scheduled", tone: "info", dot: "bg-info" },
	queued: { label: "Queued", tone: "info", dot: "bg-info" },
	publishing: { label: "Publishing", tone: "warning", dot: "bg-warning" },
	processing: { label: "Processing", tone: "warning", dot: "bg-warning" },
	published: { label: "Published", tone: "success", dot: "bg-success" },
	failed: { label: "Failed", tone: "danger", dot: "bg-danger" },
	unconfirmed: { label: "Unconfirmed", tone: "warning", dot: "bg-warning" },
	canceled: { label: "Canceled", tone: "neutral", dot: "bg-border-strong" },
};

export const POST_STATUSES = Object.keys(POST_STATUS) as PostStatus[];

/** Once any target is in one of these states the API refuses edits (409 post_locked). */
export const LOCKED_TARGET_STATUSES: TargetStatus[] = [
	"queued",
	"publishing",
	"processing",
	"published",
];

export const isPostEditable = (post: { targets: { status: TargetStatus }[] }) =>
	!post.targets.some((t) => LOCKED_TARGET_STATUSES.includes(t.status));

export const RETRYABLE_TARGET_STATUSES: TargetStatus[] = ["failed", "unconfirmed"];

const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

/** `can(role, "editor")` is true for editors, admins and owners. */
export const can = (role: Role | undefined, minimum: Role) =>
	role !== undefined && RANK[role] >= RANK[minimum];

export const ROLE_LABEL: Record<Role, string> = {
	owner: "Owner",
	admin: "Admin",
	editor: "Editor",
	viewer: "Viewer",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
	owner: "Full access, including billing and deleting the organization.",
	admin: "Manage channels, team members and settings.",
	editor: "Create, schedule and publish posts and upload media.",
	viewer: "Read-only access to the calendar and posts.",
};
