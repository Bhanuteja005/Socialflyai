"use client";

import { Button } from "@socialfly/ui/components/button";
import { Alert } from "@socialfly/ui/components/feedback";
import { Input, Textarea } from "@socialfly/ui/components/input";
import { NativeSelect } from "@socialfly/ui/components/select";
import { toast } from "@socialfly/ui/components/toast";
import { cn } from "@socialfly/ui/utils";
import { AlertTriangle, Save, Send, Sparkles, X } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useAiCapabilities } from "@/hooks/use-ai";
import { useCreateReply, useDraftReply, useReplyMutations } from "@/hooks/use-inbox";
import type { InboxItemDetail, InboxReply } from "@/lib/api-types";
import { errorMessage, isApiError } from "@/lib/errors";
import { textLength } from "@/lib/format";
import { providerName } from "@/lib/providers";
import { AiError } from "../ai/ai-shared";
import { useOrg } from "../org-provider";
import { authorName, limitFromError, replyLimit, submitLabel } from "./inbox-shared";

const TONES = [
	{ value: "", label: "Brand voice" },
	{ value: "friendly", label: "Friendly" },
	{ value: "professional", label: "Professional" },
	{ value: "casual", label: "Casual" },
	{ value: "empathetic", label: "Empathetic" },
	{ value: "witty", label: "Witty" },
];

/** What happened to a reply once it left the composer, in words. */
function outcome(reply: Pick<InboxReply, "status">, submitted: boolean) {
	if (!submitted) return "Draft saved";
	if (reply.status === "pending_approval") return "Sent for approval. An admin will review it.";
	return "Reply on its way. It'll appear on the platform in a moment.";
}

export type ComposerEdit = { id: string | null; text: string; n: number };

