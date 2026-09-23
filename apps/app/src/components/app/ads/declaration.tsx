"use client";

import { Checkbox } from "@socialfly/ui/components/controls";
import { Label } from "@socialfly/ui/components/field";
import { cn } from "@socialfly/ui/utils";

export const DECLARATION_TEXT =
	"I confirm this ad is not about politics, elections or social issues, and is not a credit, employment or housing ad (special ad categories).";

/**
 * Required before submitting. Special ad categories have their own rules (and on some
 * platforms their own approval), which SocialFly doesn't support — so the submitter says so.
 */
export function SpecialCategoryDeclaration({
	checked,
	missing,
	onChange,
	id = "ad-declaration",
}: {
	checked: boolean;
	missing?: boolean;
	onChange: (checked: boolean) => void;
	id?: string;
}) {
	return (
		<div
			className={cn(
				"grid gap-1.5 rounded-lg border p-3",
				missing ? "border-danger/50 bg-danger-soft/30" : "border-border",
			)}
		>
			<div className="flex items-start gap-2.5">
				<Checkbox
					id={id}
					checked={checked}
					onCheckedChange={(v) => onChange(v === true)}
					aria-required="true"
					aria-invalid={missing || undefined}
					aria-describedby={`${id}-explain`}
					className="mt-0.5"
				/>
				<Label htmlFor={id} className="font-normal leading-snug">
					{DECLARATION_TEXT}
				</Label>
			</div>
			<p id={`${id}-explain`} className="pl-6.5 text-muted-foreground text-xs">
				SocialFly declares this to Meta, Google and LinkedIn on your behalf. Ads in these categories
				need the platform's own special-category setup, which SocialFly doesn't offer.
			</p>
			{missing ? (
				<p className="pl-6.5 text-danger text-xs" role="alert">
					Tick this to submit the campaign.
				</p>
			) : null}
		</div>
	);
}
