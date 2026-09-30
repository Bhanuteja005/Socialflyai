"use client";

import { Switch } from "@socialfly/ui/components/controls";
import { Field, Label } from "@socialfly/ui/components/field";
import { Input } from "@socialfly/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@socialfly/ui/components/select";
import type { Channel } from "@/lib/api-types";
import { providerMeta, type SettingField, type TargetSettings } from "@/lib/providers";
import { ChannelAvatar } from "../status-badge";

function SettingInput({
	field,
	id,
	value,
	onChange,
	disabled,
}: {
	field: SettingField;
	id: string;
	value: unknown;
	onChange: (value: unknown) => void;
	disabled?: boolean;
}) {
	switch (field.kind) {
		case "select":
			return (
				<Field label={field.label} htmlFor={id} hint={field.hint}>
					<Select
						value={typeof value === "string" ? value : field.defaultValue}
						onValueChange={onChange}
						disabled={disabled}
					>
						<SelectTrigger id={id}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{field.options.map((o) => (
								<SelectItem key={o.value} value={o.value}>
									{o.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
			);
		case "boolean":
			return (
				<div className="flex h-9 items-center justify-between gap-3 self-end rounded-full border border-border bg-surface px-4">
					<Label htmlFor={id} className="font-normal">
						{field.label}
					</Label>
					<Switch
						id={id}
						checked={typeof value === "boolean" ? value : field.defaultValue}
						onCheckedChange={onChange}
						disabled={disabled}
					/>
				</div>
			);
		case "tags":
			return (
				<Field label={field.label} htmlFor={id} hint={field.hint ?? "Separate tags with commas."}>
					<Input
						id={id}
						value={Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : ""}
						placeholder={field.placeholder}
						onChange={(e) => onChange(e.target.value)}
						disabled={disabled}
					/>
				</Field>
			);
		default: {
			const text = typeof value === "string" ? value : "";
			const missing = field.required && !text.trim();
			return (
				<Field
					label={
						<>
							{field.label}
							{field.required ? <span className="text-danger"> *</span> : null}
						</>
					}
					htmlFor={id}
					hint={
						field.maxLength
							? `${text.length}/${field.maxLength}${field.hint ? ` · ${field.hint}` : ""}`
							: field.hint
					}
				>
					<Input
						id={id}
						type={field.inputType ?? "text"}
						value={text}
						maxLength={field.maxLength}
						placeholder={field.placeholder}
						required={field.required}
						aria-invalid={missing || undefined}
						onChange={(e) => onChange(e.target.value)}
						disabled={disabled}
					/>
				</Field>
			);
		}
	}
}

/** Per-channel settings (subreddit, YouTube title, visibility...) for providers that have any. */
export function ProviderSettings({
	channels,
	settings,
	onChange,
	disabled,
}: {
	channels: Channel[];
	settings: Record<string, TargetSettings>;
	onChange: (channelId: string, key: string, value: unknown) => void;
	disabled?: boolean;
}) {
	const withSettings = channels.filter((c) => providerMeta(c.provider).settings.length > 0);
	if (withSettings.length === 0) return null;

	return (
		<section
			aria-label="Channel settings"
			className="overflow-hidden rounded-2xl border border-border bg-surface-raised"
		>
			<div className="border-border border-b px-5 py-3.5">
				<h2 className="font-medium text-[15px]">Channel settings</h2>
			</div>
			<div className="divide-y divide-border">
				{withSettings.map((channel) => (
					<fieldset key={channel.id} className="grid gap-3 px-5 py-4">
						<legend className="float-left mb-3 flex w-full items-center gap-2.5 font-medium text-sm">
							<ChannelAvatar channel={channel} size="xs" />
							{channel.name}
							<span className="font-normal text-muted-foreground text-xs">
								{providerMeta(channel.provider).name}
							</span>
						</legend>
						<div className="clear-both grid gap-3 sm:grid-cols-2">
							{providerMeta(channel.provider).settings.map((field) => (
								<SettingInput
									key={field.key}
									field={field}
									id={`setting-${channel.id}-${field.key}`}
									value={settings[channel.id]?.[field.key]}
									onChange={(v) => onChange(channel.id, field.key, v)}
									disabled={disabled}
								/>
							))}
						</div>
					</fieldset>
				))}
			</div>
		</section>
	);
}
