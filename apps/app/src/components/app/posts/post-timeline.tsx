import { cn } from "@socialfly/ui/utils";
import {
	AlertTriangle,
	CalendarClock,
	CheckCircle2,
	Circle,
	type LucideIcon,
	RotateCcw,
	Send,
	XCircle,
} from "lucide-react";
import type { PostDetail } from "@/lib/api-types";
import { formatDateTime, formatRelative } from "@/lib/format";

const TONE: Record<string, { icon: LucideIcon; className: string }> = {
	// Status tints only the icon; the marker itself stays neutral (monochrome UI).
	published: { icon: CheckCircle2, className: "text-success" },
	failed: { icon: XCircle, className: "text-danger" },
	unconfirmed: { icon: AlertTriangle, className: "text-warning" },
	scheduled: { icon: CalendarClock, className: "text-foreground" },
	retry_requested: { icon: RotateCcw, className: "text-foreground" },
	publishing: { icon: Send, className: "text-foreground" },
};
const FALLBACK = { icon: Circle, className: "text-muted-foreground" };

const humanize = (type: string) => {
	const text = type.replace(/_/g, " ");
	return text.charAt(0).toUpperCase() + text.slice(1);
};

export function PostTimeline({ post, timeZone }: { post: PostDetail; timeZone: string }) {
	const channelOf = new Map(post.targets.map((t) => [t.id, t.channel.name]));
	const events = [...post.events].reverse();
	if (events.length === 0) {
		return (
			<div className="grid justify-items-center gap-2 rounded-xl border border-border border-dashed bg-surface px-4 py-8 text-center">
				<CalendarClock className="size-5 text-subtle-foreground" aria-hidden="true" />
				<p className="text-muted-foreground text-sm">Nothing has happened yet.</p>
			</div>
		);
	}
	return (
		<ol className="grid">
			{events.map((e, i) => {
				const tone = TONE[e.type] ?? FALLBACK;
				const last = i === events.length - 1;
				return (
					<li
						key={`${e.targetId}-${e.createdAt}-${e.type}`}
						className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-3 pb-5 last:pb-0"
					>
						{last ? null : (
							<span
								className="absolute top-7 bottom-1 left-[11.5px] w-px bg-border"
								aria-hidden="true"
							/>
						)}
						<span
							className={cn(
								"flex size-6 items-center justify-center rounded-full bg-muted ring-4 ring-surface-raised",
								tone.className,
							)}
							aria-hidden="true"
						>
							<tone.icon className="size-3.5" />
						</span>
						<div className="grid min-w-0 gap-0.5 pt-0.5">
							<p className="text-sm leading-5">
								<span className="font-medium">{humanize(e.type)}</span>
								<span className="text-muted-foreground">
									{" "}
									· {channelOf.get(e.targetId) ?? "Channel"}
								</span>
							</p>
							{e.message ? (
								<p className="break-words text-muted-foreground text-xs">{e.message}</p>
							) : null}
							<time
								dateTime={e.createdAt}
								className="font-mono text-[11.5px] text-subtle-foreground tabular-nums"
								title={formatRelative(e.createdAt)}
							>
								{formatDateTime(e.createdAt, timeZone)}
							</time>
						</div>
					</li>
				);
			})}
		</ol>
	);
}
