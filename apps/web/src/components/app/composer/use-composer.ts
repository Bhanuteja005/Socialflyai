"use client";

import { useCallback, useMemo, useState } from "react";
import type { Channel, MediaAsset, PostDetail } from "@/lib/api-types";
import { cleanSettings, defaultSettings, type TargetSettings } from "@/lib/providers";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/timezone";

export type ScheduleMode = "now" | "later";

export type ComposerState = {
	content: string;
	channelIds: string[];
	overrides: Record<string, string | undefined>;
	settings: Record<string, TargetSettings>;
	media: MediaAsset[];
	mode: ScheduleMode;
	/** datetime-local value, wall clock in the org's time zone. */
	scheduledLocal: string;
};

function defaultLater(timeZone: string) {
	// Next full hour, at least 30 minutes out.
	const d = new Date(Date.now() + 30 * 60_000);
	d.setUTCMinutes(0, 0, 0);
	d.setUTCHours(d.getUTCHours() + 1);
	return toLocalInputValue(d, timeZone);
}

export function initialState(
	timeZone: string,
	post?: PostDetail,
	presetDate?: string | null,
): ComposerState {
	if (!post) {
		const preset = presetDate ? new Date(presetDate) : null;
		return {
			content: "",
			channelIds: [],
			overrides: {},
			settings: {},
			media: [],
			mode: "later",
			scheduledLocal:
				preset && !Number.isNaN(preset.getTime()) && preset.getTime() > Date.now()
					? toLocalInputValue(preset, timeZone)
					: defaultLater(timeZone),
		};
	}
	const overrides: ComposerState["overrides"] = {};
	const settings: ComposerState["settings"] = {};
	for (const t of post.targets) {
		if (t.contentOverride !== null) overrides[t.channel.id] = t.contentOverride;
		const raw = (t.settings ?? {}) as TargetSettings;
		settings[t.channel.id] = Array.isArray(raw.tags) ? { ...raw, tags: raw.tags.join(", ") } : raw;
	}
	const scheduled = post.scheduledAt ? new Date(post.scheduledAt) : null;
	return {
		content: post.content,
		channelIds: post.targets.map((t) => t.channel.id),
		overrides,
		settings,
		media: post.media,
		mode: "later",
		scheduledLocal:
			scheduled && scheduled.getTime() > Date.now()
				? toLocalInputValue(scheduled, timeZone)
				: defaultLater(timeZone),
	};
}

export function useComposer(initial: ComposerState, channels: Channel[], timeZone: string) {
	const [state, setState] = useState(initial);
	const [dirty, setDirty] = useState(false);

	const update = useCallback((patch: Partial<ComposerState>) => {
		setState((s) => ({ ...s, ...patch }));
		setDirty(true);
	}, []);

	const channelById = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels]);

	const toggleChannel = useCallback(
		(id: string) => {
			setDirty(true);
			setState((s) => {
				if (s.channelIds.includes(id)) {
					return { ...s, channelIds: s.channelIds.filter((c) => c !== id) };
				}
				const provider = channelById.get(id)?.provider ?? "";
				return {
					...s,
					channelIds: [...s.channelIds, id],
					settings: s.settings[id]
						? s.settings
						: { ...s.settings, [id]: defaultSettings(provider) },
				};
			});
		},
		[channelById],
	);

	const updateMedia = useCallback((fn: (prev: MediaAsset[]) => MediaAsset[]) => {
		setDirty(true);
		setState((s) => ({ ...s, media: fn(s.media) }));
	}, []);

	const setOverride = useCallback((id: string, value: string | undefined) => {
		setDirty(true);
		setState((s) => ({ ...s, overrides: { ...s.overrides, [id]: value } }));
	}, []);

	const setSetting = useCallback((id: string, key: string, value: unknown) => {
		setDirty(true);
		setState((s) => ({
			...s,
			settings: { ...s.settings, [id]: { ...s.settings[id], [key]: value } },
		}));
	}, []);

	/** Channels that still exist (a channel may have been disconnected since the draft was saved). */
	const selected = useMemo(
		() => state.channelIds.map((id) => channelById.get(id)).filter((c): c is Channel => Boolean(c)),
		[state.channelIds, channelById],
	);

	const targets = useMemo(
		() =>
			selected.map((c) => ({
				channelId: c.id,
				contentOverride: state.overrides[c.id] ?? null,
				settings: cleanSettings(c.provider, state.settings[c.id] ?? {}),
			})),
		[selected, state.overrides, state.settings],
	);

	const scheduledAt = useMemo(() => {
		if (state.mode === "now") return null;
		return fromLocalInputValue(state.scheduledLocal, timeZone);
	}, [state.mode, state.scheduledLocal, timeZone]);

	return {
		state,
		update,
		dirty,
		setDirty,
		toggleChannel,
		updateMedia,
		setOverride,
		setSetting,
		selected,
		targets,
		scheduledAt,
		mediaIds: state.media.map((m) => m.id),
	};
}

export type Composer = ReturnType<typeof useComposer>;
