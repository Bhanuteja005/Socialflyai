"use client";

import { Field, fieldAria } from "@socialfly/ui/components/field";
import { Input } from "@socialfly/ui/components/input";
import { cn } from "@socialfly/ui/utils";
import { Info, ShieldCheck } from "lucide-react";
import { currencySymbol, formatMoney } from "@/lib/ads";
import type { AdAccount, AdsProvider } from "@/lib/api-types";
import { zoneLabel } from "@/lib/format";
import { fromLocalInputValue } from "@/lib/timezone";
import { parseAmount, type StepErrors, type WizardState } from "./wizard-state";

const segment =
	"inline-flex h-8 flex-1 cursor-pointer items-center justify-center rounded-md px-3 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground has-[:checked]:bg-surface-raised has-[:checked]:text-foreground has-[:checked]:shadow-xs has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring";

export function StepBudget({
	state,
	update,
	account,
	provider,
	ceiling,
	timeZone,
	errors,
}: {
	state: WizardState;
	update: (patch: Partial<WizardState>) => void;
	account?: AdAccount;
	provider?: AdsProvider;
	ceiling: number | null;
	timeZone: string;
	errors: StepErrors;
}) {
	const currency = account?.currency ?? "USD";
	const amount = parseAmount(state.budget);
	const start = fromLocalInputValue(state.startAt, timeZone);
	const end = state.endAt ? fromLocalInputValue(state.endAt, timeZone) : null;
	const days =
		start && end && end > start
			? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000))
			: null;
	const zone = zoneLabel(timeZone, start ?? new Date());

	return (
		<div className="grid gap-6">
			<fieldset className="grid gap-2">
				<legend className="mb-1 font-medium text-sm">Budget type</legend>
				<div className="inline-flex max-w-sm gap-0.5 rounded-lg bg-muted p-0.5">
					<label className={segment}>
						<input
							type="radio"
							name="budget-type"
							className="sr-only"
							checked={state.budgetType === "daily"}
							onChange={() => update({ budgetType: "daily" })}
						/>
						Daily
					</label>
					<label className={segment}>
						<input
							type="radio"
							name="budget-type"
							className="sr-only"
							checked={state.budgetType === "lifetime"}
							onChange={() => update({ budgetType: "lifetime" })}
						/>
						Lifetime
					</label>
				</div>
				<p className="text-muted-foreground text-xs">
					{state.budgetType === "daily"
						? "The most the platform may spend per day, on average."
						: "The most the platform may spend over the whole schedule. Needs an end date."}
				</p>
			</fieldset>

			<Field
				label={`${state.budgetType === "daily" ? "Daily" : "Lifetime"} budget (${currency})`}
				htmlFor="ad-budget"
				error={errors.budget}
				hint={`In the ad account's currency, ${currency}.`}
			>
				<div className="relative max-w-56">
					<span
						className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground text-sm"
						aria-hidden="true"
					>
						{currencySymbol(currency)}
					</span>
					<Input
						id="ad-budget"
						inputMode="decimal"
						className="pl-9 tabular-nums"
						placeholder="25.00"
						value={state.budget}
						onChange={(e) => update({ budget: e.target.value })}
						{...fieldAria("ad-budget", errors.budget, true)}
					/>
				</div>
			</Field>

			<ul className="grid gap-1.5 text-sm">
				<li className="flex items-start gap-2">
					<ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
					<span>
						{ceiling
							? `Daily ceiling for this organization: ${formatMoney(ceiling, currency)}. Budgets above it are refused.`
							: "No daily ceiling is set for this organization."}
					</span>
				</li>
				{provider?.minDailyBudgetUsd ? (
					<li className="flex items-start gap-2 text-muted-foreground">
						<Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
						<span>
							{provider.displayName} needs at least about{" "}
							{formatMoney(provider.minDailyBudgetUsd, "USD")} per day (or the equivalent in{" "}
							{currency}); it checks the exact minimum when the campaign is created.
						</span>
					</li>
				) : null}
				{state.budgetType === "lifetime" && amount && days ? (
					<li className="flex items-start gap-2 text-muted-foreground">
						<Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
						<span>
							About {formatMoney(amount / days, currency)} per day over {days}{" "}
							{days === 1 ? "day" : "days"}.
						</span>
					</li>
				) : null}
			</ul>

			<fieldset className="grid gap-4 sm:grid-cols-2">
				<legend className="mb-3 font-medium text-sm">
					Schedule{" "}
					<span className="font-normal text-muted-foreground text-xs">
						({account?.timezone ?? timeZone}, {zone})
					</span>
				</legend>
				<Field label="Start" htmlFor="ad-start" error={errors.startAt}>
					<Input
						id="ad-start"
						type="datetime-local"
						value={state.startAt}
						onChange={(e) => update({ startAt: e.target.value })}
						{...fieldAria("ad-start", errors.startAt)}
					/>
				</Field>
				<Field
					label={state.budgetType === "lifetime" ? "End" : "End (optional)"}
					htmlFor="ad-end"
					error={errors.endAt}
					hint={state.budgetType === "daily" ? "Leave empty to run until paused." : undefined}
				>
					<Input
						id="ad-end"
						type="datetime-local"
						value={state.endAt}
						min={state.startAt || undefined}
						onChange={(e) => update({ endAt: e.target.value })}
						className={cn(!state.endAt && "text-muted-foreground")}
						{...fieldAria("ad-end", errors.endAt, state.budgetType === "daily")}
					/>
				</Field>
			</fieldset>
			<p className="text-muted-foreground text-xs">
				The campaign is created paused either way. It only starts spending after an admin activates
				it, and never before the start time.
			</p>
		</div>
	);
}
