"use client";

import { Button } from "@socialfly/ui/components/button";
import { Card, CardContent } from "@socialfly/ui/components/card";
import { Alert, EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { toast } from "@socialfly/ui/components/toast";
import { cn } from "@socialfly/ui/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	AlertTriangle,
	ArrowLeft,
	ArrowRight,
	Check,
	Lock,
	Megaphone,
	PauseCircle,
	Save,
	Send,
	ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
	useAdAccounts,
	useAdCampaign,
	useAdsProviders,
	useAdsSettings,
	useSaveCampaign,
} from "@/hooks/use-ads";
import { adsProviderMeta } from "@/lib/ads";
import { api, call } from "@/lib/api-client";
import type { AdAccount, AdsProvider } from "@/lib/api-types";
import { errorMessage, isApiError } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { useOrg } from "../../org-provider";
import { PageHeader } from "../../page-header";
import { ProviderIcon } from "../../provider-icon";
import { SpecialCategoryDeclaration } from "../declaration";
import { DraftSummary } from "../draft-summary";
import { StepAudience } from "./step-audience";
import { StepBudget } from "./step-budget";
import { StepCreative } from "./step-creative";
import { StepSetup } from "./step-setup";
import {
	emptyState,
	fromCampaign,
	isStepId,
	needsFor,
	prefillFromPost,
	STEPS,
	type StepErrors,
	type StepId,
	stepForProblem,
	toInput,
	validateStep,
	type WizardState,
} from "./wizard-state";

// Nothing exists on the platform yet in these states (the API allows the same).
const EDITABLE = ["draft", "pending_approval", "rejected"];

/**
 * New campaign / edit draft. Loads everything the steps need, then hands a ready
 * initial state to the wizard so it never has to reconcile late-arriving data.
 */
export function CampaignWizard({ campaignId }: { campaignId?: string }) {
	const { org, orgId, can } = useOrg();
	const params = useSearchParams();
	const postId = campaignId ? null : params.get("post");
	const accounts = useAdAccounts();
	const providers = useAdsProviders();
	const post = useQuery({
		queryKey: qk.post(orgId, postId ?? ""),
		queryFn: () => call(api.posts[":id"].$get({ param: { id: postId ?? "" } })),
		enabled: postId !== null,
	});
	const campaign = useAdCampaign(campaignId ?? "");

	const back = (
		<Link
			href={campaignId ? `/ads/campaigns/${campaignId}` : "/ads"}
			className="inline-flex items-center gap-1 hover:text-foreground"
		>
			<ArrowLeft className="size-3.5" aria-hidden="true" />
			{campaignId ? "Campaign" : "Ads"}
		</Link>
	);
	const title = campaignId ? "Edit campaign" : postId ? "Boost a post" : "New campaign";

	if (!can("editor")) {
		return (
			<EmptyState
				icon={Lock}
				title="Only editors can create campaigns"
				description="Ask an admin to change your role."
				action={
					<Button variant="outline" asChild>
						<Link href="/ads">Back to ads</Link>
					</Button>
				}
			/>
		);
	}

	const loading =
		accounts.isPending ||
		providers.isPending ||
		(postId !== null && post.isPending) ||
		(campaignId !== undefined && campaign.isPending);
	const error =
		accounts.error ??
		providers.error ??
		(postId ? post.error : null) ??
		(campaignId ? campaign.error : null);

	if (error) {
		return (
			<>
				<PageHeader eyebrow={back} title={title} />
				<EmptyState
					title="Couldn't load what the campaign needs"
					description={errorMessage(error)}
					action={
						<Button
							variant="outline"
							onClick={() => {
								void accounts.refetch();
								void providers.refetch();
								if (postId) void post.refetch();
								if (campaignId) void campaign.refetch();
							}}
						>
							Retry
						</Button>
					}
				/>
			</>
		);
	}
	if (loading || !accounts.data || !providers.data) {
		return (
			<>
				<PageHeader eyebrow={back} title={title} />
				<div className="grid gap-4">
					<Skeleton className="h-10" />
					<Skeleton className="h-80" />
				</div>
			</>
		);
	}

	if (accounts.data.filter((a) => a.status === "active").length === 0) {
		return (
			<>
				<PageHeader eyebrow={back} title={title} />
				<EmptyState
					icon={Megaphone}
					title="No active ad account"
					description="Connect an ad account (or reconnect one) before creating campaigns."
					action={
						<Button asChild>
							<Link href="/ads/accounts">Go to ad accounts</Link>
						</Button>
					}
				/>
			</>
		);
	}

	if (campaign.data && !EDITABLE.includes(campaign.data.status)) {
		return (
			<>
				<PageHeader eyebrow={back} title={title} />
				<EmptyState
					icon={Lock}
					title="This campaign can't be edited anymore"
					description="Once a campaign is approved and created, changes happen in the platform's ads manager."
					action={
						<Button variant="outline" asChild>
							<Link href={`/ads/campaigns/${campaign.data.id}`}>View campaign</Link>
						</Button>
					}
				/>
			</>
		);
	}

	const active = accounts.data.filter((a) => a.status === "active" && !a.identityRequired.length);
	let initial: WizardState;
	if (campaign.data) {
		const account = accounts.data.find((a) => a.id === campaign.data.adAccount.id);
		initial = fromCampaign(campaign.data, account?.timezone ?? org.timezone);
	} else {
		const only = active.length === 1 ? active[0] : undefined;
		initial = emptyState(only?.timezone ?? org.timezone);
		if (only) initial.adAccountId = only.id;
		if (post.data) initial = prefillFromPost(initial, post.data);
	}

	return (
		<>
			<PageHeader
				eyebrow={back}
				title={title}
				description={
					postId
						? "Turn a published post into an ad. Its text and media are filled in; change anything."
						: "Five short steps. Nothing is spent until an admin activates the campaign."
				}
			/>
			<Wizard
				campaignId={campaignId}
				initial={initial}
				accounts={accounts.data}
				providers={providers.data}
				rejectionReason={campaign.data?.rejectionReason ?? null}
			/>
		</>
	);
}

