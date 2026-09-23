"use client";

import { Avatar } from "@socialfly/ui/components/avatar";
import { Badge, type BadgeTone } from "@socialfly/ui/components/badge";
import { Tooltip } from "@socialfly/ui/components/controls";
import { cn } from "@socialfly/ui/utils";
import type { InboxItem, InboxKind, InboxReplyStatus, InboxSentiment, Role } from "@/lib/api-types";
import { isApiError } from "@/lib/errors";
import { ProviderIcon } from "../provider-icon";

// ── Views (tabs) ─────────────────────────────────────────────────────────────

export const VIEWS = [
	"open",
	"approvals",
	"discussions",
	"replied",
	"archived",
	"spam",
	"listening",
	"settings",
] as const;
export type InboxView = (typeof VIEWS)[number];

/** Views that show a filterable list of items with a conversation pane. */
export const LIST_VIEWS = ["open", "discussions", "replied", "archived", "spam"] as const;
export type ListView = (typeof LIST_VIEWS)[number];
export const isListView = (v: InboxView): v is ListView =>
	(LIST_VIEWS as readonly string[]).includes(v);

export const VIEW_LABEL: Record<InboxView, string> = {
	open: "Open",
	approvals: "Needs approval",
	discussions: "Discussions",
	replied: "Replied",
	archived: "Archived",
	spam: "Spam",
	listening: "Listening",
	settings: "Settings",
};

// ── Kinds & sentiment ───────────────────────────────────────────────────────

export const KIND_LABEL: Record<InboxKind, string> = {
	comment: "Comment",
	reply: "Reply",
	mention: "Mention",
	discussion: "Discussion",
};
/** Kinds addressed to us; discussions (found by listening) have their own tab. */
export const CONVERSATION_KINDS: InboxKind[] = ["comment", "reply", "mention"];

export const SENTIMENT: Record<InboxSentiment, { label: string; tone: BadgeTone }> = {
	positive: { label: "Positive", tone: "success" },
	neutral: { label: "Neutral", tone: "neutral" },
	negative: { label: "Negative", tone: "danger" },
	question: { label: "Question", tone: "info" },
};
export const SENTIMENTS = Object.keys(SENTIMENT) as InboxSentiment[];

