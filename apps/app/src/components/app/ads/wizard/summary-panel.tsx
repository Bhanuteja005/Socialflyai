"use client";

import { cn } from "@socialfly/ui/utils";
import { PauseCircle } from "lucide-react";
import type { ReactNode } from "react";
import { adsProviderMeta, countryName, FORMATS, formatMoney, objectiveLabel } from "@/lib/ads";
import type { AdAccount } from "@/lib/api-types";
import { formatDateTime } from "@/lib/format";
import { fromLocalInputValue } from "@/lib/timezone";
import { ProviderIcon } from "../../provider-icon";
import { parseAmount, type WizardState } from "./wizard-state";

function Row({ label, children, empty }: { label: string; children: ReactNode; empty?: boolean }) {
	return (
		<div className="grid gap-0.5">
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd className={cn("min-w-0 break-words text-sm", empty && "text-subtle-foreground")}>
				{children}
			</dd>
		</div>
	);
}

/** The campaign as it stands, beside every step, so nobody has to remember what they chose. */
export function WizardSummaryPanel({
	state,
	account,
	timeZone,
}: {
	state: WizardState;
	account: AdAccount | undefined;
	timeZone: string;
}) {
	const amount = parseAmount(state.budget);
	const currency = account?.currency ?? "USD";
	const start = fromLocalInputValue(state.startAt, timeZone);
	const end = state.endAt ? fromLocalInputValue(state.endAt, timeZone) : null;
	const countries = state.countries.map(countryName);

	return (
		<aside
			aria-labelledby="wizard-summary-title"
			className="grid gap-4 rounded-2xl border border-border bg-surface-raised p-5"
		>
			<h2 id="wizard-summary-title" className="font-medium text-sm">
				Summary
			</h2>
			{account ? (
				<div className="flex items-center gap-3">
					<ProviderIcon provider={account.provider} size="md" />
					<div className="grid min-w-0">
						<span className="truncate font-medium text-sm">{account.name}</span>
						<span className="truncate text-muted-foreground text-xs">
							{adsProviderMeta(account.provider).name} · {account.currency}
						</span>
					</div>
				</div>
			) : (
				<p className="rounded-lg border border-border border-dashed p-3 text-muted-foreground text-xs">
					Choose an ad account to start.
				</p>
			)}
			<dl className="grid gap-3">
				<Row label="Name" empty={!state.name}>
					{state.name || "Not named yet"}
				</Row>
				<Row label="Objective" empty={!state.objective}>
					{state.objective ? objectiveLabel(state.objective) : "—"}
				</Row>
				<Row label="Format" empty={!state.format}>
					{state.format ? (FORMATS[state.format]?.label ?? state.format) : "—"}
				</Row>
				<Row label="Audience" empty={countries.length === 0}>
					{countries.length
						? `${countries.slice(0, 3).join(", ")}${countries.length > 3 ? ` +${countries.length - 3}` : ""} · ${state.ageMin}–${state.ageMax === "65" ? "65+" : state.ageMax}`
						: "No countries yet"}
				</Row>
				<Row label="Schedule" empty={!start}>
					{start ? formatDateTime(start, timeZone) : "—"}
					{start ? (
						<span className="block text-muted-foreground text-xs">
							{end ? `until ${formatDateTime(end, timeZone)}` : "Runs until paused"}
						</span>
					) : null}
				</Row>
			</dl>
			<div className="grid gap-1 border-border border-t pt-4">
				<p className="text-muted-foreground text-xs">
					{state.budgetType === "daily" ? "Daily budget" : "Lifetime budget"}
				</p>
				<p className="font-mono text-[22px] tabular-nums leading-7">
					{amount === null ? "—" : formatMoney(amount, currency)}
				</p>
			</div>
			<p className="flex items-start gap-2 text-muted-foreground text-xs leading-relaxed">
				<PauseCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
				Created paused. Nothing spends until an admin activates it.
			</p>
		</aside>
	);
}
