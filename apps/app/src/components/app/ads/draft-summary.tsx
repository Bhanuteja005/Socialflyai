"use client";

import { cn } from "@socialfly/ui/utils";
import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import {
	CALLS_TO_ACTION,
	countryName,
	FORMATS,
	formatMoney,
	languageName,
	objectiveLabel,
} from "@/lib/ads";
import { formatDateTime } from "@/lib/format";
import { fromLocalInputValue } from "@/lib/timezone";
import { SummaryList } from "./ads-shared";
import { parseAmount, type StepId, type WizardState } from "./wizard/wizard-state";

const list = (items: string[], empty = "Any") => (items.length ? items.join(", ") : empty);

function Section({
	title,
	step,
	onEdit,
	children,
	flagged,
}: {
	title: string;
	step: StepId;
	onEdit?: (step: StepId) => void;
	children: ReactNode;
	flagged?: boolean;
}) {
	return (
		<section
			className={cn(
				"grid gap-3 rounded-lg border p-4",
				flagged ? "border-danger/40 bg-danger-soft/20" : "border-transparent bg-surface",
			)}
			aria-label={title}
		>
			<div className="flex items-center justify-between gap-2">
				<h3 className="font-medium text-sm">{title}</h3>
				{onEdit ? (
					<button
						type="button"
						onClick={() => onEdit(step)}
						className="inline-flex cursor-pointer items-center gap-1 rounded-sm text-muted-foreground text-xs hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
					>
						<Pencil className="size-3" aria-hidden="true" />
						Edit<span className="sr-only"> {title.toLowerCase()}</span>
					</button>
				) : null}
			</div>
			{children}
		</section>
	);
}

/** Everything a campaign will be created with, grouped like the wizard's steps. */
export function DraftSummary({
	state,
	currency,
	timeZone,
	accountLabel,
	onEdit,
	flaggedSteps = [],
}: {
	state: WizardState;
	currency: string;
	timeZone: string;
	accountLabel: ReactNode;
	onEdit?: (step: StepId) => void;
	flaggedSteps?: StepId[];
}) {
	const search = state.format === "search";
	const amount = parseAmount(state.budget);
	const start = fromLocalInputValue(state.startAt, timeZone);
	const end = state.endAt ? fromLocalInputValue(state.endAt, timeZone) : null;
	const cta = CALLS_TO_ACTION.find((c) => c.value === state.callToAction)?.label;
	const flagged = new Set(flaggedSteps);

	return (
		<div className="grid gap-3">
			<Section title="Campaign" step="setup" onEdit={onEdit} flagged={flagged.has("setup")}>
				<SummaryList
					rows={[
						{ label: "Name", value: state.name || "—" },
						{ label: "Ad account", value: accountLabel },
						{ label: "Objective", value: state.objective ? objectiveLabel(state.objective) : "—" },
						{
							label: "Format",
							value: state.format ? (FORMATS[state.format]?.label ?? state.format) : "—",
						},
					]}
				/>
			</Section>

			<Section title="Creative" step="creative" onEdit={onEdit} flagged={flagged.has("creative")}>
				{search ? (
					<SummaryList
						rows={[
							{
								label: "Headlines",
								value: (
									<ul className="grid gap-0.5">
										{state.searchHeadlines
											.filter((h) => h.trim())
											.map((h, i) => (
												// biome-ignore lint/suspicious/noArrayIndexKey: display only
												<li key={i}>{h}</li>
											))}
									</ul>
								),
							},
							{
								label: "Descriptions",
								value: (
									<ul className="grid gap-0.5">
										{state.searchDescriptions
											.filter((d) => d.trim())
											.map((d, i) => (
												// biome-ignore lint/suspicious/noArrayIndexKey: display only
												<li key={i}>{d}</li>
											))}
									</ul>
								),
							},
							{ label: "Destination", value: state.destinationUrl || "—" },
						]}
					/>
				) : (
					<div className="grid gap-3">
						{state.media.length ? (
							<ul className="flex flex-wrap gap-2" aria-label="Media">
								{state.media.map((m) =>
									m.url && m.kind === "image" ? (
										<li key={m.id}>
											{/* biome-ignore lint/performance/noImgElement: user media from a runtime-configured storage host */}
											<img
												src={m.url}
												alt={m.altText ?? m.fileName}
												className="size-16 rounded-md object-cover"
											/>
										</li>
									) : (
										<li
											key={m.id}
											className="flex size-16 items-center justify-center rounded-md bg-muted p-1 text-center text-[10px] text-muted-foreground"
										>
											{m.kind === "video" ? "Video" : m.fileName}
										</li>
									),
								)}
							</ul>
						) : null}
						<SummaryList
							rows={[
								{
									label: "Primary text",
									value: <span className="whitespace-pre-wrap">{state.primaryText || "—"}</span>,
								},
								{ label: "Headline", value: state.headline || "—" },
								...(state.description ? [{ label: "Description", value: state.description }] : []),
								{ label: "Button", value: cta ?? "None" },
								{ label: "Destination", value: state.destinationUrl || "—" },
								...(state.source === "ai" ? [{ label: "Copy", value: "Written by AI" }] : []),
							]}
						/>
					</div>
				)}
			</Section>

			<Section title="Audience" step="audience" onEdit={onEdit} flagged={flagged.has("audience")}>
				<SummaryList
					rows={[
						{ label: "Countries", value: list(state.countries.map(countryName), "None") },
						...(state.locations.length
							? [{ label: "Places", value: list(state.locations.map((l) => l.name)) }]
							: []),
						{
							label: "Age",
							value: `${state.ageMin}–${state.ageMax === "65" ? "65+" : state.ageMax}`,
						},
						{
							label: "Gender",
							value:
								state.genders.length === 1
									? state.genders[0] === "female"
										? "Women"
										: "Men"
									: "Everyone",
						},
						{ label: "Languages", value: list(state.languages.map(languageName)) },
						...(state.interests.length
							? [{ label: "Interests", value: list(state.interests.map((i) => i.name)) }]
							: []),
						...(state.jobTitles.length
							? [{ label: "Job titles", value: list(state.jobTitles.map((i) => i.name)) }]
							: []),
						...(state.industries.length
							? [{ label: "Industries", value: list(state.industries.map((i) => i.name)) }]
							: []),
						...(state.keywords.length ? [{ label: "Keywords", value: list(state.keywords) }] : []),
					]}
				/>
			</Section>

			<Section
				title="Budget & schedule"
				step="budget"
				onEdit={onEdit}
				flagged={flagged.has("budget")}
			>
				<SummaryList
					rows={[
						{
							label: state.budgetType === "daily" ? "Daily budget" : "Lifetime budget",
							value: (
								<span className="font-medium font-mono tabular-nums">
									{amount === null ? "—" : formatMoney(amount, currency)}
								</span>
							),
						},
						{ label: "Starts", value: start ? formatDateTime(start, timeZone) : "—" },
						{
							label: "Ends",
							value: end ? formatDateTime(end, timeZone) : "Runs until paused",
						},
						{ label: "Time zone", value: timeZone },
					]}
				/>
			</Section>
		</div>
	);
}
