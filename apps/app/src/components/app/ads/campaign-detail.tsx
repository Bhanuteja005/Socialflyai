"use client";

import { Button } from "@socialfly/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@socialfly/ui/components/card";
import { ConfirmDialog } from "@socialfly/ui/components/dialog";
import { Alert, EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { toast } from "@socialfly/ui/components/toast";
import { cn } from "@socialfly/ui/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	AlertTriangle,
	Archive,
	ArrowLeft,
	Check,
	CircleHelp,
	ExternalLink,
	Loader2,
	Pause,
	Pencil,
	Play,
	RotateCcw,
	Send,
	ShieldCheck,
	Trash2,
	X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	useAdAccounts,
	useAdCampaign,
	useCampaignAction,
	useDeleteCampaign,
} from "@/hooks/use-ads";
import { adsProviderMeta, CAMPAIGN_STATUS, formatMoney, objectiveLabel } from "@/lib/ads";
import { api, call } from "@/lib/api-client";
import type { AdCampaignDetail } from "@/lib/api-types";
import { errorMessage, isApiError } from "@/lib/errors";
import { formatDateTime, formatRelative } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { ProviderIcon } from "../provider-icon";
import { AdKpiRow, CampaignDailyChart } from "./ads-charts";
import { CampaignStatusBadge } from "./ads-shared";
import { ActivateDialog, RejectDialog, RetryUnconfirmedDialog } from "./campaign-dialogs";
import { campaignBudget } from "./campaigns-table";
import { DECLARATION_TEXT, SpecialCategoryDeclaration } from "./declaration";
import { DraftSummary } from "./draft-summary";
import { fromCampaign } from "./wizard/wizard-state";

const CREATED = ["paused", "active", "completed", "archived"];
const ARCHIVABLE = ["paused", "active", "completed", "failed", "unconfirmed"];

type Dialog = null | "activate" | "reject" | "retry" | "archive" | "delete" | "submit";

