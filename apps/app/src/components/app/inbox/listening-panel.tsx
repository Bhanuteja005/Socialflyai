"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@socialfly/ui/components/card";
import { Checkbox, Switch } from "@socialfly/ui/components/controls";
import { ConfirmDialog } from "@socialfly/ui/components/dialog";
import { Alert, EmptyState } from "@socialfly/ui/components/feedback";
import { Input } from "@socialfly/ui/components/input";
import { toast } from "@socialfly/ui/components/toast";
import { cn } from "@socialfly/ui/utils";
import { Check, Ear, Info, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useId, useState } from "react";
import { MAX_LISTENING, useListening, useListeningMutations } from "@/hooks/use-inbox";
import type { ListeningQuery } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, formatRelative } from "@/lib/format";
import { providerName } from "@/lib/providers";
import { useOrg } from "../org-provider";
import { ProviderIcon } from "../provider-icon";
import { ListSkeleton, LoadError } from "../research/research-shared";

type Provider = ListeningQuery["providers"][number];

function ProviderPicker({
	available,
	value,
	onChange,
	disabled,
}: {
	available: string[];
	value: string[];
	onChange: (next: string[]) => void;
	disabled?: boolean;
}) {
	const id = useId();
	return (
		<fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
			<legend className="sr-only">Search on</legend>
			{available.map((p) => (
				<div key={p} className="flex items-center gap-2">
					<Checkbox
						id={`${id}-${p}`}
						checked={value.includes(p)}
						disabled={disabled}
						onCheckedChange={(on) =>
							onChange(on === true ? [...new Set([...value, p])] : value.filter((x) => x !== p))
						}
					/>
					<label
						htmlFor={`${id}-${p}`}
						className="flex cursor-pointer items-center gap-1.5 text-sm"
					>
						<ProviderIcon provider={p} size="xs" />
						{providerName(p)}
					</label>
				</div>
			))}
		</fieldset>
	);
}

/** Keyword listening: queries that surface public discussions into the Discussions tab. */
export function ListeningPanel({ onShowDiscussions }: { onShowDiscussions: () => void }) {
	const { can } = useOrg();
	const editor = can("editor");
	const listening = useListening();
	const { create, remove } = useListeningMutations();
	const [query, setQuery] = useState("");
	const [providers, setProviders] = useState<string[] | null>(null);
	const [deleting, setDeleting] = useState<ListeningQuery | null>(null);

	if (listening.isPending) return <ListSkeleton rows={3} />;
	if (listening.isError) {
		return (
			<LoadError
				title="Couldn't load listening queries"
				error={listening.error}
				onRetry={() => void listening.refetch()}
			/>
		);
	}

	const { items, availableProviders } = listening.data;
	const chosen = providers ?? availableProviders;
	// The cap is on *active* queries (each is an hourly platform search); paused ones don't count.
	const activeCount = items.filter((q) => q.active).length;
	const full = activeCount >= MAX_LISTENING;
	const none = availableProviders.length === 0;

	function onAdd(e: FormEvent) {
		e.preventDefault();
		const q = query.trim();
		if (q.length < 2 || !chosen.length || full) return;
		create.mutate(
			{ query: q, providers: chosen as Provider[] },
			{
				onSuccess: () => {
					setQuery("");
					toast.success(
						"Listening. Matching discussions appear under Discussions after the next sync.",
					);
				},
			},
		);
	}

	return (
		<div className="grid max-w-3xl gap-4">
			<Card>
				<CardHeader>
					<CardTitle>Listening</CardTitle>
					<CardDescription>
						Public conversations where your brand could help land in{" "}
						<button
							type="button"
							onClick={onShowDiscussions}
							className="cursor-pointer text-foreground underline underline-offset-2"
						>
							Discussions
						</button>
						. Up to <span className="font-mono">{MAX_LISTENING}</span> active queries.
					</CardDescription>
				</CardHeader>

				{none ? (
					<div className="px-5 pt-4">
						<Alert tone="info" icon={Info} title="No channel can search yet">
							Listening searches public posts through a connected account. Connect a Reddit or X
							channel (with search access) to start.{" "}
							<Link href="/channels" className="font-medium underline underline-offset-2">
								Go to Channels
							</Link>
						</Alert>
					</div>
				) : editor ? (
					<form onSubmit={onAdd} className="grid gap-3 px-5 pt-4">
						<div className="flex flex-wrap gap-2">
							<label htmlFor="listening-query" className="sr-only">
								Search for
							</label>
							<Input
								id="listening-query"
								value={query}
								maxLength={200}
								disabled={full || create.isPending}
								placeholder={
									full
										? `${MAX_LISTENING} queries are active — pause or delete one to add another`
										: "e.g. “best social media scheduler” or buffer alternative"
								}
								onChange={(e) => setQuery(e.target.value)}
								className="min-w-60 flex-1"
							/>
							<Button
								type="submit"
								loading={create.isPending}
								disabled={full || query.trim().length < 2 || !chosen.length}
							>
								{create.isPending ? null : <Plus />}
								Add
							</Button>
						</div>
						<ProviderPicker
							available={availableProviders}
							value={chosen}
							onChange={setProviders}
							disabled={full || create.isPending}
						/>
						{create.error ? (
							<p role="alert" className="text-danger text-xs">
								{errorMessage(create.error)}
							</p>
						) : null}
					</form>
				) : null}

				<div className="mt-4">
					{items.length === 0 ? (
						<div className="px-5 pb-5">
							<EmptyState
								compact
								icon={Ear}
								title="No listening queries yet"
								description={
									none
										? "Connect a channel that supports search first."
										: "Add a phrase people use when they need what you offer."
								}
							/>
						</div>
					) : (
						<>
							<p className="px-5 pb-2 font-mono text-muted-foreground text-xs tabular-nums">
								{activeCount} of {MAX_LISTENING} active
								{items.length > activeCount ? ` · ${items.length - activeCount} paused` : ""}
							</p>
							<ul className="divide-y divide-border border-border border-t">
								{items.map((q) => (
									<ListeningRow
										key={q.id}
										item={q}
										editor={editor}
										available={availableProviders}
										canResume={!full}
										onDelete={() => setDeleting(q)}
									/>
								))}
							</ul>
						</>
					)}
				</div>
			</Card>

			<ConfirmDialog
				open={deleting !== null}
				onOpenChange={(open) => (open ? undefined : setDeleting(null))}
				title="Delete this listening query?"
				description="We stop searching for it. Discussions it already found stay in your inbox."
				confirmLabel="Delete"
				tone="danger"
				onConfirm={async () => {
					if (!deleting) return;
					await remove.mutateAsync(deleting.id).catch(() => undefined);
					setDeleting(null);
				}}
			/>
		</div>
	);
}

