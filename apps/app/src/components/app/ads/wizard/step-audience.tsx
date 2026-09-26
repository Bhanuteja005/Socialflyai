"use client";

import { Checkbox } from "@socialfly/ui/components/controls";
import { Spinner } from "@socialfly/ui/components/feedback";
import { Field, Label } from "@socialfly/ui/components/field";
import { Input } from "@socialfly/ui/components/input";
import { TagInput } from "@socialfly/ui/components/tag-input";
import { cn } from "@socialfly/ui/utils";
import { Plus, Search, X } from "lucide-react";
import { useId, useState } from "react";
import { useAdTargetingSearch } from "@/hooks/use-ads";
import { useDebounced } from "@/hooks/use-debounced";
import { COUNTRIES, countryName, LANGUAGES, languageName } from "@/lib/ads";
import type { TargetingOption, TargetingType } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import type { Needs, StepErrors, WizardState } from "./wizard-state";

export function StepAudience({
	state,
	update,
	needs,
	errors,
}: {
	state: WizardState;
	update: (patch: Partial<WizardState>) => void;
	needs: Needs;
	errors: StepErrors;
}) {
	return (
		<div className="grid gap-6">
			<CodeMultiSelect
				label="Countries"
				hint="People in these countries can see the ad."
				options={COUNTRIES}
				value={state.countries}
				nameOf={countryName}
				onChange={(countries) => update({ countries })}
				error={errors.countries}
			/>

			<TargetingPicker
				accountId={state.adAccountId}
				type="location"
				label="Cities and regions (optional)"
				hint="Narrow the countries above to specific places."
				value={state.locations}
				onChange={(locations) => update({ locations })}
			/>

			<fieldset className="grid gap-2">
				<legend className="mb-1 font-medium text-sm">Age</legend>
				<div className="flex flex-wrap items-center gap-2">
					<label htmlFor="age-min" className="sr-only">
						Minimum age
					</label>
					<Input
						id="age-min"
						type="number"
						inputMode="numeric"
						min={13}
						max={65}
						className="w-20"
						value={state.ageMin}
						onChange={(e) => update({ ageMin: e.target.value })}
						aria-invalid={errors.age ? true : undefined}
					/>
					<span className="text-muted-foreground text-sm">to</span>
					<label htmlFor="age-max" className="sr-only">
						Maximum age
					</label>
					<Input
						id="age-max"
						type="number"
						inputMode="numeric"
						min={13}
						max={65}
						className="w-20"
						value={state.ageMax}
						onChange={(e) => update({ ageMax: e.target.value })}
						aria-invalid={errors.age ? true : undefined}
					/>
					<span className="text-muted-foreground text-xs">65 means 65 and older</span>
				</div>
				{errors.age ? (
					<p className="text-danger text-xs" role="alert">
						{errors.age}
					</p>
				) : null}
			</fieldset>

			<fieldset className="grid gap-2">
				<legend className="mb-1 font-medium text-sm">Gender</legend>
				<div className="flex flex-wrap gap-x-6 gap-y-2">
					{(["female", "male"] as const).map((g) => (
						<div key={g} className="flex items-center gap-2">
							<Checkbox
								id={`gender-${g}`}
								checked={state.genders.includes(g)}
								onCheckedChange={(v) =>
									update({
										genders:
											v === true ? [...state.genders, g] : state.genders.filter((x) => x !== g),
									})
								}
							/>
							<Label htmlFor={`gender-${g}`} className="font-normal capitalize">
								{g === "female" ? "Women" : "Men"}
							</Label>
						</div>
					))}
				</div>
				<p className="text-muted-foreground text-xs">Leave both unticked to reach everyone.</p>
			</fieldset>

			<CodeMultiSelect
				label="Languages (optional)"
				hint="Leave empty for any language."
				options={LANGUAGES}
				value={state.languages}
				nameOf={languageName}
				onChange={(languages) => update({ languages })}
			/>

			{needs.interests ? (
				<TargetingPicker
					accountId={state.adAccountId}
					type="interest"
					label="Interests (optional)"
					hint="People interested in any of these."
					value={state.interests}
					onChange={(interests) => update({ interests })}
					suggestions={state.suggestedInterests}
				/>
			) : null}
			{needs.jobTitles ? (
				<TargetingPicker
					accountId={state.adAccountId}
					type="job_title"
					label="Job titles (optional)"
					value={state.jobTitles}
					onChange={(jobTitles) => update({ jobTitles })}
				/>
			) : null}
			{needs.industries ? (
				<TargetingPicker
					accountId={state.adAccountId}
					type="industry"
					label="Industries (optional)"
					value={state.industries}
					onChange={(industries) => update({ industries })}
				/>
			) : null}
			{needs.keywords ? (
				<Field
					label={state.format === "search" ? "Search keywords" : "Keywords (optional)"}
					htmlFor="ad-keywords"
					error={errors.keywords}
					hint="Press Enter or comma after each keyword."
				>
					<TagInput
						id="ad-keywords"
						value={state.keywords}
						onChange={(keywords) => update({ keywords })}
						max={50}
						maxLength={80}
						placeholder="e.g. running shoes"
						aria-invalid={errors.keywords ? true : undefined}
						aria-describedby={errors.keywords ? "ad-keywords-error" : "ad-keywords-hint"}
					/>
				</Field>
			) : null}
		</div>
	);
}