export function ReplyComposer({
	item,
	edit,
	onEditDone,
	focusSignal,
	approvalRequired,
}: {
	item: InboxItemDetail;
	/** A reply loaded from the history (`id` set → saving updates it). */
	edit: ComposerEdit | null;
	onEditDone: () => void;
	/** Changes when the composer should take focus (the "r" shortcut). */
	focusSignal: number;
	approvalRequired: boolean | undefined;
}) {
	const { role } = useOrg();
	const id = useId();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const caps = useAiCapabilities();
	const create = useCreateReply(item.id);
	const { update } = useReplyMutations(item.id);
	const draft = useDraftReply(item.id);

	const [text, setText] = useState("");
	/** The last AI draft verbatim: a reply sent unedited is recorded as AI-written. */
	const [aiText, setAiText] = useState<string | null>(null);
	const [aiOpen, setAiOpen] = useState(false);
	const [tone, setTone] = useState("");
	const [instruction, setInstruction] = useState("");
	/** The platform's real limit once the API has told us (a 422). */
	const [serverLimit, setServerLimit] = useState<number | null>(null);
	const [error, setError] = useState<unknown>(null);

	useEffect(() => {
		if (!edit) return;
		setText(edit.text);
		setAiText(null);
		textareaRef.current?.focus();
	}, [edit]);

	useEffect(() => {
		if (focusSignal) textareaRef.current?.focus();
	}, [focusSignal]);

	const limit = serverLimit ?? item.maxReplyLength ?? replyLimit(item.provider);
	const length = textLength(text);
	const over = length > limit;
	const empty = text.trim().length === 0;
	const editingId = edit?.id ?? null;
	const [pending, setPending] = useState<"draft" | "submit" | null>(null);
	const busy = pending !== null;

	async function save(submit: boolean) {
		if (empty || over || busy) return;
		setError(null);
		setPending(submit ? "submit" : "draft");
		try {
			const reply = editingId
				? await update.mutateAsync({ id: editingId, text: text.trim(), submit })
				: await create.mutateAsync({
						text: text.trim(),
						source: aiText !== null && text.trim() === aiText.trim() ? "ai" : "human",
						submit,
					});
			toast.success(outcome(reply, submit));
			setText("");
			setAiText(null);
			onEditDone();
		} catch (e) {
			const reported = limitFromError(e);
			if (reported) setServerLimit(reported);
			setError(e);
		} finally {
			setPending(null);
		}
	}

	function onSubmit(e: FormEvent) {
		e.preventDefault();
		void save(true);
	}

	function onDraft(e: FormEvent) {
		e.preventDefault();
		const previous = text;
		draft.mutate(
			{ tone: tone || undefined, instruction: instruction.trim() || undefined },
			{
				onSuccess: (r) => {
					setText(r.text);
					setAiText(r.text);
					setAiOpen(false);
					textareaRef.current?.focus();
					if (previous.trim())
						toast.success("Draft replaced your text", {
							action: { label: "Undo", onClick: () => setText(previous) },
						});
				},
			},
		);
	}

	const aiAvailable = caps.data?.text !== false;
	const primary = submitLabel(role, approvalRequired);
	const notPossible =
		isApiError(error) && error.code === "reply_not_possible"
			? String(error.details?.reason ?? error.message)
			: null;

	return (
		<section aria-labelledby={`${id}-title`} className="grid gap-2">
			<div className="flex items-center justify-between gap-2">
				<h3
					id={`${id}-title`}
					className="font-medium text-[11px] text-subtle-foreground uppercase tracking-wider"
				>
					{editingId ? "Edit reply" : `Reply to ${authorName(item.author)}`}
				</h3>
				{aiAvailable ? (
					<Button
						variant="ghost"
						size="xs"
						aria-expanded={aiOpen}
						aria-controls={`${id}-ai`}
						onClick={() => setAiOpen((o) => !o)}
					>
						<Sparkles />
						Draft with AI
					</Button>
				) : null}
			</div>

			{aiOpen ? (
				<form
					id={`${id}-ai`}
					onSubmit={onDraft}
					className="grid gap-2 rounded-lg border border-primary/25 bg-primary-soft/30 p-3"
				>
					<div className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
						<div className="grid gap-1">
							<label htmlFor={`${id}-tone`} className="font-medium text-xs">
								Tone
							</label>
							<NativeSelect
								id={`${id}-tone`}
								value={tone}
								className="h-8"
								onChange={(e) => setTone(e.target.value)}
								disabled={draft.isPending}
							>
								{TONES.map((t) => (
									<option key={t.value} value={t.value}>
										{t.label}
									</option>
								))}
							</NativeSelect>
						</div>
						<div className="grid gap-1">
							<label htmlFor={`${id}-instruction`} className="font-medium text-xs">
								Instruction (optional)
							</label>
							<Input
								id={`${id}-instruction`}
								value={instruction}
								maxLength={300}
								className="h-8"
								placeholder="e.g. thank them and point to the pricing page"
								onChange={(e) => setInstruction(e.target.value)}
								disabled={draft.isPending}
							/>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<Button type="submit" size="xs" loading={draft.isPending}>
							{draft.isPending ? null : <Sparkles />}
							{draft.isPending ? "Drafting…" : text.trim() ? "Draft again" : "Draft reply"}
						</Button>
						<p className="text-muted-foreground text-xs">
							Fills the box below. Nothing is posted until you send it.
						</p>
					</div>
					<AiError error={draft.error} />
				</form>
			) : null}

			<form onSubmit={onSubmit} className="grid gap-2">
				<label htmlFor={`${id}-text`} className="sr-only">
					Reply text
				</label>
				<Textarea
					ref={textareaRef}
					id={`${id}-text`}
					value={text}
					className="min-h-28"
					placeholder={`Write a reply on ${providerName(item.provider)}…`}
					aria-invalid={over || undefined}
					aria-describedby={`${id}-count`}
					aria-keyshortcuts="Control+Enter Meta+Enter"
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
							e.preventDefault();
							void save(true);
						}
					}}
				/>
				<div className="flex flex-wrap items-center gap-2">
					<p
						id={`${id}-count`}
						className={cn(
							"text-xs tabular-nums",
							over
								? "font-medium text-danger"
								: length > limit * 0.9
									? "text-warning"
									: "text-muted-foreground",
						)}
						aria-live={length > limit * 0.9 ? "polite" : "off"}
					>
						{length.toLocaleString()} / {limit.toLocaleString()}
						{over
							? ` — ${(length - limit).toLocaleString()} over ${providerName(item.provider)}'s limit`
							: ""}
					</p>
					<div className="ml-auto flex flex-wrap gap-2">
						{editingId ? (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									setText("");
									onEditDone();
								}}
							>
								<X />
								Cancel
							</Button>
						) : null}
						<Button
							variant="outline"
							size="sm"
							disabled={empty || over || busy}
							loading={pending === "draft"}
							onClick={() => void save(false)}
						>
							<Save />
							Save draft
						</Button>
						<Button
							type="submit"
							size="sm"
							disabled={empty || over || busy}
							loading={pending === "submit"}
						>
							{pending === "submit" ? null : <Send />}
							{primary}
						</Button>
					</div>
				</div>
				{notPossible ? (
					<Alert tone="warning" icon={AlertTriangle} title="Can't reply to this from SocialFly">
						{notPossible}
					</Alert>
				) : error ? (
					<p role="alert" className="text-danger text-xs">
						{errorMessage(error)}
					</p>
				) : null}
			</form>
		</section>
	);
}