export function CampaignDetailView({ id }: { id: string }) {
	const { org, orgId, can } = useOrg();
	const router = useRouter();
	const queryClient = useQueryClient();
	const campaign = useAdCampaign(id);
	const accounts = useAdAccounts();
	const action = useCampaignAction(id);
	const remove = useDeleteCampaign();
	const [dialog, setDialog] = useState<Dialog>(null);
	const [declared, setDeclared] = useState(false);

	const submit = useMutation({
		mutationFn: () =>
			call(
				api.ads.campaigns[":id"].$patch({
					param: { id },
					json: { submit: true, declarations: { notPoliticalOrSpecialCategory: true } },
				}),
			),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: qk.adsAll(orgId) });
			setDialog(null);
			toast.success("Submitted");
		},
		onError: (e) =>
			toast.error(
				isApiError(e) && e.code === "ads_invalid"
					? "The campaign has problems. Open it in the editor to fix them."
					: errorMessage(e),
			),
	});

	const back = (
		<Link href="/ads" className="inline-flex items-center gap-1 hover:text-foreground">
			<ArrowLeft className="size-3.5" aria-hidden="true" />
			Ads
		</Link>
	);

	if (campaign.isPending) {
		return (
			<div className="grid gap-6">
				<Skeleton className="h-9 w-72" />
				<Skeleton className="h-24" />
				<Skeleton className="h-72" />
			</div>
		);
	}
	if (campaign.isError) {
		const notFound = isApiError(campaign.error) && campaign.error.status === 404;
		return (
			<EmptyState
				title={notFound ? "Campaign not found" : "Couldn't load this campaign"}
				description={notFound ? "It may have been deleted." : errorMessage(campaign.error)}
				action={
					notFound ? (
						<Button variant="outline" asChild>
							<Link href="/ads">Back to ads</Link>
						</Button>
					) : (
						<Button variant="outline" onClick={() => campaign.refetch()}>
							Retry
						</Button>
					)
				}
			/>
		);
	}

	const c = campaign.data;
	const account = accounts.data?.find((a) => a.id === c.adAccount.id);
	const timeZone = account?.timezone ?? org.timezone;
	const platform = adsProviderMeta(c.provider).name;
	const editor = can("editor");
	const admin = can("admin");
	const editable =
		editor && (c.status === "draft" || c.status === "pending_approval" || c.status === "rejected");
	const deletable = editor && (c.status === "draft" || c.status === "rejected");
	const created = CREATED.includes(c.status);
	const close = () => {
		setDialog(null);
		action.reset();
	};
	const run = (a: Parameters<typeof action.mutate>[0]) =>
		action.mutate(a, { onSuccess: () => setDialog(null) });

	const actions = (
		<>
			{c.manageUrl ? (
				<Button variant="outline" asChild>
					<a href={c.manageUrl} target="_blank" rel="noreferrer">
						<ExternalLink />
						Open in {platform} manager
					</a>
				</Button>
			) : null}
			{editable ? (
				<Button variant="outline" asChild>
					<Link href={`/ads/campaigns/${c.id}/edit`}>
						<Pencil />
						Edit
					</Link>
				</Button>
			) : null}
			{editable && c.status === "draft" ? (
				<Button
					variant="outline"
					onClick={() => {
						setDeclared(false);
						setDialog("submit");
					}}
				>
					<Send />
					{admin ? "Approve & create" : "Submit for approval"}
				</Button>
			) : null}
			{c.status === "pending_approval" && admin ? (
				<>
					<Button variant="danger-outline" onClick={() => setDialog("reject")}>
						<X />
						Reject
					</Button>
					<Button
						loading={action.isPending && action.variables?.type === "approve"}
						onClick={() =>
							action.mutate({ type: "approve" }, { onError: (e) => toast.error(errorMessage(e)) })
						}
					>
						<Check />
						Approve & create
					</Button>
				</>
			) : null}
			{c.status === "paused" && admin ? (
				<Button onClick={() => setDialog("activate")}>
					<Play />
					Activate
				</Button>
			) : null}
			{c.status === "active" && editor ? (
				<Button
					variant="outline"
					loading={action.isPending && action.variables?.type === "pause"}
					onClick={() =>
						action.mutate({ type: "pause" }, { onError: (e) => toast.error(errorMessage(e)) })
					}
				>
					<Pause />
					Pause
				</Button>
			) : null}
			{c.status === "failed" && editor ? (
				<Button
					loading={action.isPending && action.variables?.type === "retry"}
					onClick={() =>
						action.mutate({ type: "retry" }, { onError: (e) => toast.error(errorMessage(e)) })
					}
				>
					<RotateCcw />
					Retry
				</Button>
			) : null}
			{c.status === "unconfirmed" && editor ? (
				<Button variant="outline" onClick={() => setDialog("retry")}>
					<RotateCcw />
					Retry
				</Button>
			) : null}
			{admin && ARCHIVABLE.includes(c.status) ? (
				<Button variant="ghost" onClick={() => setDialog("archive")}>
					<Archive />
					Archive
				</Button>
			) : null}
			{deletable ? (
				<Button
					variant="danger-outline"
					size="icon"
					aria-label="Delete campaign"
					onClick={() => setDialog("delete")}
				>
					<Trash2 />
				</Button>
			) : null}
		</>
	);

	return (
		<>
			<PageHeader
				eyebrow={back}
				title={
					<span className="flex flex-wrap items-center gap-3">
						{c.name}
						<CampaignStatusBadge status={c.status} />
					</span>
				}
				description={
					<span className="inline-flex flex-wrap items-center gap-1.5">
						<ProviderIcon provider={c.provider} size="xs" />
						{c.adAccount.name} · {objectiveLabel(c.objective)} · {campaignBudget(c)}
					</span>
				}
				actions={actions}
			/>

			<StatusNotice
				campaign={c}
				onRetryUnconfirmed={() => setDialog("retry")}
				admin={admin}
				canRetry={editor}
			/>

			<div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
				<div className="grid gap-6">
					{created ? <Metrics campaign={c} /> : null}
					<Card>
						<CardHeader>
							<CardTitle>What was set up</CardTitle>
						</CardHeader>
						<CardContent>
							<DraftSummary
								state={fromCampaign(c, timeZone)}
								currency={c.currency}
								timeZone={timeZone}
								accountLabel={`${c.adAccount.name} (${platform}, ${c.currency})`}
							/>
							<DeclarationRecord campaign={c} timeZone={timeZone} />
						</CardContent>
					</Card>
				</div>
				<Card className="lg:sticky lg:top-6">
					<CardHeader>
						<CardTitle>Status</CardTitle>
					</CardHeader>
					<CardContent>
						<StatusTimeline campaign={c} timeZone={timeZone} />
					</CardContent>
				</Card>
			</div>

			{c.status === "paused" ? (
				<ActivateDialog
					open={dialog === "activate"}
					onOpenChange={(o) => (o ? setDialog("activate") : close())}
					campaign={c}
					timeZone={timeZone}
					pending={action.isPending}
					error={action.error}
					onConfirm={(amount) => run({ type: "activate", confirmBudget: amount })}
				/>
			) : null}
			<RejectDialog
				open={dialog === "reject"}
				onOpenChange={(o) => (o ? setDialog("reject") : close())}
				pending={action.isPending}
				error={action.error}
				onConfirm={(reason) => run({ type: "reject", reason })}
			/>
			<RetryUnconfirmedDialog
				open={dialog === "retry"}
				onOpenChange={(o) => (o ? setDialog("retry") : close())}
				campaign={c}
				pending={action.isPending}
				error={action.error}
				onConfirm={() => run({ type: "retry", confirmNotCreated: true })}
			/>
			<ConfirmDialog
				open={dialog === "submit"}
				onOpenChange={(o) => (o ? setDialog("submit") : setDialog(null))}
				title={admin ? "Approve and create this campaign?" : "Submit for approval?"}
				description={
					admin
						? "It is created on the platform PAUSED. It doesn't spend until you activate it."
						: "An admin reviews it next. Creating it never spends money; it is created paused."
				}
				confirmLabel={admin ? "Approve & create" : "Submit"}
				confirmDisabled={!declared}
				loading={submit.isPending}
				onConfirm={() => submit.mutate()}
			>
				<SpecialCategoryDeclaration
					id="detail-declaration"
					checked={declared}
					onChange={setDeclared}
				/>
			</ConfirmDialog>
			<ConfirmDialog
				open={dialog === "archive"}
				onOpenChange={(o) => (o ? setDialog("archive") : close())}
				title="Archive this campaign?"
				description={`It stops spending and is archived on ${platform} where the platform supports it. This can't be undone from SocialFly.`}
				confirmLabel="Archive"
				tone="danger"
				loading={action.isPending}
				onConfirm={() =>
					action.mutate(
						{ type: "archive" },
						{ onSuccess: () => setDialog(null), onError: (e) => toast.error(errorMessage(e)) },
					)
				}
			/>
			<ConfirmDialog
				open={dialog === "delete"}
				onOpenChange={(o) => (o ? setDialog("delete") : setDialog(null))}
				title="Delete this campaign?"
				description="It was never sent to the platform, so nothing else changes."
				confirmLabel="Delete"
				tone="danger"
				loading={remove.isPending}
				onConfirm={() =>
					remove.mutate(c.id, {
						onSuccess: () => {
							setDialog(null);
							router.replace("/ads");
						},
					})
				}
			/>
		</>
	);
}

