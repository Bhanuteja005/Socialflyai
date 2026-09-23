"use client";

import { Button } from "@socialfly/ui/components/button";
import { Checkbox } from "@socialfly/ui/components/controls";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@socialfly/ui/components/dialog";
import { Alert } from "@socialfly/ui/components/feedback";
import { Field, fieldAria, Label } from "@socialfly/ui/components/field";
import { Input, Textarea } from "@socialfly/ui/components/input";
import { AlertTriangle, Play, RotateCcw } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { adsProviderMeta, formatMoney, typedAmount } from "@/lib/ads";
import type { AdCampaign } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { SummaryList } from "./ads-shared";

type Base = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	campaign: AdCampaign;
	pending: boolean;
	error: unknown;
};

/**
 * The only way money starts moving: the admin must TYPE the exact budget. The button
 * stays disabled until it matches, so a stray click or Enter can't activate anything.
 */
export function ActivateDialog({
	open,
	onOpenChange,
	campaign: c,
	pending,
	error,
	timeZone,
	onConfirm,
}: Base & { timeZone: string; onConfirm: (amount: number) => void }) {
	const inputId = useId();
	const [typed, setTyped] = useState("");
	const amount = c.dailyBudget ?? c.lifetimeBudget ?? 0;
	const expected = typedAmount(amount, c.currency);
	const matches = typed.trim() === expected;

	useEffect(() => {
		if (open) setTyped("");
	}, [open]);

	function onSubmit(e: FormEvent) {
		e.preventDefault();
		if (matches && !pending) onConfirm(amount);
	}

	return (
		<Dialog open={open} onOpenChange={(o) => (pending ? undefined : onOpenChange(o))}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Activate and start spending?</DialogTitle>
					<DialogDescription>
						{adsProviderMeta(c.provider).name} will start delivering this campaign and charging{" "}
						{c.adAccount.name}.
					</DialogDescription>
				</DialogHeader>
				<form id="activate-form" onSubmit={onSubmit} noValidate className="grid gap-4">
					<div className="rounded-lg border border-border bg-surface p-3">
						<SummaryList
							rows={[
								{
									label: c.dailyBudget !== null ? "Daily budget" : "Lifetime budget",
									value: (
										<span className="font-semibold tabular-nums">
											{formatMoney(amount, c.currency)}
										</span>
									),
								},
								{ label: "Currency", value: c.currency },
								{ label: "Starts", value: formatDateTime(c.startAt, timeZone) },
								{
									label: "Ends",
									value: c.endAt ? formatDateTime(c.endAt, timeZone) : "Runs until paused",
								},
							]}
						/>
					</div>
					<Field
						label={
							<>
								Type <span className="font-mono">{expected}</span> to confirm
							</>
						}
						htmlFor={inputId}
						hint={`The ${c.dailyBudget !== null ? "daily" : "lifetime"} budget in ${c.currency}, exactly as shown.`}
					>
						<Input
							id={inputId}
							inputMode="decimal"
							autoComplete="off"
							className="font-mono tabular-nums"
							value={typed}
							onChange={(e) => setTyped(e.target.value)}
							{...fieldAria(inputId, null, true)}
						/>
					</Field>
					{error ? (
						<Alert tone="danger" icon={AlertTriangle}>
							{errorMessage(error)}
						</Alert>
					) : null}
				</form>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
						Cancel
					</Button>
					<Button type="submit" form="activate-form" loading={pending} disabled={!matches}>
						<Play />
						Activate
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function RejectDialog({
	open,
	onOpenChange,
	pending,
	error,
	onConfirm,
}: Omit<Base, "campaign"> & { onConfirm: (reason: string) => void }) {
	const [reason, setReason] = useState("");
	useEffect(() => {
		if (open) setReason("");
	}, [open]);
	const valid = reason.trim().length >= 3;
	return (
		<Dialog open={open} onOpenChange={(o) => (pending ? undefined : onOpenChange(o))}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Send this campaign back?</DialogTitle>
					<DialogDescription>
						The author sees your reason and can edit and resubmit it. Nothing is created on the
						platform.
					</DialogDescription>
				</DialogHeader>
				<form
					id="reject-form"
					noValidate
					onSubmit={(e) => {
						e.preventDefault();
						if (valid) onConfirm(reason.trim());
					}}
					className="grid gap-4"
				>
					<Field label="Reason" htmlFor="reject-reason">
						<Textarea
							id="reject-reason"
							rows={3}
							maxLength={500}
							placeholder="e.g. Budget is too high for this test; try 20 per day."
							value={reason}
							onChange={(e) => setReason(e.target.value)}
						/>
					</Field>
					{error ? (
						<Alert tone="danger" icon={AlertTriangle}>
							{errorMessage(error)}
						</Alert>
					) : null}
				</form>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
						Cancel
					</Button>
					<Button
						type="submit"
						form="reject-form"
						variant="danger"
						loading={pending}
						disabled={!valid}
					>
						Reject
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Retrying a campaign whose creation outcome is unknown could create it twice. The
 * admin must check the ads manager first and say so.
 */
export function RetryUnconfirmedDialog({
	open,
	onOpenChange,
	campaign: c,
	pending,
	error,
	onConfirm,
}: Base & { onConfirm: () => void }) {
	const [checked, setChecked] = useState(false);
	const platform = adsProviderMeta(c.provider).name;
	useEffect(() => {
		if (open) setChecked(false);
	}, [open]);
	return (
		<Dialog open={open} onOpenChange={(o) => (pending ? undefined : onOpenChange(o))}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>This campaign may already exist</DialogTitle>
					<DialogDescription>
						We could not confirm the campaign was created — check the ads manager before retrying.
						Retrying could create it twice.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-3 text-sm">
					{c.manageUrl ? (
						<a
							href={c.manageUrl}
							target="_blank"
							rel="noreferrer"
							className="w-fit text-primary-text underline underline-offset-2"
						>
							Open {platform} ads manager
						</a>
					) : (
						<p className="text-muted-foreground">
							Open {platform} ads manager for {c.adAccount.name} and look for “{c.name}”.
						</p>
					)}
					<div className="flex items-start gap-2.5 rounded-md border border-border p-3">
						<Checkbox
							id="confirm-not-created"
							checked={checked}
							onCheckedChange={(v) => setChecked(v === true)}
						/>
						<Label htmlFor="confirm-not-created" className="font-normal leading-snug">
							I checked {platform} and this campaign does not exist there.
						</Label>
					</div>
					{error ? (
						<Alert tone="danger" icon={AlertTriangle}>
							{errorMessage(error)}
						</Alert>
					) : null}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
						Cancel
					</Button>
					<Button loading={pending} disabled={!checked} onClick={onConfirm}>
						<RotateCcw />
						Create it again
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
