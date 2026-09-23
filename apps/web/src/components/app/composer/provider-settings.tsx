"use client";

import { Switch } from "@/components/ui/controls";
import { Field, Label } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
				<div className="flex items-center justify-between gap-3 self-end rounded-md border border-border px-3 py-2">
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
		<div className="grid gap-4">
			{withSettings.map((channel) => (
				<fieldset key={channel.id} className="grid gap-3 rounded-lg border border-border p-4">
					<legend className="flex items-center gap-2 px-1 font-medium text-sm">
						<ChannelAvatar channel={channel} size="sm" />
						{channel.name}
					</legend>
					<div className="grid gap-3 sm:grid-cols-2">
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
	);
}