function StatusNotice({
	campaign: c,
	admin,
	canRetry,
	onRetryUnconfirmed,
}: {
	campaign: AdCampaignDetail;
	admin: boolean;
	canRetry: boolean;
	onRetryUnconfirmed: () => void;
}) {
	const platform = adsProviderMeta(c.provider).name;
	switch (c.status) {
		case "pending_approval":
			return (
				<Alert tone="info" title="Waiting for approval">
					{admin
						? "Review the setup below. Approving creates it on the platform, paused — it won't spend until you activate it."
						: "An admin needs to approve it. It is then created paused on the platform."}
				</Alert>
			);
		case "approved":
		case "creating":
			return (
				<Alert tone="info" icon={Loader2} title={`Creating on ${platform}, paused`}>
					This usually takes under a minute. Nothing is being spent.
				</Alert>
			);
		case "paused":
			return (
				<Alert tone="info" icon={Pause} title="Paused — not spending">
					{admin
						? "It exists on the platform. Activate it when you're ready; you'll confirm the budget first."
						: "It exists on the platform. An admin activates it when you're ready."}
				</Alert>
			);
		case "active":
			return (
				<Alert tone="success" icon={Play} title="Active — spending budget">
					{c.activatedAt
						? `Activated ${formatRelative(c.activatedAt)}${c.activatedBy ? ` by ${c.activatedBy.name}` : ""}.`
						: null}{" "}
					Numbers update every few hours.
				</Alert>
			);
		case "rejected":
			return (
				<Alert tone="warning" icon={AlertTriangle} title="Sent back">
					{c.rejectionReason ?? "An admin rejected this campaign."} Edit it and submit again.
				</Alert>
			);
		case "failed":
			return (
				<Alert tone="danger" icon={AlertTriangle} title={`${platform} rejected this campaign`}>
					{c.error?.message ?? "Creating it failed."}
					{c.error?.code ? (
						<span className="ml-1 font-mono text-[11px] opacity-70">({c.error.code})</span>
					) : null}{" "}
					Nothing was left running.
				</Alert>
			);
		case "unconfirmed":
			return (
				<Alert
					tone="warning"
					icon={CircleHelp}
					title="We couldn't confirm the campaign was created"
					action={
						canRetry ? (
							<Button size="sm" variant="outline" onClick={onRetryUnconfirmed}>
								Retry…
							</Button>
						) : undefined
					}
				>
					{platform} didn't answer in time. Check the ads manager before retrying — it may already
					exist (paused).
				</Alert>
			);
		default:
			return null;
	}
}

