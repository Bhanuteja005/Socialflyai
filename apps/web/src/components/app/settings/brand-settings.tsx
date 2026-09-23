"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { Field, fieldAria } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";
import { toast } from "@/components/ui/toast";
import { useBrandProfile } from "@/hooks/use-ai";
import { useFormErrors } from "@/hooks/use-form-errors";
import { api, call } from "@/lib/api-client";
import type { BrandProfile, BrandProfileInput } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { SettingsNav } from "./settings-nav";

const MAX_EXAMPLES = 5;

type FormState = Omit<BrandProfile, "organizationId" | "updatedAt" | "website"> & {
	website: string;
};

const toForm = (p: BrandProfile): FormState => ({
	brandName: p.brandName,
	description: p.description,
	audience: p.audience,
	voice: p.voice,
	website: p.website ?? "",
	keywords: [...p.keywords],
	avoid: [...p.avoid],
	examplePosts: [...p.examplePosts],
});

const toInput = (f: FormState): BrandProfileInput => ({
	brandName: f.brandName.trim(),
	description: f.description.trim(),
	audience: f.audience.trim(),
	voice: f.voice.trim(),
	website: f.website.trim() || null,
	keywords: f.keywords,
	avoid: f.avoid,
	// Empty boxes are just unused slots, not examples.
	examplePosts: f.examplePosts.map((p) => p.trim()).filter(Boolean),
});

export function BrandSettings() {
	const brand = useBrandProfile();
	return (
		<div className="max-w-3xl">
			<PageHeader title="Settings" />
			<SettingsNav />
			{brand.isPending ? (
				<div className="grid gap-6">
					<Skeleton className="h-72" />
					<Skeleton className="h-48" />
				</div>
			) : brand.isError ? (
				<EmptyState
					title="Couldn't load your brand voice"
					description={errorMessage(brand.error)}
					action={
						<Button variant="outline" onClick={() => brand.refetch()}>
							Retry
						</Button>
					}
				/>
			) : (
				// Keyed so a save (new updatedAt) re-seeds the form from what the server kept.
				<BrandForm key={brand.data.updatedAt ?? "new"} profile={brand.data} />
			)}
		</div>
	);
}