function Wizard({
	campaignId,
	initial,
	accounts,
	providers,
	rejectionReason,
}: {
	campaignId?: string;
	initial: WizardState;
	accounts: AdAccount[];
	providers: AdsProvider[];
	rejectionReason: string | null;
}) {
	const { org, orgId, can } = useOrg();
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const queryClient = useQueryClient();
	const settings = useAdsSettings();
	const save = useSaveCampaign();
	const [state, setState] = useState(initial);
	const [attempted, setAttempted] = useState<Set<StepId>>(new Set());
	const [problems, setProblems] = useState<string[]>([]);
	const [busy, setBusy] = useState<null | "draft" | "submit" | "approve">(null);
	// Deliberately not remembered in drafts: whoever submits declares it, every time.
	const [declared, setDeclared] = useState(false);
	const [declarationMissing, setDeclarationMissing] = useState(false);
	const headingRef = useRef<HTMLHeadingElement>(null);

	const rawStep = params.get("step");
	const step: StepId = isStepId(rawStep) ? rawStep : "setup";
	const stepIndex = STEPS.findIndex((s) => s.id === step);

	const account = accounts.find((a) => a.id === state.adAccountId);
	const provider = providers.find((p) => p.id === account?.provider);
	const timeZone = account?.timezone ?? org.timezone;
	const ceiling = settings.data?.maxDailyBudget ?? null;
	const ctx = { account, provider, ceiling, timeZone };
	const needs = needsFor(account?.provider, state.format);

	// Cheap enough to recompute on every render; keeps the step badges honest while typing.
	const errorsByStep = {} as Record<StepId, StepErrors>;
	for (const s of STEPS)
		errorsByStep[s.id] = s.id === "review" ? {} : validateStep(s.id, state, ctx);
	const stepValid = (id: StepId) => Object.keys(errorsByStep[id]).length === 0;
	const firstInvalid = STEPS.find((s) => !stepValid(s.id))?.id;
	const problemSteps = [...new Set(problems.map(stepForProblem))];

	// Move focus to the step heading on step change, so keyboard and screen-reader users follow along.
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs on step change only
	useEffect(() => {
		headingRef.current?.focus();
	}, [step]);

	const update = (patch: Partial<WizardState>, opts?: { edit?: boolean }) =>
		setState((prev) => ({
			...prev,
			...patch,
			...(opts?.edit && prev.source === "ai" && patch.source === undefined
				? { source: "human" as const }
				: {}),
		}));

	const goTo = (id: StepId) => {
		const next = new URLSearchParams(params);
		if (id === "setup") next.delete("step");
		else next.set("step", id);
		router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
		window.scrollTo({ top: 0 });
	};

	const next = () => {
		setAttempted((prev) => new Set(prev).add(step));
		if (!stepValid(step)) return;
		const following = STEPS[stepIndex + 1];
		if (following) goTo(following.id);
	};

	// A step can be opened directly only when every step before it is complete.
	const reachable = (i: number) => STEPS.slice(0, i).every((s) => stepValid(s.id));

	async function persist(mode: "draft" | "submit" | "approve") {
		setProblems([]);
		if (mode !== "draft" && firstInvalid) {
			setAttempted(new Set(STEPS.map((s) => s.id)));
			goTo(firstInvalid);
			toast.error("Some steps still need attention");
			return;
		}
		if (mode !== "draft" && !declared) {
			if (step !== "review") goTo("review");
			setDeclarationMissing(true);
			document.getElementById("ad-declaration")?.focus();
			return;
		}
		if (mode === "draft" && !stepValid("setup")) {
			setAttempted((prev) => new Set(prev).add("setup"));
			goTo("setup");
			toast.error("Choose an account, objective, format and name before saving");
			return;
		}
		setBusy(mode);
		try {
			const saved = await save.mutateAsync({
				id: campaignId,
				input: toInput(state, timeZone, mode !== "draft"),
			});
			// An admin's submit is approved on the spot by the API; the returned status says what happened.
			toast.success(
				mode === "draft"
					? "Draft saved"
					: saved.status === "pending_approval"
						? "Submitted for approval"
						: "Approved — it's being created on the platform, paused",
			);
			void queryClient.invalidateQueries({ queryKey: qk.adsAll(orgId) });
			router.push(`/ads/campaigns/${saved.id}`);
		} catch (e) {
			if (isApiError(e) && e.code === "ads_invalid" && e.problems.length) {
				setProblems(e.problems);
				if (step !== "review") goTo("review");
			} else if (isApiError(e) && e.code === "validation_failed") {
				setProblems(Object.entries(e.fields).map(([k, v]) => `${k}: ${v}`));
				if (step !== "review") goTo("review");
			} else {
				toast.error(errorMessage(e));
			}
		} finally {
			setBusy(null);
		}
	}

	const errors = attempted.has(step) ? errorsByStep[step] : {};
	const admin = can("admin");

	return (
		<div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
			<nav aria-label="Campaign steps" className="lg:sticky lg:top-6">
				<ol className="scrollbar-thin flex gap-1 overflow-x-auto lg:grid">
					{STEPS.map((s, i) => {
						const current = s.id === step;
						const done = i < stepIndex && stepValid(s.id);
						const flagged =
							problemSteps.includes(s.id) || (attempted.has(s.id) && !stepValid(s.id));
						const canOpen = i <= stepIndex || reachable(i);
						return (
							<li key={s.id} className="shrink-0">
								<button
									type="button"
									onClick={() => goTo(s.id)}
									disabled={!canOpen}
									aria-current={current ? "step" : undefined}
									className={cn(
										"flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50",
										current
											? "bg-muted font-medium text-foreground"
											: "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
									)}
								>
									<span
										className={cn(
											"flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] tabular-nums",
											flagged
												? "border-danger bg-danger-soft text-danger"
												: done
													? "border-primary bg-primary text-primary-foreground"
													: current
														? "border-foreground"
														: "border-border-strong",
										)}
										aria-hidden="true"
									>
										{flagged ? "!" : done ? <Check className="size-3" /> : i + 1}
									</span>
									{s.label}
									{flagged ? <span className="sr-only"> (needs attention)</span> : null}
								</button>
							</li>
						);
					})}
				</ol>
			</nav>

			<Card>
				<CardContent className="grid gap-6 pt-5">
					<h2
						ref={headingRef}
						tabIndex={-1}
						className="font-semibold text-lg tracking-tight outline-none"
					>
						{stepIndex + 1}. {STEPS[stepIndex]?.label}
					</h2>

					{rejectionReason && step === "setup" ? (
						<Alert tone="warning" icon={AlertTriangle} title="Sent back by an admin">
							{rejectionReason}
						</Alert>
					) : null}

					{step === "setup" ? (
						<StepSetup
							state={state}
							update={update}
							accounts={accounts}
							providers={providers}
							errors={errors}
						/>
					) : step === "creative" ? (
						<StepCreative state={state} update={update} provider={provider} errors={errors} />
					) : step === "audience" ? (
						<StepAudience state={state} update={update} needs={needs} errors={errors} />
					) : step === "budget" ? (
						<StepBudget
							state={state}
							update={update}
							account={account}
							provider={provider}
							ceiling={ceiling}
							timeZone={timeZone}
							errors={errors}
						/>
					) : (
						<div className="grid gap-5">
							<Alert tone="info" icon={PauseCircle} title="This does not spend money">
								Creating this campaign does not spend money. It is created PAUSED; an admin must
								activate it.
							</Alert>
							{problems.length ? (
								<Alert tone="danger" icon={AlertTriangle} title="Fix these before continuing">
									<ul className="mt-1 grid gap-1.5">
										{problems.map((p) => {
											const target = stepForProblem(p);
											return (
												<li key={p} className="flex flex-wrap items-baseline gap-x-2">
													<span>{p}</span>
													{target !== "review" ? (
														<button
															type="button"
															onClick={() => goTo(target)}
															className="cursor-pointer text-xs underline underline-offset-2"
														>
															Go to {STEPS.find((s) => s.id === target)?.label}
														</button>
													) : null}
												</li>
											);
										})}
									</ul>
								</Alert>
							) : null}
							<DraftSummary
								state={state}
								currency={account?.currency ?? "USD"}
								timeZone={timeZone}
								accountLabel={
									account ? (
										<span className="inline-flex items-center gap-1.5">
											<ProviderIcon provider={account.provider} size="xs" />
											{account.name} ({adsProviderMeta(account.provider).name}, {account.currency})
										</span>
									) : (
										"—"
									)
								}
								onEdit={goTo}
								flaggedSteps={problemSteps}
							/>
							<SpecialCategoryDeclaration
								checked={declared}
								missing={declarationMissing && !declared}
								onChange={(v) => {
									setDeclared(v);
									if (v) setDeclarationMissing(false);
								}}
							/>
							{admin ? (
								<p className="flex items-start gap-2 text-muted-foreground text-xs">
									<ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden="true" />
									As an admin you can approve now. The campaign is then created on{" "}
									{provider?.displayName ?? "the platform"} — paused — and you activate it from its
									page when you're ready.
								</p>
							) : (
								<p className="flex items-start gap-2 text-muted-foreground text-xs">
									<ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden="true" />
									An admin reviews it next. You'll see its status on the Ads overview.
								</p>
							)}
						</div>
					)}

					<div className="flex flex-wrap items-center justify-between gap-2 border-border border-t pt-4">
						<div className="flex gap-2">
							{stepIndex > 0 ? (
								<Button variant="outline" onClick={() => goTo(STEPS[stepIndex - 1]?.id ?? "setup")}>
									<ArrowLeft />
									Back
								</Button>
							) : null}
							<Button
								variant="ghost"
								loading={busy === "draft"}
								disabled={busy !== null}
								onClick={() => void persist("draft")}
							>
								<Save />
								Save draft
							</Button>
						</div>
						{step !== "review" ? (
							<Button onClick={next}>
								Next
								<ArrowRight />
							</Button>
						) : admin ? (
							<Button
								loading={busy === "approve"}
								disabled={busy !== null || !declared}
								onClick={() => void persist("approve")}
							>
								<Check />
								Approve & create
							</Button>
						) : (
							<Button
								loading={busy === "submit"}
								disabled={busy !== null || !declared}
								onClick={() => void persist("submit")}
							>
								<Send />
								Submit for approval
							</Button>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