type TimelineItem = {
	key: string;
	label: string;
	detail?: string;
	at?: string | null;
	state: "done" | "current" | "todo" | "bad";
};

/** Where the campaign is in draft → approval → created (paused) → active. */
function StatusTimeline({
	campaign: c,
	timeZone,
}: {
	campaign: AdCampaignDetail;
	timeZone: string;
}) {
	const s = c.status;
	const createdOnPlatform = CREATED.includes(s);
	const items: TimelineItem[] = [
		{
			key: "draft",
			label: "Drafted",
			detail: c.createdBy
				? `by ${c.createdBy.name}`
				: c.source === "ai"
					? "with AI copy"
					: undefined,
			at: c.createdAt,
			state: "done",
		},
		s === "rejected"
			? {
					key: "review",
					label: "Rejected",
					detail: c.rejectionReason ?? undefined,
					state: "bad",
				}
			: {
					key: "review",
					label: c.approvedAt ? "Approved" : "Approval",
					detail: c.approvedBy
						? `by ${c.approvedBy.name}`
						: s === "pending_approval"
							? "Waiting for an admin"
							: s === "draft"
								? "Not submitted yet"
								: undefined,
					at: c.approvedAt,
					state: c.approvedAt ? "done" : s === "pending_approval" ? "current" : "todo",
				},
		{
			key: "created",
			label: "Created on the platform, paused",
			detail:
				s === "failed"
					? (c.error?.message ?? "Failed")
					: s === "unconfirmed"
						? "Outcome unknown"
						: s === "creating" || s === "approved"
							? "In progress"
							: undefined,
			state: createdOnPlatform
				? "done"
				: s === "failed" || s === "unconfirmed"
					? "bad"
					: s === "creating" || s === "approved"
						? "current"
						: "todo",
		},
		{
			key: "active",
			label: s === "active" ? "Active" : c.activatedAt ? "Was activated" : "Activated",
			detail: c.activatedBy
				? `by ${c.activatedBy.name}`
				: s === "paused"
					? "Needs an admin"
					: undefined,
			at: c.activatedAt,
			state: s === "active" ? "current" : c.activatedAt ? "done" : "todo",
		},
	];
	if (s === "completed" || s === "archived")
		items.push({
			key: "end",
			label: CAMPAIGN_STATUS[s].label,
			at: c.updatedAt,
			state: "done",
		});

	const dot = {
		done: "bg-success",
		current: "bg-info ring-info/30",
		todo: "bg-border-strong",
		bad: "bg-danger",
	} as const;

	return (
		<div className="grid gap-4">
			<ol className="relative grid gap-4 border-border border-l pl-5">
				{items.map((i) => (
					<li key={i.key} className="relative grid gap-0.5">
						<span
							className={cn(
								"absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-surface-raised",
								dot[i.state],
							)}
							aria-hidden="true"
						/>
						<p
							className={cn(
								"text-sm",
								i.state === "todo" ? "text-muted-foreground" : "font-medium",
							)}
						>
							{i.label}
							<span className="sr-only">
								{" "}
								({i.state === "todo" ? "not yet" : i.state === "bad" ? "problem" : i.state})
							</span>
						</p>
						{i.detail ? <p className="text-muted-foreground text-xs">{i.detail}</p> : null}
						{i.at ? (
							<time dateTime={i.at} className="text-subtle-foreground text-xs">
								{formatDateTime(i.at, timeZone)}
							</time>
						) : null}
					</li>
				))}
			</ol>
			<dl className="grid gap-1 border-border border-t pt-3 text-xs">
				<div className="flex justify-between gap-2">
					<dt className="text-muted-foreground">Spent to date</dt>
					<dd className="font-medium tabular-nums">
						{c.spendToDate === null ? "—" : formatMoney(c.spendToDate, c.currency)}
					</dd>
				</div>
				<div className="flex justify-between gap-2">
					<dt className="text-muted-foreground">On the platform</dt>
					<dd>{c.platformStatus ? c.platformStatus.replace(/_/g, " ").toLowerCase() : "—"}</dd>
				</div>
				<div className="flex justify-between gap-2">
					<dt className="text-muted-foreground">Last change</dt>
					<dd>{formatRelative(c.updatedAt)}</dd>
				</div>
			</dl>
		</div>
	);
}