function ListeningRow({
	item,
	editor,
	available,
	canResume,
	onDelete,
}: {
	item: ListeningQuery;
	editor: boolean;
	available: string[];
	/** False at the active cap: a paused query can't be resumed until another is paused. */
	canResume: boolean;
	onDelete: () => void;
}) {
	const id = useId();
	const { update } = useListeningMutations();
	const [editing, setEditing] = useState(false);
	const [query, setQuery] = useState(item.query);
	const [providers, setProviders] = useState<string[]>(item.providers);
	// Providers no longer available (channel disconnected) are shown but can't be re-picked.
	const unavailable = item.providers.filter((p) => !available.includes(p));

	function onSave(e: FormEvent) {
		e.preventDefault();
		const q = query.trim();
		if (q.length < 2 || !providers.length) return;
		update.mutate(
			{ id: item.id, query: q, providers: providers as Provider[] },
			{ onSuccess: () => setEditing(false) },
		);
	}

	return (
		<li className={cn("grid gap-2 px-5 py-3", !item.active && "bg-surface")}>
			{editing ? (
				<form onSubmit={onSave} className="grid gap-2">
					<div className="flex gap-2">
						<label htmlFor={`${id}-q`} className="sr-only">
							Search for
						</label>
						<Input
							id={`${id}-q`}
							value={query}
							maxLength={200}
							autoFocus
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Escape") setEditing(false);
							}}
						/>
						<Button
							type="submit"
							size="icon-sm"
							aria-label="Save query"
							loading={update.isPending}
							disabled={query.trim().length < 2 || !providers.length}
						>
							{update.isPending ? null : <Check />}
						</Button>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Cancel editing"
							onClick={() => {
								setQuery(item.query);
								setProviders(item.providers);
								setEditing(false);
							}}
						>
							<X />
						</Button>
					</div>
					<ProviderPicker
						available={available}
						value={providers.filter((p) => available.includes(p))}
						onChange={setProviders}
					/>
					{update.error ? (
						<p role="alert" className="text-danger text-xs">
							{errorMessage(update.error)}
						</p>
					) : null}
				</form>
			) : (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
					<div className="grid min-w-0 flex-1 gap-1">
						<p className={cn("font-medium text-sm", !item.active && "text-muted-foreground")}>
							“{item.query}”
						</p>
						<p className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
							{item.providers.map((p) => (
								<span
									key={p}
									className={cn(
										"inline-flex items-center gap-1",
										unavailable.includes(p) && "line-through opacity-60",
									)}
									title={
										unavailable.includes(p) ? "No connected channel can search here" : undefined
									}
								>
									<ProviderIcon provider={p} size="xs" />
									{providerName(p)}
								</span>
							))}
							<span>
								·{" "}
								{item.lastRunAt ? (
									<time dateTime={item.lastRunAt} title={formatDateTime(item.lastRunAt)}>
										searched {formatRelative(item.lastRunAt)}
									</time>
								) : (
									"not searched yet"
								)}
							</span>
						</p>
					</div>
					{item.newCount ? (
						<Badge tone="primary" className="font-mono">
							{item.newCount} new
						</Badge>
					) : null}
					{editor ? (
						<div className="flex items-center gap-1">
							<Switch
								checked={item.active}
								aria-label={item.active ? `Pause “${item.query}”` : `Resume “${item.query}”`}
								disabled={update.isPending || (!item.active && !canResume)}
								title={
									!item.active && !canResume
										? `${MAX_LISTENING} queries are already active — pause one first`
										: undefined
								}
								onCheckedChange={(active) =>
									update.mutate(
										{ id: item.id, active },
										{ onError: (e) => toast.error(errorMessage(e)) },
									)
								}
							/>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Edit “${item.query}”`}
								onClick={() => setEditing(true)}
							>
								<Pencil />
							</Button>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Delete “${item.query}”`}
								onClick={onDelete}
							>
								<Trash2 />
							</Button>
						</div>
					) : null}
				</div>
			)}
		</li>
	);
}