export function SentimentBadge({ sentiment }: { sentiment: InboxSentiment | null }) {
	if (!sentiment) return null;
	const meta = SENTIMENT[sentiment];
	return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

// ── Relevance ───────────────────────────────────────────────────────────────

/** Bands match how the triage prompt scores: 70+ deserves an answer, under 40 is noise. */
export function relevanceBand(score: number): { label: string; tone: BadgeTone } {
	if (score >= 70) return { label: "High", tone: "success" };
	if (score >= 40) return { label: "Medium", tone: "warning" };
	return { label: "Low", tone: "neutral" };
}

export function RelevanceChip({
	relevance,
	reason,
}: {
	relevance: number | null;
	reason: string | null;
}) {
	if (relevance === null) return null;
	const band = relevanceBand(relevance);
	const chip = (
		<Badge tone={band.tone} className="tabular-nums" tabIndex={reason ? 0 : undefined}>
			{relevance}
			<span className="sr-only">
				{" "}
				relevance ({band.label.toLowerCase()}){reason ? `: ${reason}` : ""}
			</span>
		</Badge>
	);
	return reason ? <Tooltip content={`${band.label} relevance — ${reason}`}>{chip}</Tooltip> : chip;
}

// ── Reply statuses ──────────────────────────────────────────────────────────

export const REPLY_STATUS: Record<InboxReplyStatus, { label: string; tone: BadgeTone }> = {
	draft: { label: "Draft", tone: "neutral" },
	pending_approval: { label: "Pending approval", tone: "violet" },
	approved: { label: "Approved", tone: "info" },
	rejected: { label: "Rejected", tone: "danger" },
	queued: { label: "Queued", tone: "info" },
	sending: { label: "Sending", tone: "warning" },
	sent: { label: "Sent", tone: "success" },
	failed: { label: "Failed", tone: "danger" },
	unconfirmed: { label: "Unconfirmed", tone: "warning" },
};

export function ReplyStatusBadge({ status }: { status: InboxReplyStatus }) {
	const meta = REPLY_STATUS[status];
	return (
		<Badge tone={meta.tone} dot>
			{meta.label}
		</Badge>
	);
}

/** Small list indicator: what happened to our latest answer. */
export function ReplyIndicator({ reply }: { reply: InboxItem["latestReply"] }) {
	if (!reply) return null;
	if (reply.status === "sent") return <Badge tone="success">Replied</Badge>;
	if (reply.status === "draft") return <Badge tone="neutral">Draft</Badge>;
	if (reply.status === "pending_approval") return <Badge tone="violet">Pending</Badge>;
	if (reply.status === "failed" || reply.status === "unconfirmed" || reply.status === "rejected")
		return <Badge tone={REPLY_STATUS[reply.status].tone}>{REPLY_STATUS[reply.status].label}</Badge>;
	return <Badge tone="info">Sending</Badge>;
}

// ── Reply limits ────────────────────────────────────────────────────────────

/**
 * Longest reply each platform accepts. The API is the authority (a 422 carries the
 * real limit, which then replaces this); these only drive the live counter.
 */
const REPLY_LIMITS: Record<string, number> = {
	x: 280,
	threads: 500,
	linkedin: 1250,
	linkedin_page: 1250,
	instagram: 2200,
	facebook: 8000,
	youtube: 10000,
	reddit: 10000,
};
export const replyLimit = (provider: string) => REPLY_LIMITS[provider] ?? 2000;

/** The limit a 422 "too long" answer reports, if any. */
export function limitFromError(error: unknown): number | null {
	if (!isApiError(error) || error.status !== 422) return null;
	const d = error.details ?? {};
	for (const key of ["limit", "maxLength", "max", "maxReplyLength"]) {
		const n = Number(d[key]);
		if (Number.isFinite(n) && n > 0) return n;
	}
	return null;
}

// ── Roles ───────────────────────────────────────────────────────────────────

/** What the primary reply button says for this person under the current settings. */
export function submitLabel(role: Role, approvalRequired: boolean | undefined) {
	if (role === "admin" || role === "owner") return "Send reply";
	if (approvalRequired === true) return "Submit for approval";
	if (approvalRequired === false) return "Send reply";
	return "Submit reply";
}

// ── Authors ─────────────────────────────────────────────────────────────────

export const authorName = (a: InboxItem["author"]) =>
	a.name ?? (a.handle ? `@${a.handle}` : "Someone");

export function AuthorAvatar({
	item,
	size = "sm",
}: {
	item: Pick<InboxItem, "author" | "provider">;
	size?: "sm" | "md";
}) {
	return (
		<Avatar
			src={item.author.avatarUrl}
			name={authorName(item.author)}
			size={size}
			badge={<ProviderIcon provider={item.provider} size="xs" />}
		/>
	);
}

export function AuthorLine({
	item,
	className,
}: {
	item: Pick<InboxItem, "author">;
	className?: string;
}) {
	const { author } = item;
	const name = authorName(author);
	const handle = author.handle && author.name ? `@${author.handle}` : null;
	return (
		<span className={cn("flex min-w-0 items-baseline gap-1.5", className)}>
			{author.profileUrl ? (
				<a
					href={author.profileUrl}
					target="_blank"
					rel="noreferrer"
					className="truncate font-medium text-sm hover:underline"
				>
					{name}
				</a>
			) : (
				<span className="truncate font-medium text-sm">{name}</span>
			)}
			{handle ? <span className="truncate text-muted-foreground text-xs">{handle}</span> : null}
		</span>
	);
}
