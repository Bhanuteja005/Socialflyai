"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@socialfly/ui/components/card";
import {
	ConfirmDialog,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@socialfly/ui/components/dialog";
import { EmptyState } from "@socialfly/ui/components/feedback";
import { Field, fieldAria } from "@socialfly/ui/components/field";
import { Input } from "@socialfly/ui/components/input";
import { TagInput } from "@socialfly/ui/components/tag-input";
import { toast } from "@socialfly/ui/components/toast";
import { Pencil, Plus, Sparkles, Swords, Trash2, UserRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useCompetitorMutations, useCompetitors } from "@/hooks/use-research";
import type { Competitor } from "@/lib/api-types";
import { errorMessage, isApiError } from "@/lib/errors";
import { useOrg } from "../org-provider";
import { ListSkeleton, LoadError } from "./research-shared";

export function CompetitorsTab() {
	const { can } = useOrg();
	const editor = can("editor");
	const competitors = useCompetitors();
	const { remove } = useCompetitorMutations();
	// null = closed; "new" = adding; otherwise the competitor being edited.
	const [editing, setEditing] = useState<Competitor | "new" | null>(null);
	const [deleting, setDeleting] = useState<Competitor | null>(null);

	const items = competitors.data?.items ?? [];

	return (
		<Card>
			<CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
				<div className="grid gap-1">
					<CardTitle>Competitors</CardTitle>
					<CardDescription>
						Brands we look for in AI answers so you can compare your share of voice. Aliases catch
						other spellings (e.g. "Acme" and "Acme Inc").
					</CardDescription>
				</div>
				{editor && items.length ? (
					<Button size="sm" onClick={() => setEditing("new")}>
						<Plus />
						Add competitor
					</Button>
				) : null}
			</CardHeader>

			<div className="mt-4">
				{competitors.isPending ? (
					<div className="px-5 pb-5">
						<ListSkeleton />
					</div>
				) : competitors.isError ? (
					<div className="px-5 pb-5">
						<LoadError
							title="Couldn't load competitors"
							error={competitors.error}
							onRetry={() => void competitors.refetch()}
						/>
					</div>
				) : items.length === 0 ? (
					<div className="px-5 pb-5">
						<EmptyState
							icon={Swords}
							title="No competitors yet"
							description="Add the brands you compete with, or pick them from your brand research on the Brand tab."
							action={
								editor ? (
									<Button size="sm" onClick={() => setEditing("new")}>
										<Plus />
										Add competitor
									</Button>
								) : undefined
							}
						/>
					</div>
				) : (
					<ul className="divide-y divide-border border-border border-t">
						{items.map((c) => (
							<li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
								<div className="grid min-w-0 flex-1 gap-0.5">
									<p className="flex flex-wrap items-center gap-2 font-medium text-sm">
										{c.name}
										{c.source === "ai" ? (
											<Badge tone="violet">
												<Sparkles aria-hidden="true" />
												AI-suggested
											</Badge>
										) : (
											<Badge tone="outline">
												<UserRound aria-hidden="true" />
												Added by you
											</Badge>
										)}
									</p>
									<p className="truncate text-muted-foreground text-xs">
										{c.domain ?? "No website"}
										{c.aliases.length ? ` · also: ${c.aliases.join(", ")}` : ""}
									</p>
								</div>
								{editor ? (
									<div className="flex gap-1">
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={`Edit ${c.name}`}
											onClick={() => setEditing(c)}
										>
											<Pencil />
										</Button>
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={`Delete ${c.name}`}
											onClick={() => setDeleting(c)}
										>
											<Trash2 />
										</Button>
									</div>
								) : null}
							</li>
						))}
					</ul>
				)}
			</div>

			{editing ? (
				<CompetitorDialog
					key={editing === "new" ? "new" : editing.id}
					competitor={editing === "new" ? null : editing}
					onClose={() => setEditing(null)}
				/>
			) : null}
			<ConfirmDialog
				open={deleting !== null}
				onOpenChange={(open) => (open ? undefined : setDeleting(null))}
				title={`Delete ${deleting?.name ?? "competitor"}?`}
				description="It stops being tracked in AI answers. Past checks keep their results."
				confirmLabel="Delete"
				tone="danger"
				onConfirm={async () => {
					if (!deleting) return;
					await remove.mutateAsync(deleting.id).catch(() => undefined);
					setDeleting(null);
				}}
			/>
		</Card>
	);
}

const DOMAIN_RE = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/** "https://www.acme.com/pricing" → "acme.com": people paste URLs into domain fields. */
function normalizeDomain(raw: string) {
	const trimmed = raw.trim().toLowerCase();
	if (!trimmed) return "";
	try {
		const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
		return url.hostname.replace(/^www\./, "");
	} catch {
		return trimmed;
	}
}

function CompetitorDialog({
	competitor,
	onClose,
}: {
	competitor: Competitor | null;
	onClose: () => void;
}) {
	const { create, update } = useCompetitorMutations();
	const [name, setName] = useState(competitor?.name ?? "");
	const [domain, setDomain] = useState(competitor?.domain ?? "");
	const [aliases, setAliases] = useState<string[]>(competitor?.aliases ?? []);
	const [touched, setTouched] = useState(false);
	const mutation = competitor ? update : create;

	const apiFields = isApiError(mutation.error) ? mutation.error.fields : {};
	const nameError =
		(touched && !name.trim() ? "Enter the competitor's name." : null) ?? apiFields.name ?? null;
	const cleanDomain = normalizeDomain(domain);
	const domainError =
		(touched && cleanDomain && !DOMAIN_RE.test(cleanDomain)
			? "Enter a domain like example.com."
			: null) ??
		apiFields.domain ??
		null;

	function onSubmit(e: FormEvent) {
		e.preventDefault();
		setTouched(true);
		if (!name.trim() || (cleanDomain && !DOMAIN_RE.test(cleanDomain))) return;
		const done = () => {
			toast.success(competitor ? "Competitor updated." : `${name.trim()} added.`);
			onClose();
		};
		// null clears a domain that was removed; undefined would leave it unchanged.
		const input = { name: name.trim(), domain: cleanDomain || null, aliases };
		if (competitor) update.mutate({ id: competitor.id, ...input }, { onSuccess: done });
		else create.mutate(input, { onSuccess: done });
	}

	const otherError =
		mutation.error && !apiFields.name && !apiFields.domain ? errorMessage(mutation.error) : null;

	return (
		<Dialog open onOpenChange={(open) => (open || mutation.isPending ? undefined : onClose())}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{competitor ? `Edit ${competitor.name}` : "Add a competitor"}</DialogTitle>
					<DialogDescription>
						We look for these names in AI answers to measure your share of voice.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSubmit} noValidate className="grid gap-4">
					<Field label="Name" htmlFor="competitor-name" error={nameError}>
						<Input
							id="competitor-name"
							value={name}
							maxLength={100}
							onChange={(e) => setName(e.target.value)}
							autoFocus
							{...fieldAria("competitor-name", nameError)}
						/>
					</Field>
					<Field
						label="Website (optional)"
						htmlFor="competitor-domain"
						error={domainError}
						hint="Lets us spot when AI answers cite their site."
					>
						<Input
							id="competitor-domain"
							value={domain}
							maxLength={255}
							placeholder="example.com"
							onChange={(e) => setDomain(e.target.value)}
							{...fieldAria("competitor-domain", domainError, true)}
						/>
					</Field>
					<Field
						label="Other names (optional)"
						htmlFor="competitor-aliases"
						hint="Press Enter after each one."
					>
						<TagInput
							id="competitor-aliases"
							value={aliases}
							onChange={setAliases}
							max={10}
							maxLength={100}
							placeholder="e.g. Acme Inc"
							aria-describedby="competitor-aliases-hint"
						/>
					</Field>
					{otherError ? (
						<p role="alert" className="text-danger text-sm">
							{otherError}
						</p>
					) : null}
					<DialogFooter>
						<Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
							Cancel
						</Button>
						<Button type="submit" loading={mutation.isPending}>
							{competitor ? "Save" : "Add competitor"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
