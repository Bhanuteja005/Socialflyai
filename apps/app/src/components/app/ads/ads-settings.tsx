"use client";

import { Button } from "@socialfly/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@socialfly/ui/components/card";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { Field, fieldAria } from "@socialfly/ui/components/field";
import { Input } from "@socialfly/ui/components/input";
import { toast } from "@socialfly/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useAdsSettings } from "@/hooks/use-ads";
import { api, call } from "@/lib/api-client";
import { errorMessage } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { useOrg } from "../org-provider";
import { AdsSafetyCard } from "./ads-landing";
import { AdsLayout } from "./ads-shared";

/** Ceilings are in each ad account's own currency units; say so rather than pretend they're USD. */
const units = (n: number) => `${formatNumber(n)} per day`;

export function AdsSettingsView() {
	const { can } = useOrg();
	const admin = can("admin");
	return (
		<AdsLayout description="Guardrails for every campaign this organization creates.">
			{admin ? (
				<CeilingCard />
			) : (
				<EmptyState
					icon={Lock}
					title="Only admins can change ads settings"
					description="Ask an admin or the owner of this organization."
				/>
			)}
		</AdsLayout>
	);
}

function CeilingCard() {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	const settings = useAdsSettings();
	const [value, setValue] = useState("");
	const [touched, setTouched] = useState(false);

	useEffect(() => {
		if (settings.data)
			setValue(settings.data.orgCeiling === null ? "" : String(settings.data.orgCeiling));
	}, [settings.data]);

	const save = useMutation({
		mutationFn: (adsMaxDailyBudget: number | null) =>
			call(api.ads.settings.$patch({ json: { adsMaxDailyBudget } })),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: qk.adsSettings(orgId) });
			toast.success("Ads settings saved");
		},
		onError: (e) => toast.error(errorMessage(e)),
	});

	if (settings.isPending) return <Skeleton className="h-64 max-w-2xl rounded-xl" />;
	if (settings.isError) {
		return (
			<EmptyState
				title="Couldn't load ads settings"
				description={errorMessage(settings.error)}
				action={
					<Button variant="outline" onClick={() => settings.refetch()}>
						Retry
					</Button>
				}
			/>
		);
	}

	const { serverCeiling, maxDailyBudget } = settings.data;
	const trimmed = value.trim();
	const parsed = trimmed === "" ? null : Number(trimmed);
	const error = !touched
		? null
		: parsed !== null && (!Number.isFinite(parsed) || parsed <= 0)
			? "Enter a positive amount, or leave empty to use the server limit."
			: parsed !== null && serverCeiling !== null && serverCeiling > 0 && parsed > serverCeiling
				? `Can't be higher than the server limit of ${formatNumber(serverCeiling)}.`
				: null;

	function onSubmit(e: FormEvent) {
		e.preventDefault();
		setTouched(true);
		if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0)) return;
		if (parsed !== null && serverCeiling && parsed > serverCeiling) return;
		save.mutate(parsed);
	}

	return (
		<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
			<Card>
				<form onSubmit={onSubmit} noValidate>
					<CardHeader className="flex-row items-start gap-3 border-border border-b pb-4">
						<div className="grid gap-1">
							<CardTitle>Daily budget ceiling</CardTitle>
							<CardDescription>
								No campaign can run a daily budget above this amount.
							</CardDescription>
						</div>
					</CardHeader>
					<CardContent className="grid gap-5 pt-5">
						<Field
							label="Organization ceiling"
							htmlFor="ads-ceiling"
							error={error}
							hint={
								serverCeiling
									? `In each ad account's own currency. Up to ${formatNumber(serverCeiling)}; leave empty to use that server limit.`
									: "In each ad account's own currency. Leave empty for no organization limit."
							}
						>
							<Input
								id="ads-ceiling"
								inputMode="decimal"
								className="max-w-48 font-mono tabular-nums"
								value={value}
								placeholder={serverCeiling ? String(serverCeiling) : "No limit"}
								onChange={(e) => setValue(e.target.value)}
								onBlur={() => setTouched(true)}
								{...fieldAria("ads-ceiling", error, true)}
							/>
						</Field>
						<dl className="grid gap-px overflow-hidden rounded-xl border border-border bg-border text-sm sm:grid-cols-2">
							<div className="grid gap-1 bg-surface p-3.5">
								<dt className="flex items-center gap-1.5 text-muted-foreground text-xs">
									<ShieldCheck className="size-3.5" aria-hidden="true" />
									In effect now
								</dt>
								<dd className="font-medium font-mono tabular-nums">
									{maxDailyBudget ? units(maxDailyBudget) : "No ceiling"}
								</dd>
							</div>
							<div className="grid gap-1 bg-surface p-3.5">
								<dt className="flex items-center gap-1.5 text-muted-foreground text-xs">
									<Lock className="size-3.5" aria-hidden="true" />
									Server limit
								</dt>
								<dd className="font-mono tabular-nums">
									{serverCeiling ? units(serverCeiling) : "None"}
									<span className="block text-muted-foreground text-xs">
										Set by whoever runs SocialFly
									</span>
								</dd>
							</div>
						</dl>
					</CardContent>
					<CardFooter className="justify-end border-border border-t">
						<Button type="submit" loading={save.isPending}>
							Save changes
						</Button>
					</CardFooter>
				</form>
			</Card>
			<AdsSafetyCard />
		</div>
	);
}
