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
import { Field, fieldAria, Label } from "@socialfly/ui/components/field";
import { Input, Textarea } from "@socialfly/ui/components/input";
import { NativeSelect } from "@socialfly/ui/components/select";
import { toast } from "@socialfly/ui/components/toast";
import { Check, Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useAdCopy } from "@/hooks/use-ads";
import { useAfterAiCall } from "@/hooks/use-ai";
import { CALLS_TO_ACTION, countryName, isCallToAction } from "@/lib/ads";
import type { AdCopyVariant } from "@/lib/api-types";
import { AiError, AiUsage } from "../../ai/ai-shared";
import type { WizardState } from "./wizard-state";

const ctaLabel = (v: string) => CALLS_TO_ACTION.find((c) => c.value === v)?.label ?? v;

/**
 * "Write with AI" for ads: describe the product, compare variants, apply one. Nothing
 * changes in the ad until a variant is chosen; the previous copy can be restored.
 */
export function AdCopyDialog({
	open,
	onOpenChange,
	state,
	update,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	state: WizardState;
	update: (patch: Partial<WizardState>) => void;
}) {
	const afterAiCall = useAfterAiCall();
	const copy = useAdCopy();
	const [product, setProduct] = useState(
		state.sourcePostId ? state.primaryText.slice(0, 1000) : "",
	);
	const [audience, setAudience] = useState("");
	const [url, setUrl] = useState(state.destinationUrl);
	const [variants, setVariants] = useState(3);
	const [applyTargeting, setApplyTargeting] = useState(true);
	const [touched, setTouched] = useState(false);

	const productError =
		touched && product.trim().length < 3 ? "Describe what you're advertising." : null;
	const urlError =
		touched && !/^https?:\/\/\S+\.\S+/.test(url.trim())
			? "Enter the landing page, starting with https://"
			: null;

	function onSubmit(e: FormEvent) {
		e.preventDefault();
		setTouched(true);
		if (product.trim().length < 3 || !/^https?:\/\/\S+\.\S+/.test(url.trim())) return;
		if (!state.adAccountId || !state.objective || !state.format) return;
		const { objective, format } = state;
		copy.mutate(
			{
				adAccountId: state.adAccountId,
				objective,
				format,
				product: product.trim(),
				audience: audience.trim() || undefined,
				destinationUrl: url.trim(),
				variants,
				sourcePostId: state.sourcePostId ?? undefined,
			},
			{ onSettled: afterAiCall },
		);
	}

	function use(v: AdCopyVariant) {
		const previous = { ...state };
		const patch: Partial<WizardState> = {
			primaryText: v.primaryText,
			headline: v.headline,
			description: v.description,
			callToAction: isCallToAction(v.callToAction) ? v.callToAction : state.callToAction,
			destinationUrl: state.destinationUrl || url.trim(),
			source: "ai",
		};
		if (v.searchHeadlines?.length) patch.searchHeadlines = v.searchHeadlines;
		if (v.searchDescriptions?.length) patch.searchDescriptions = v.searchDescriptions;
		const t = copy.data?.targetingSuggestions;
		if (applyTargeting && t) {
			if (t.countries.length) patch.countries = [...new Set([...state.countries, ...t.countries])];
			if (t.ageMin) patch.ageMin = String(t.ageMin);
			if (t.ageMax) patch.ageMax = String(t.ageMax);
			if (t.keywords.length) patch.keywords = [...new Set([...state.keywords, ...t.keywords])];
			// Interests need platform ids; they're offered as one-click searches on the Audience step.
			if (t.interests.length) patch.suggestedInterests = t.interests;
		}
		update(patch);
		toast.success("AI copy added to your ad", {
			action: { label: "Undo", onClick: () => update(previous) },
		});
		onOpenChange(false);
	}

	const busy = copy.isPending;
	const needsSetup = !state.adAccountId || !state.objective || !state.format;
	const suggestions = copy.data?.targetingSuggestions;

	return (
		<Dialog open={open} onOpenChange={(o) => (busy ? undefined : onOpenChange(o))}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Sparkles className="size-4 text-muted-foreground" aria-hidden="true" />
						Write ad copy with AI
					</DialogTitle>
					<DialogDescription>
						Uses your brand voice and this platform's text limits. Nothing changes until you pick a
						variant.
					</DialogDescription>
				</DialogHeader>

				{needsSetup ? (
					<p className="text-muted-foreground text-sm">
						Choose the ad account, objective and format on the first step first.
					</p>
				) : (
					<form id="ad-copy-form" onSubmit={onSubmit} noValidate className="grid gap-4">
						<Field
							label="What are you advertising?"
							htmlFor="ad-copy-product"
							error={productError}
							hint="The product or offer and what makes it worth clicking."
						>
							<Textarea
								id="ad-copy-product"
								rows={3}
								maxLength={2000}
								value={product}
								disabled={busy}
								onChange={(e) => setProduct(e.target.value)}
								{...fieldAria("ad-copy-product", productError, true)}
							/>
						</Field>
						<div className="grid gap-4 sm:grid-cols-2">
							<Field label="Who is it for? (optional)" htmlFor="ad-copy-audience">
								<Input
									id="ad-copy-audience"
									maxLength={500}
									placeholder="e.g. small bakery owners"
									value={audience}
									disabled={busy}
									onChange={(e) => setAudience(e.target.value)}
								/>
							</Field>
							<Field label="Variants to compare" htmlFor="ad-copy-variants">
								<NativeSelect
									id="ad-copy-variants"
									value={variants}
									disabled={busy}
									onChange={(e) => setVariants(Number(e.target.value))}
								>
									<option value={1}>1 variant</option>
									<option value={2}>2 variants</option>
									<option value={3}>3 variants</option>
								</NativeSelect>
							</Field>
						</div>
						<Field label="Landing page" htmlFor="ad-copy-url" error={urlError}>
							<Input
								id="ad-copy-url"
								type="url"
								inputMode="url"
								placeholder="https://"
								value={url}
								disabled={busy}
								onChange={(e) => setUrl(e.target.value)}
								{...fieldAria("ad-copy-url", urlError)}
							/>
						</Field>
						<AiError error={copy.error} />
					</form>
				)}

				{copy.data ? (
					<section aria-label="Variants" className="grid gap-3">
						<ul className="grid gap-3">
							{copy.data.variants.map((v, i) => (
								<li
									// biome-ignore lint/suspicious/noArrayIndexKey: variants have no ids
									key={i}
									className="grid gap-2 rounded-lg border border-border bg-surface p-3"
								>
									<p className="font-medium text-muted-foreground text-xs">Variant {i + 1}</p>
									{state.format === "search" ? (
										<div className="grid gap-1 text-sm">
											<p className="font-medium">{(v.searchHeadlines ?? []).join(" | ")}</p>
											<p className="text-muted-foreground">
												{(v.searchDescriptions ?? []).join(" ")}
											</p>
										</div>
									) : (
										<div className="grid gap-1 text-sm">
											<p className="whitespace-pre-wrap">{v.primaryText}</p>
											<p className="font-medium">{v.headline}</p>
											{v.description ? (
												<p className="text-muted-foreground">{v.description}</p>
											) : null}
											<p className="text-muted-foreground text-xs">
												Button: {ctaLabel(v.callToAction)}
											</p>
										</div>
									)}
									<Button size="xs" className="justify-self-start" onClick={() => use(v)}>
										<Check />
										Use this
									</Button>
								</li>
							))}
						</ul>
						{suggestions ? (
							<div className="flex items-start gap-2.5 rounded-md border border-border p-3">
								<Checkbox
									id="ad-copy-targeting"
									checked={applyTargeting}
									onCheckedChange={(v) => setApplyTargeting(v === true)}
								/>
								<Label htmlFor="ad-copy-targeting" className="grid gap-1 font-normal leading-snug">
									<span>Also apply the suggested audience</span>
									<span className="text-muted-foreground text-xs">
										{[
											suggestions.countries.map(countryName).join(", "),
											suggestions.ageMin && suggestions.ageMax
												? `ages ${suggestions.ageMin}–${suggestions.ageMax}`
												: "",
											suggestions.interests.length
												? `interests: ${suggestions.interests.join(", ")}`
												: "",
											suggestions.keywords.length
												? `keywords: ${suggestions.keywords.join(", ")}`
												: "",
										]
											.filter(Boolean)
											.join(" · ")}
									</span>
								</Label>
							</div>
						) : null}
					</section>
				) : null}

				<DialogFooter className="items-center sm:justify-between">
					<AiUsage className="sm:max-w-56" />
					<div className="flex flex-col-reverse gap-2 sm:flex-row">
						<Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
							Close
						</Button>
						{needsSetup ? null : (
							<Button type="submit" form="ad-copy-form" loading={busy}>
								<Sparkles />
								{copy.data ? "Write again" : "Write copy"}
							</Button>
						)}
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
