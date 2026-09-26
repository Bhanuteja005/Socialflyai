import { cn } from "@socialfly/ui/utils";
import {
	Calendar as CalendarIcon,
	ChartColumn,
	LayoutGrid,
	type LucideIcon,
	MessageSquare,
	Plus,
	Share2,
	Sparkles,
	Zap,
} from "lucide-react";
import type { ReactNode } from "react";

/**
 * Static, decorative product illustrations built from markup (no images, no JS). They are
 * aria-hidden where purely decorative; pass a `label` to expose a short description.
 */

/** Glass frame with an optional header row. */
export function MockupFrame({
	title,
	icon: Icon,
	aside,
	children,
	className,
	label,
}: {
	title?: string;
	icon?: LucideIcon;
	aside?: ReactNode;
	children: ReactNode;
	className?: string;
	label?: string;
}) {
	return (
		<figure
			aria-label={label}
			aria-hidden={label ? undefined : true}
			className={cn(
				"relative w-full overflow-hidden rounded-3xl border border-border bg-surface-raised p-2 sm:p-3",
				className,
			)}
		>
			<div className="rounded-2xl bg-surface p-4 text-left sm:p-6">
				{title ? (
					<div className="mb-5 flex items-center justify-between gap-3 border-border border-b pb-4">
						<div className="flex min-w-0 items-center gap-3">
							{Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
							<span className="truncate font-medium text-sm text-foreground">{title}</span>
						</div>
						{aside}
					</div>
				) : null}
				{children}
			</div>
		</figure>
	);
}

export type MockupRow = {
	title: string;
	subtitle?: string;
	status?: string;
	tone?: "success" | "warning" | "muted";
	avatar?: string;
};

const toneClass = {
	success: { dot: "bg-success", text: "text-success" },
	warning: { dot: "bg-warning", text: "text-warning" },
	muted: { dot: "bg-muted", text: "text-muted-foreground" },
} as const;

/** List of rows with initials avatar and a status pill. */
export function ListMockup({ rows }: { rows: MockupRow[] }) {
	return (
		<ul className="space-y-3">
			{rows.map((row) => {
				const tone = toneClass[row.tone ?? "success"];
				const initials = row.avatar ?? row.title.slice(0, 2).toUpperCase();
				return (
					<li
						key={row.title}
						className="flex items-center justify-between gap-3 rounded-lg bg-surface-raised p-3"
					>
						<div className="flex min-w-0 items-center gap-3">
							<div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border-strong bg-muted font-medium text-foreground text-xs">
								{initials}
							</div>
							<div className="min-w-0">
								<p className="truncate font-medium text-sm text-foreground">{row.title}</p>
								{row.subtitle ? (
									<p className="truncate font-medium text-[10px] text-muted-foreground">
										{row.subtitle}
									</p>
								) : null}
							</div>
						</div>
						{row.status ? (
							<div className="flex shrink-0 items-center gap-2">
								<span className={cn("size-1.5 rounded-full", tone.dot)} />
								<span className={cn("font-mono text-[11px]", tone.text)}>{row.status}</span>
							</div>
						) : null}
					</li>
				);
			})}
		</ul>
	);
}

export type ChatMessage = { author: string; text: string; ai?: boolean };

/** Conversation thread: incoming comments and AI-drafted replies. */
export function ChatMockup({ messages }: { messages: ChatMessage[] }) {
	return (
		<ul className="space-y-3">
			{messages.map((message) => (
				<li
					key={`${message.author}-${message.text}`}
					className={cn("flex", message.ai ? "justify-end" : "justify-start")}
				>
					<div
						className={cn(
							"max-w-[85%] rounded-2xl px-4 py-3 text-sm",
							message.ai
								? "rounded-br-sm border border-border-strong bg-muted text-foreground"
								: "rounded-bl-sm bg-surface-raised text-foreground",
						)}
					>
						<p
							className={cn(
								"mb-1 flex items-center gap-1.5 font-mono text-[11px]",
								message.ai ? "text-brand-text" : "text-subtle-foreground",
							)}
						>
							{message.ai ? <Sparkles className="size-3" /> : null}
							{message.author}
						</p>
						{message.text}
					</div>
				</li>
			))}
		</ul>
	);
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Week-view calendar with a few scheduled posts. */
export function CalendarMockup({
	posts = [
		{ day: 0, label: "Reel teaser" },
		{ day: 2, label: "Product launch" },
		{ day: 3, label: "Carousel" },
		{ day: 5, label: "Live Q&A" },
	],
}: {
	posts?: { day: number; label: string }[];
}) {
	return (
		<div className="grid grid-cols-7 gap-1.5 sm:gap-2">
			{DAYS.map((day, dayIndex) => {
				const scheduled = posts.filter((post) => post.day === dayIndex);
				return (
					<div key={day} className="min-w-0">
						<p className="mb-2 text-center font-medium text-[9px] text-subtle-foreground sm:text-[10px]">
							{day}
						</p>
						<div className="flex h-28 flex-col gap-1.5 rounded-lg border border-border bg-surface-raised p-1 sm:h-36 sm:p-1.5">
							{scheduled.map((post) => (
								<div
									key={post.label}
									className="truncate rounded-md border border-border-strong bg-muted px-1 py-1 font-medium text-[8px] text-brand-text sm:px-1.5 sm:text-[10px]"
								>
									{post.label}
								</div>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}

/** Best-time-to-post heatmap (deterministic intensities). */
export function HeatmapMockup() {
	const hours = ["6a", "9a", "12p", "3p", "6p", "9p"];
	return (
		<div className="overflow-hidden">
			<div className="grid grid-cols-[auto_repeat(7,minmax(0,1fr))] gap-1 sm:gap-1.5">
				<span />
				{DAYS.map((day) => (
					<span
						key={day}
						className="text-center font-medium text-[9px] text-subtle-foreground sm:text-[10px]"
					>
						{day}
					</span>
				))}
				{hours.map((hour, row) => (
					<div key={hour} className="contents">
						<span className="pr-1 text-right font-medium text-[9px] text-subtle-foreground sm:text-[10px]">
							{hour}
						</span>
						{DAYS.map((day, col) => {
							const intensity = ((row * 7 + col * 3) % 10) / 10;
							const peak = (row === 3 && col === 2) || (row === 4 && col === 4);
							return (
								<span
									key={day}
									className={cn(
										"aspect-square rounded-[4px]",
										peak && "ring-2 ring-primary ring-offset-1 ring-offset-surface",
									)}
									style={{
										backgroundColor: `color-mix(in srgb, var(--foreground) ${Math.round(6 + intensity * 70)}%, transparent)`,
									}}
								/>
							);
						})}
					</div>
				))}
			</div>
		</div>
	);
}

/** Static bar chart (replaces the legacy recharts charts). */
export function BarChartMockup({
	values = [32, 48, 41, 60, 55, 72, 68, 84, 79, 92, 88, 100],
	caption,
}: {
	values?: number[];
	caption?: string;
}) {
	const max = Math.max(...values);
	return (
		<div>
			<div className="flex h-40 items-end gap-1.5 sm:h-48 sm:gap-2">
				{values.map((value, index) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative series
						key={index}
						className={cn(
							"flex-1 rounded-t-md",
							index === values.length - 1 ? "bg-primary" : "bg-primary/25",
						)}
						style={{ height: `${(value / max) * 100}%` }}
					/>
				))}
			</div>
			{caption ? (
				<p className="mt-3 font-mono text-[11px] text-subtle-foreground">{caption}</p>
			) : null}
		</div>
	);
}

export type MetricTile = { label: string; value: string; note?: string; icon?: LucideIcon };

/** Grid of KPI tiles. */
export function MetricTiles({ tiles, className }: { tiles: MetricTile[]; className?: string }) {
	return (
		<div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", className)}>
			{tiles.map(({ label, value, note, icon: Icon }) => (
				<div
					key={label}
					className="rounded-2xl border border-border bg-surface p-5 text-left sm:p-6"
				>
					<div className="mb-4 flex items-center justify-between gap-2">
						{Icon ? <Icon className="size-5 text-muted-foreground" aria-hidden="true" /> : <span />}
						{note ? <span className="font-mono text-success text-xs">{note}</span> : null}
					</div>
					<p className="text-muted-foreground text-sm">{label}</p>
					<p className="mt-1 font-mono text-3xl text-brand-text tabular-nums">{value}</p>
				</div>
			))}
		</div>
	);
}

/** Static version of the legacy animated "ModernDashboardMockup". */
export function DashboardMockup({ className }: { className?: string }) {
	const nav = [
		{ id: "grid", Icon: LayoutGrid },
		{ id: "calendar", Icon: CalendarIcon },
		{ id: "inbox", Icon: MessageSquare },
		{ id: "analytics", Icon: ChartColumn },
	];
	return (
		<div
			aria-hidden="true"
			className={cn(
				"relative flex aspect-[16/10] w-full overflow-hidden rounded-3xl border border-border bg-surface ring-1 ring-border",
				className,
			)}
		>
			<div className="z-20 flex w-12 flex-col items-center gap-5 border-border border-r bg-canvas py-5 sm:w-16 sm:gap-6 sm:py-6">
				<div className="flex size-7 items-center justify-center rounded-lg bg-primary sm:size-8">
					<Zap className="size-4 fill-current text-primary-foreground" />
				</div>
				{nav.map(({ id, Icon }, index) => (
					<Icon
						key={id}
						className={cn(
							"size-4 sm:size-[18px]",
							index === 1 ? "text-brand-text" : "text-subtle-foreground",
						)}
					/>
				))}
			</div>

			<div className="relative flex flex-1 flex-col bg-surface">
				<div className="flex h-10 items-center justify-between border-border border-b px-4 sm:h-14 sm:px-6">
					<div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-surface-raised sm:w-32">
						<div className="absolute inset-y-0 left-0 w-3/4 bg-primary/30" />
					</div>
					<div className="flex h-6 items-center gap-1.5 rounded-lg border border-border-strong bg-muted px-2 font-medium text-[8px] text-brand-text sm:h-7 sm:px-3 sm:text-[9px]">
						<Plus className="size-2.5" strokeWidth={3} />
						Draft post
					</div>
				</div>

				<div className="grid grid-cols-3 gap-2 p-3 sm:gap-4 sm:p-6">
					{["01", "02", "03"].map((day) => (
						<div
							key={day}
							className="flex h-16 flex-col justify-between rounded-xl border border-border bg-surface-raised p-2 sm:h-28 sm:p-3"
						>
							<div className="flex items-start justify-between">
								<div className="size-4 rounded-md border border-border bg-surface-raised sm:size-5" />
								<span className="font-medium text-[7px] text-subtle-foreground sm:text-[8px]">
									{day} Feb
								</span>
							</div>
							<div className="space-y-1">
								<div className="h-1 w-full rounded-full bg-surface-raised" />
								<div className="h-1 w-2/3 rounded-full bg-surface-raised opacity-40" />
							</div>
						</div>
					))}
				</div>

				<div className="absolute top-1/2 left-1/2 z-30 w-[70%] max-w-[320px] -translate-x-1/2 -translate-y-[35%] rounded-2xl border border-border bg-surface-raised p-3 sm:p-6">
					<div className="mb-3 flex items-center gap-2 sm:mb-6 sm:gap-3">
						<div className="flex size-7 items-center justify-center rounded-xl border border-border-strong bg-muted sm:size-9">
							<Sparkles className="size-4 text-brand-text sm:size-5" />
						</div>
						<div>
							<p className="font-medium text-[9px] text-foreground tracking-tight sm:text-[11px]">
								AI Content Sync
							</p>
							<p className="font-medium text-[7px] text-subtle-foreground sm:text-[8px]">
								Optimization Layer 2.4
							</p>
						</div>
					</div>
					<div className="mb-3 rounded-xl border border-border bg-surface-raised p-2 sm:mb-6 sm:p-3">
						<div className="mb-2 flex items-center justify-between">
							<span className="font-medium text-[7px] text-subtle-foreground font-mono sm:text-[9px]">
								Predictive score
							</span>
							<span className="font-mono text-[9px] text-foreground tabular-nums sm:text-[11px]">
								98.2%
							</span>
						</div>
						<div className="h-1 w-full overflow-hidden rounded-full bg-surface-raised">
							<div className="h-full w-[98%] bg-primary" />
						</div>
					</div>
					<div className="flex gap-2">
						<div className="flex h-7 flex-1 items-center justify-center rounded-lg bg-ink font-medium text-[7px] text-ink-foreground sm:h-9 sm:text-[10px]">
							Generate variations
						</div>
						<div className="flex size-7 items-center justify-center rounded-lg border border-border bg-surface-raised text-subtle-foreground sm:size-9">
							<Share2 className="size-3.5" />
						</div>
					</div>
				</div>

				<div className="mt-auto flex h-10 items-center gap-4 border-border border-t px-4 sm:h-12 sm:px-6">
					<span className="font-medium text-[7px] text-subtle-foreground font-mono sm:text-[8px]">
						Timeline
					</span>
					<div className="flex h-px flex-1 items-center bg-muted">
						<div className="ml-[70%] size-2 rounded-full bg-primary" />
					</div>
				</div>
			</div>
		</div>
	);
}
