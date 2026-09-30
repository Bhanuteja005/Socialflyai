"use client";

import { Field, fieldAria } from "@socialfly/ui/components/field";
import { Input } from "@socialfly/ui/components/input";
import { cn } from "@socialfly/ui/utils";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { adsProviderMeta, FORMATS, OBJECTIVES, objectiveLabel } from "@/lib/ads";
import type { AdAccount, AdFormat, AdsProvider } from "@/lib/api-types";
import { ProviderIcon } from "../../provider-icon";
import { AccountStatusBadge } from "../ads-shared";
import type { StepErrors, WizardState } from "./wizard-state";

const choice =
	"flex w-full cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-within:outline-2 focus-within:outline-ring hover:border-border-strong has-[:checked]:border-foreground has-[:checked]:bg-muted/40 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50";

export function StepSetup({
	state,
	update,
	accounts,
	providers,
	errors,
}: {
	state: WizardState;
	update: (patch: Partial<WizardState>) => void;
	accounts: AdAccount[];
	providers: AdsProvider[];
	errors: StepErrors;
}) {
	const account = accounts.find((a) => a.id === state.adAccountId);
	const provider = providers.find((p) => p.id === account?.provider);

	return (
		<div className="grid gap-6">
			<fieldset className="grid gap-2">
				<legend className="mb-2 font-medium text-sm">Ad account</legend>
				<ul className="grid gap-2 sm:grid-cols-2">
					{accounts.map((a) => {
						const blocked = a.status !== "active" || a.identityRequired.length > 0;
						return (
							<li key={a.id}>
								<label className={cn(choice, "border-border")}>
									<input
										type="radio"
										name="ad-account"
										className="sr-only"
										checked={state.adAccountId === a.id}
										disabled={blocked}
										onChange={() => {
											const p = providers.find((x) => x.id === a.provider);
											update({
												adAccountId: a.id,
												// Keep choices the new platform supports; clear the rest.
												objective:
													state.objective && p?.objectives.includes(state.objective)
														? state.objective
														: "",
												format:
													state.format && p?.formats.includes(state.format as AdFormat)
														? state.format
														: "",
											});
										}}
									/>
									<ProviderIcon provider={a.provider} size="md" />
									<span className="grid min-w-0 flex-1 gap-0.5">
										<span className="truncate font-medium text-sm">{a.name}</span>
										<span className="truncate text-muted-foreground text-xs">
											{adsProviderMeta(a.provider).name} · {a.currency}
										</span>
										{a.identityRequired.length ? (
											<span className="text-warning text-xs">Needs setup on the Accounts tab</span>
										) : null}
									</span>
									{a.status === "active" ? null : <AccountStatusBadge status={a.status} />}
								</label>
							</li>
						);
					})}
				</ul>
				{errors.adAccountId ? (
					<p className="flex items-center gap-1.5 text-danger text-xs" role="alert">
						<AlertTriangle className="size-3.5" aria-hidden="true" />
						{errors.adAccountId}{" "}
						<Link href="/ads/accounts" className="underline underline-offset-2">
							Accounts
						</Link>
					</p>
				) : null}
			</fieldset>

			<Field label="Campaign name" htmlFor="campaign-name" error={errors.name}>
				<Input
					id="campaign-name"
					value={state.name}
					maxLength={200}
					placeholder="Spring launch — US"
					onChange={(e) => update({ name: e.target.value })}
					{...fieldAria("campaign-name", errors.name)}
				/>
			</Field>

			{provider ? (
				<>
					<fieldset className="grid gap-2">
						<legend className="mb-2 font-medium text-sm">Objective</legend>
						<ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{provider.objectives.map((o) => (
								<li key={o}>
									<label className={cn(choice, "border-border")}>
										<input
											type="radio"
											name="objective"
											className="sr-only"
											checked={state.objective === o}
											onChange={() => update({ objective: o })}
										/>
										<span className="grid gap-0.5">
											<span className="font-medium text-sm">{objectiveLabel(o)}</span>
											{OBJECTIVES[o] ? (
												<span className="text-muted-foreground text-xs">
													{OBJECTIVES[o].description}
												</span>
											) : null}
										</span>
									</label>
								</li>
							))}
						</ul>
						{errors.objective ? (
							<p className="text-danger text-xs" role="alert">
								{errors.objective}
							</p>
						) : null}
					</fieldset>

					<fieldset className="grid gap-2">
						<legend className="mb-2 font-medium text-sm">Ad format</legend>
						<ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
							{provider.formats.map((f) => (
								<li key={f}>
									<label className={cn(choice, "border-border")}>
										<input
											type="radio"
											name="format"
											className="sr-only"
											checked={state.format === f}
											onChange={() =>
												update({
													format: f,
													// Search ads carry no media; a single-file format keeps only matching files.
													media:
														f === "search"
															? []
															: f === "carousel"
																? state.media
																: state.media.filter((m) => m.kind === f).slice(0, 1),
												})
											}
										/>
										<span className="grid gap-0.5">
											<span className="font-medium text-sm">{FORMATS[f]?.label ?? f}</span>
											<span className="text-muted-foreground text-xs">
												{FORMATS[f]?.description}
											</span>
										</span>
									</label>
								</li>
							))}
						</ul>
						{errors.format ? (
							<p className="text-danger text-xs" role="alert">
								{errors.format}
							</p>
						) : null}
					</fieldset>
				</>
			) : account ? (
				<p className="text-muted-foreground text-sm">
					{adsProviderMeta(account.provider).name} isn't available on this server right now.
				</p>
			) : (
				<p className="text-muted-foreground text-sm">
					Choose an ad account to see its objectives and formats.
				</p>
			)}
		</div>
	);
}
