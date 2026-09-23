import type { PublishInput, SocialProvider } from "./types";

/**
 * Checks a post against a provider's declared capabilities. Used by the API when
 * a post is scheduled (so the user sees the problem in the composer) and again by
 * the worker right before publishing (content or media may have changed since).
 */
export function validateForProvider(provider: SocialProvider, input: PublishInput): string[] {
	const caps = provider.capabilities;
	const errors: string[] = [];
	const images = input.media.filter((m) => m.kind === "image");
	const videos = input.media.filter((m) => m.kind === "video");
	const name = provider.displayName;

	if (caps.requiresText && !input.text.trim()) errors.push(`${name} posts need text`);
	if (caps.requiresMedia && input.media.length === 0)
		errors.push(`${name} posts need an image or video`);
	if ([...input.text].length > caps.maxTextLength) {
		errors.push(
			`${name} allows at most ${caps.maxTextLength} characters (this post has ${[...input.text].length})`,
		);
	}
	if (images.length > caps.maxImages)
		errors.push(`${name} allows at most ${caps.maxImages} images`);
	if (videos.length > caps.maxVideos)
		errors.push(`${name} allows at most ${caps.maxVideos} video(s)`);
	if (!caps.mixedMedia && images.length > 0 && videos.length > 0) {
		errors.push(`${name} cannot mix images and videos in one post`);
	}
	for (const m of input.media) {
		const allowed = m.kind === "image" ? caps.imageMimeTypes : caps.videoMimeTypes;
		if (!allowed.includes(m.mimeType)) errors.push(`${name} does not accept ${m.mimeType} files`);
		const max = m.kind === "image" ? caps.maxImageBytes : caps.maxVideoBytes;
		if (m.sizeBytes > max)
			errors.push(`${name} ${m.kind}s must be under ${Math.round(max / 1_048_576)} MB`);
		if (
			m.kind === "video" &&
			caps.maxVideoDurationSeconds &&
			m.durationMs &&
			m.durationMs / 1000 > caps.maxVideoDurationSeconds
		) {
			errors.push(`${name} videos must be under ${caps.maxVideoDurationSeconds} seconds`);
		}
	}

	const settings = provider.settingsSchema.safeParse(input.settings);
	if (!settings.success) {
		for (const issue of settings.error.issues) errors.push(`${name}: ${issue.message}`);
		return errors;
	}
	return [...errors, ...(provider.validate?.({ ...input, settings: settings.data }) ?? [])];
}