/** Selected values as removable chips. */
function Chips({
	items,
	onRemove,
	label,
}: {
	items: { id: string; name: string }[];
	onRemove: (id: string) => void;
	label: string;
}) {
	if (!items.length) return null;
	return (
		<ul className="flex flex-wrap gap-1.5" aria-label={`Selected ${label.toLowerCase()}`}>
			{items.map((i) => (
				<li
					key={i.id}
					className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2.5 text-xs"
				>
					{i.name}
					<button
						type="button"
						onClick={() => onRemove(i.id)}
						className="inline-flex size-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-border hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
						aria-label={`Remove ${i.name}`}
					>
						<X className="size-3" aria-hidden="true" />
					</button>
				</li>
			))}
		</ul>
	);
}

/** Filterable checkbox list for a fixed set of codes (countries, languages). */
function CodeMultiSelect({
	label,
	hint,
	options,
	value,
	nameOf,
	onChange,
	error,
}: {
	label: string;
	hint?: string;
	options: { code: string; name: string }[];
	value: string[];
	nameOf: (code: string) => string;
	onChange: (value: string[]) => void;
	error?: string;
}) {
	const id = useId();
	const [filter, setFilter] = useState("");
	const q = filter.trim().toLowerCase();
	const shown = options.filter(
		(o) => !q || o.name.toLowerCase().includes(q) || o.code.toLowerCase() === q,
	);
	const toggle = (code: string, on: boolean) =>
		onChange(on ? [...value, code] : value.filter((c) => c !== code));

	return (
		<fieldset className="grid gap-2" aria-describedby={error ? `${id}-error` : `${id}-hint`}>
			<legend className="mb-1 font-medium text-sm">{label}</legend>
			{hint ? (
				<p id={`${id}-hint`} className="text-muted-foreground text-xs">
					{hint}
				</p>
			) : null}
			<Chips
				label={label}
				items={value.map((c) => ({ id: c, name: nameOf(c) }))}
				onRemove={(c) => toggle(c, false)}
			/>
			<div className="rounded-xl border border-border">
				<div className="relative border-border border-b">
					<Search
						className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
						aria-hidden="true"
					/>
					<input
						type="search"
						aria-label={`Filter ${label.toLowerCase()}`}
						placeholder="Filter…"
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
						className="h-9 w-full bg-transparent pr-3 pl-8 text-sm outline-none placeholder:text-subtle-foreground"
					/>
				</div>
				<ul className="scrollbar-thin grid max-h-44 overflow-y-auto p-1 sm:grid-cols-2">
					{shown.map((o) => {
						const cid = `${id}-${o.code}`;
						return (
							<li key={o.code}>
								<label
									htmlFor={cid}
									className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
								>
									<Checkbox
										id={cid}
										checked={value.includes(o.code)}
										onCheckedChange={(v) => toggle(o.code, v === true)}
									/>
									{o.name}
								</label>
							</li>
						);
					})}
					{shown.length === 0 ? (
						<li className="px-2 py-3 text-muted-foreground text-sm">No matches.</li>
					) : null}
				</ul>
			</div>
			{error ? (
				<p id={`${id}-error`} className="text-danger text-xs" role="alert">
					{error}
				</p>
			) : null}
		</fieldset>
	);
}

/** Searches the platform's own targeting catalog (debounced) and collects picks as chips. */
function TargetingPicker({
	accountId,
	type,
	label,
	hint,
	value,
	onChange,
	suggestions = [],
}: {
	accountId: string;
	type: TargetingType;
	label: string;
	hint?: string;
	value: TargetingOption[];
	onChange: (value: TargetingOption[]) => void;
	suggestions?: string[];
}) {
	const id = useId();
	const [query, setQuery] = useState("");
	const debounced = useDebounced(query.trim(), 350);
	const results = useAdTargetingSearch(accountId, type, debounced);
	const chosen = new Set(value.map((v) => v.id));
	const options = (results.data ?? []).filter((o) => !chosen.has(o.id));
	const searching = debounced.length >= 2;

	return (
		<div className="grid gap-2">
			<label htmlFor={id} className="font-medium text-sm leading-none">
				{label}
			</label>
			{hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
			<Chips
				label={label}
				items={value}
				onRemove={(rid) => onChange(value.filter((v) => v.id !== rid))}
			/>
			{suggestions.length ? (
				<div className="flex flex-wrap items-center gap-1.5 text-xs">
					<span className="text-muted-foreground">AI suggested:</span>
					{suggestions.map((s) => (
						<button
							key={s}
							type="button"
							onClick={() => setQuery(s)}
							className="cursor-pointer rounded-full border border-border border-dashed px-2 py-0.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
						>
							Search “{s}”
						</button>
					))}
				</div>
			) : null}
			<div className="relative">
				<Search
					className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
					aria-hidden="true"
				/>
				<Input
					id={id}
					type="search"
					className="pl-8"
					placeholder="Type at least 2 letters to search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					aria-controls={`${id}-results`}
				/>
				{results.isFetching && searching ? (
					<span className="absolute top-1/2 right-2.5 -translate-y-1/2">
						<Spinner label="Searching" />
					</span>
				) : null}
			</div>
			<div id={`${id}-results`} aria-live="polite">
				{!searching ? null : results.isError ? (
					<p className="text-danger text-xs">{errorMessage(results.error)}</p>
				) : results.data && options.length === 0 && !results.isFetching ? (
					<p className="text-muted-foreground text-xs">No matches for “{debounced}”.</p>
				) : options.length ? (
					<ul className="scrollbar-thin grid max-h-48 gap-0.5 overflow-y-auto rounded-xl border border-border p-1">
						{options.map((o) => (
							<li key={o.id}>
								<button
									type="button"
									onClick={() => onChange([...value, o])}
									className={cn(
										"flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
									)}
								>
									<Plus className="size-3.5 text-muted-foreground" aria-hidden="true" />
									{o.name}
								</button>
							</li>
						))}
					</ul>
				) : null}
			</div>
		</div>
	);
}
