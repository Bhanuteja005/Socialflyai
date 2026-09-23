import { cn } from "@socialfly/ui/utils";
import type { PostDetail } from "@/lib/api-types";
import { formatDateTime, formatRelative } from "@/lib/format";

const TONE: Record<string, string> = {
	published: "bg-success",
	failed: "bg-danger",
	unconfirmed: "bg-warning",
	scheduled: "bg-info",
	retry_requested: "bg-info",
};

const humanize = (type: string) => {
	const text = type.replace(/_/g, " ");
	return text.charAt(0).toUpperCase() + text.slice(1);
};

export function PostTimeline({ post, timeZone }: { post: PostDetail; timeZone: string }) {
	const channelOf = new Map(post.targets.map((t) => [t.id, t.channel.name]));
	const events = [...post.events].reverse();
	if (events.length === 0) {
		return <p className="text-muted-foreground text-sm">Nothing has happened yet.</p>;
	}
	return (
		<ol className="relative grid gap-4 border-border border-l pl-5">
			{events.map((e) => (
				<li key={`${e.targetId}-${e.createdAt}-${e.type}`} className="relative grid gap-0.5">
					<span
						className={cn(
							"absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-surface-raised",
							TONE[e.type] ?? "bg-border-strong",
						)}
						aria-hidden="true"
					/>
					<p className="text-sm">
						<span className="font-medium">{humanize(e.type)}</span>
						<span className="text-muted-foreground">
							{" "}
							· {channelOf.get(e.targetId) ?? "Channel"}
						</span>
					</p>
					{e.message ? <p className="text-muted-foreground text-xs">{e.message}</p> : null}
					<time
						dateTime={e.createdAt}
						className="text-subtle-foreground text-xs"
						title={formatRelative(e.createdAt)}
					>
						{formatDateTime(e.createdAt, timeZone)}
					</time>
				</li>
			))}
		</ol>
	);
}