function BrandForm({ profile }: { profile: BrandProfile }) {
	const { orgId, can } = useOrg();
	const editable = can("editor");
	const queryClient = useQueryClient();
	const errors = useFormErrors();
	const [initial] = useState(() => toForm(profile));
	const [form, setForm] = useState(initial);
	const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
		setForm((f) => ({ ...f, [key]: value }));

	const save = useMutation({
		mutationFn: (input: BrandProfileInput) => call(api.ai.brand.$put({ json: input })),
		onSuccess: (saved) => {
			queryClient.setQueryData(qk.brand(orgId), saved);
			toast.success("Brand voice saved");
		},
		onError: (e) => errors.fromError(e),
	});

	const changed = JSON.stringify(toInput(form)) !== JSON.stringify(toInput(initial));

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		errors.reset();
		save.mutate(toInput(form));
	}

	const err = (key: string) => errors.fields[key];
	const exampleError = Object.entries(errors.fields).find(([k]) =>
		k.startsWith("examplePosts"),
	)?.[1];

	return (
		<form onSubmit={onSubmit} noValidate className="grid gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Brand voice</CardTitle>
					<CardDescription>
						{editable
							? "AI assist uses this to write posts that sound like you. Every field is optional."
							: "AI assist uses this to write posts that sound like you. Only editors can change it."}
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 sm:grid-cols-2">
					<Field label="Brand name" htmlFor="brand-name" error={err("brandName")}>
						<Input
							id="brand-name"
							value={form.brandName}
							maxLength={100}
							disabled={!editable}
							onChange={(e) => set("brandName", e.target.value)}
							{...fieldAria("brand-name", err("brandName"))}
						/>
					</Field>
					<Field label="Website" htmlFor="brand-website" error={err("website")}>
						<Input
							id="brand-website"
							type="url"
							inputMode="url"
							placeholder="https://example.com"
							value={form.website}
							maxLength={500}
							disabled={!editable}
							onChange={(e) => set("website", e.target.value)}
							{...fieldAria("brand-website", err("website"))}
						/>
					</Field>
					<Field
						label="What you do"
						htmlFor="brand-description"
						error={err("description")}
						hint="A sentence or two about your product, service or mission."
						className="sm:col-span-2"
					>
						<Textarea
							id="brand-description"
							value={form.description}
							maxLength={1000}
							disabled={!editable}
							onChange={(e) => set("description", e.target.value)}
							{...fieldAria("brand-description", err("description"), true)}
						/>
					</Field>
					<Field
						label="Audience"
						htmlFor="brand-audience"
						error={err("audience")}
						hint="Who you're talking to, e.g. “early-stage founders in fintech”."
						className="sm:col-span-2"
					>
						<Textarea
							id="brand-audience"
							value={form.audience}
							maxLength={1000}
							disabled={!editable}
							className="min-h-20"
							onChange={(e) => set("audience", e.target.value)}
							{...fieldAria("brand-audience", err("audience"), true)}
						/>
					</Field>
					<Field
						label="Voice and tone"
						htmlFor="brand-voice"
						error={err("voice")}
						hint="How you sound, e.g. “warm, direct, a little playful; no jargon”."
						className="sm:col-span-2"
					>
						<Textarea
							id="brand-voice"
							value={form.voice}
							maxLength={1000}
							disabled={!editable}
							className="min-h-20"
							onChange={(e) => set("voice", e.target.value)}
							{...fieldAria("brand-voice", err("voice"), true)}
						/>
					</Field>
					<Field
						label="Keywords"
						htmlFor="brand-keywords"
						error={err("keywords")}
						hint="Topics and terms to lean on. Press Enter after each."
					>
						<TagInput
							id="brand-keywords"
							value={form.keywords}
							onChange={(v) => set("keywords", v)}
							placeholder="Add a keyword"
							disabled={!editable}
							{...fieldAria("brand-keywords", err("keywords"), true)}
						/>
					</Field>
					<Field
						label="Avoid"
						htmlFor="brand-avoid"
						error={err("avoid")}
						hint="Words, topics or claims AI should never use."
					>
						<TagInput
							id="brand-avoid"
							value={form.avoid}
							onChange={(v) => set("avoid", v)}
							placeholder="Add a word or topic"
							disabled={!editable}
							{...fieldAria("brand-avoid", err("avoid"), true)}
						/>
					</Field>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Example posts</CardTitle>
					<CardDescription>
						Up to {MAX_EXAMPLES} posts you're proud of. AI matches their style, not their content.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-3">
					{form.examplePosts.length === 0 ? (
						<p className="text-muted-foreground text-sm">No examples yet.</p>
					) : null}
					{form.examplePosts.map((post, index) => {
						const id = `brand-example-${index}`;
						return (
							// biome-ignore lint/suspicious/noArrayIndexKey: plain strings with no identity; order is the identity
							<div key={index} className="flex items-start gap-2">
								<div className="grid flex-1 gap-1.5">
									<label htmlFor={id} className="sr-only">
										Example post {index + 1}
									</label>
									<Textarea
										id={id}
										value={post}
										maxLength={3000}
										disabled={!editable}
										placeholder="Paste a post that sounds like you"
										onChange={(e) =>
											set(
												"examplePosts",
												form.examplePosts.map((p, i) => (i === index ? e.target.value : p)),
											)
										}
									/>
								</div>
								{editable ? (
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={`Remove example post ${index + 1}`}
										onClick={() =>
											set(
												"examplePosts",
												form.examplePosts.filter((_, i) => i !== index),
											)
										}
									>
										<Trash2 />
									</Button>
								) : null}
							</div>
						);
					})}
					{exampleError ? <p className="text-danger text-xs">{exampleError}</p> : null}
					{editable && form.examplePosts.length < MAX_EXAMPLES ? (
						<div>
							<Button
								variant="outline"
								size="sm"
								onClick={() => set("examplePosts", [...form.examplePosts, ""])}
							>
								<Plus />
								Add example
							</Button>
						</div>
					) : null}
				</CardContent>
				{editable ? (
					<CardFooter>
						{errors.form ? (
							<p className="mr-auto text-danger text-xs" role="alert">
								{errors.form}
							</p>
						) : null}
						<Button type="submit" loading={save.isPending} disabled={!changed}>
							Save changes
						</Button>
					</CardFooter>
				) : null}
			</Card>
		</form>
	);
}
