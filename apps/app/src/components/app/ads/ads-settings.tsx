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
import { Alert, EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { Field, fieldAria } from "@socialfly/ui/components/field";
import { Input } from "@socialfly/ui/components/input";
import { toast } from "@socialfly/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Lock, ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useAdsSettings } from "@/hooks/use-ads";
import { api, call } from "@/lib/api-client";
import { errorMessage } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { useOrg } from "../org-provider";
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

	if (settings.isPending) return <Skeleton className="h-64" />;
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
		<div className="grid max-w-2xl gap-6">
			<Card>
				<form onSubmit={onSubmit} noValidate>
					<CardHeader>
						<CardTitle>Daily budget ceiling</CardTitle>
						<CardDescription>
							No campaign can be created or activated with a daily budget above this amount. It
							catches typos like 5000 instead of 50 before they reach the platform.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4">
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
								className="max-w-48"
								value={value}
								placeholder={serverCeiling ? String(serverCeiling) : "No limit"}
								onChange={(e) => setValue(e.target.value)}
								onBlur={() => setTouched(true)}
								{...fieldAria("ads-ceiling", error, true)}
							/>
						</Field>
						<ul className="grid gap-1.5 text-sm">
							<li className="flex items-center gap-2">
								<ShieldCheck className="size-4 text-success" aria-hidden="true" />
								<span>
									In effect now:{" "}
									<span className="font-medium tabular-nums">
										{maxDailyBudget ? units(maxDailyBudget) : "no ceiling"}
									</span>
								</span>
							</li>
							<li className="flex items-center gap-2 text-muted-foreground">
								<Lock className="size-4" aria-hidden="true" />
								<span>
									Server limit (set by whoever runs SocialFly):{" "}
									<span className="tabular-nums">
										{serverCeiling ? units(serverCeiling) : "none"}
									</span>
								</span>
							</li>
						</ul>
					</CardContent>
					<CardFooter className="justify-end">
						<Button type="submit" loading={save.isPending}>
							Save
						</Button>
					</CardFooter>
				</form>
			</Card>
			<Alert tone="info" icon={AlertTriangle} title="How money is protected">
				Campaigns are always created paused. Only an admin can activate one, and only after typing
				its exact budget.
			</Alert>
		</div>
	);
}