/** The special-ad-category declaration as it was made at submission: who, when. */
function DeclarationRecord({
	campaign: c,
	timeZone,
}: {
	campaign: AdCampaignDetail;
	timeZone: string;
}) {
	const d = c.declarations;
	return (
		<div className="mt-3 grid gap-1 rounded-lg border border-border p-4 text-sm">
			<h3 className="font-medium">Special ad categories</h3>
			{d?.notPoliticalOrSpecialCategory ? (
				<>
					<p className="flex items-start gap-2">
						<ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
						<span>{DECLARATION_TEXT}</span>
					</p>
					<p className="pl-6 text-muted-foreground text-xs">
						Confirmed
						{d.confirmedBy ? ` by ${d.confirmedBy.name}` : ""}
						{d.confirmedAt ? ` on ${formatDateTime(d.confirmedAt, timeZone)}` : ""}.
					</p>
				</>
			) : (
				<p className="text-muted-foreground text-xs">
					Not declared yet — confirmed when the campaign is submitted.
				</p>
			)}
		</div>
	);
}

function Metrics({ campaign: c }: { campaign: AdCampaignDetail }) {
	const { totals, daily } = c.metrics;
	return (
		<section aria-labelledby="campaign-results" className="grid gap-4">
			<h2 id="campaign-results" className="font-medium text-base">
				Results
			</h2>
			<AdKpiRow totals={totals} currency={c.currency} />
			<Card>
				<CardHeader>
					<CardTitle>Daily delivery</CardTitle>
				</CardHeader>
				<CardContent>
					{daily.length ? (
						<CampaignDailyChart days={daily} currency={c.currency} />
					) : (
						<p className="text-muted-foreground text-sm">
							No delivery yet. Numbers appear a few hours after the campaign starts running.
						</p>
					)}
				</CardContent>
			</Card>
		</section>
	);
}
