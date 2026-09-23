import { z } from "zod";
import { ProviderError } from "../errors";
import { expiresAtFrom, form, providerJson } from "../http";
import type {
	Capabilities,
	ChannelContext,
	ConnectResult,
	DiscoveredAccount,
	MediaItem,
	PublishInput,
	PublishOutcome,
	SocialProvider,
	TokenSet,
} from "../types";

/**
 * Meta — Facebook Pages (`facebook`) and Instagram professional accounts
 * (`instagram`), both through Facebook Login and the Graph API.
 *
 * Instagram here is the "Instagram API with Facebook Login": the IG account must
 * be a business/creator account linked to a Page, and we publish with that Page's
 * access token. (The newer "Instagram API with Instagram Login" is a different
 * product with different hosts and scopes.)
 *
 * Also home of the helpers Threads shares with them: the Graph error classifier
 * and the container → poll → publish state machine.
 *
 * Docs: https://developers.facebook.com/docs/graph-api
 */

export type MetaConfig = { appId: string; appSecret: string; graphVersion: string };

const DIALOG_HOST = "https://www.facebook.com";
const GRAPH_HOST = "https://graph.facebook.com";

// ---------------------------------------------------------------------------
// Shared Graph helpers (also used by threads.ts)
// ---------------------------------------------------------------------------

type GraphErrorBody = {
	error?: {
		message?: string;
		type?: string;
		code?: number;
		error_subcode?: number;
		is_transient?: boolean;
		error_user_msg?: string;
	};
};

/**
 * Throttling codes: 4 app-level, 17 user-level, 32 page-level, 613 custom rate
 * limit, 80001-80014 Business Use Case limits.
 * https://developers.facebook.com/docs/graph-api/overview/rate-limiting
 */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
const isBucCode = (code: number) => code >= 80_001 && code <= 80_014;
/** Meta's rate windows roll over an hour; retrying sooner than a few minutes just burns quota. */
const META_RATE_LIMIT_RETRY_MS = 15 * 60_000;

/**
 * Maps a Graph API error body to our taxonomy. Used as the `classify` hook of
 * every Graph call (graph.facebook.com and graph.threads.net share the format).
 * Returns undefined to fall back to the default HTTP-status mapping.
 *
 * https://developers.facebook.com/docs/graph-api/guides/error-handling
 */
export function classifyMetaError(
	provider: string,
	status: number,
	body: string,
	mutating = false,
): ProviderError | undefined {
	let parsed: GraphErrorBody;
	try {
		parsed = JSON.parse(body) as GraphErrorBody;
	} catch {
		return undefined;
	}
	const err = parsed.error;
	if (!err || typeof err.code !== "number") return undefined;

	const code = err.code;
	const message = err.error_user_msg ?? err.message ?? `Graph error ${code}`;
	const details = {
		status,
		body,
		platformCode: err.error_subcode ? `${code}/${err.error_subcode}` : String(code),
	};

	// 190: token expired/invalidated (password change, app removed). 102: session
	// invalid. 10 and 200-299: a permission was not granted or was revoked.
	if (code === 190 || code === 102 || code === 10 || (code >= 200 && code <= 299)) {
		return new ProviderError("auth", provider, message, details);
	}
	if (RATE_LIMIT_CODES.has(code) || isBucCode(code)) {
		return new ProviderError("rate_limited", provider, message, {
			...details,
			retryAfterMs: META_RATE_LIMIT_RETRY_MS,
		});
	}
	// 368: "temporarily blocked for policies violations" — retrying won't help.
	if (code === 368) return new ProviderError("invalid_request", provider, message, details);
	// 9007 (IG/Threads media_publish): "media is not ready". Meta refused the publish,
	// so nothing is visible and a later retry is safe even on the mutating call.
	if (code === 9007) return new ProviderError("transient", provider, message, details);
	// 1/2 and is_transient: Meta's own "try again later". On a create call we cannot
	// know whether it landed, so it must stay ambiguous.
	if (err.is_transient || code === 1 || code === 2) {
		return new ProviderError(
			mutating ? "unknown_outcome" : "transient",
			provider,
			message,
			details,
		);
	}
	if (status >= 500) {
		return new ProviderError(
			mutating ? "unknown_outcome" : "transient",
			provider,
			message,
			details,
		);
	}
	return new ProviderError("invalid_request", provider, message, details);
}

export const graphHeaders = (accessToken: string, json = true): Record<string, string> => ({
	Authorization: `Bearer ${accessToken}`,
	...(json ? { "Content-Type": "application/json" } : {}),
});

type Paged<T> = { data: T[]; paging?: { next?: string } };

/** Follows Graph cursor pagination (`paging.next` already carries the cursor). */
async function graphPages<T>(
	provider: string,
	firstUrl: string,
	accessToken: string,
): Promise<T[]> {
	const out: T[] = [];
	let next: string | undefined = firstUrl;
	// A user rarely manages hundreds of pages; the cap stops a runaway loop.
	for (let page = 0; next && page < 20; page++) {
		const res: Paged<T> = await providerJson<Paged<T>>(provider, next, {
			headers: graphHeaders(accessToken, false),
			classify: (s, b) => classifyMetaError(provider, s, b),
		});
		out.push(...res.data);
		next = res.paging?.next;
	}
	return out;
}

// ---------------------------------------------------------------------------
// Container flow (Instagram + Threads)
// ---------------------------------------------------------------------------

/**
 * Where a container-based post is between `publish` and `checkStatus` calls.
 * Stored by the worker as `pendingData`, so it must stay JSON-serialisable.
 *
 *  - `childIds` without `containerId`: carousel children still processing; the
 *    parent can only be created once every child is FINISHED.
 *  - `containerId`: the container to publish once it is FINISHED.
 */
export const containerPendingSchema = z.object({
	containerId: z.string().optional(),
	childIds: z.array(z.string()).optional(),
	text: z.string().optional(),
	/** Extra fields for the carousel parent (e.g. Threads `reply_control`). */
	parentParams: z.record(z.string(), z.string()).optional(),
});
export type ContainerPending = z.infer<typeof containerPendingSchema>;

export type ContainerState = { state: "pending" | "ready" | "failed"; message?: string };

export type ContainerApi = {
	provider: string;
	status(containerId: string): Promise<ContainerState>;
	createCarousel(childIds: string[], text: string, extra: Record<string, string>): Promise<string>;
	publish(containerId: string): Promise<PublishOutcome>;
	pollAfterMs: number;
};

export function parseContainerPending(
	provider: string,
	data: Record<string, unknown>,
): ContainerPending {
	const parsed = containerPendingSchema.safeParse(data);
	if (!parsed.success || (!parsed.data.containerId && !parsed.data.childIds?.length)) {
		throw new ProviderError("invalid_request", provider, "Malformed pending publish data");
	}
	return parsed.data;
}

/**
 * Moves a container post one step forward. Creating containers is invisible to
 * followers (not mutating); only `api.publish` makes the post visible.
 */
export async function advanceContainers(
	api: ContainerApi,
	pending: ContainerPending,
): Promise<PublishOutcome> {
	const failed = (state: ContainerState) =>
		new ProviderError(
			"invalid_request",
			api.provider,
			`Media processing failed${state.message ? `: ${state.message}` : ""}`,
		);
	const processing = (next: ContainerPending): PublishOutcome => ({
		status: "processing",
		pendingData: next,
		pollAfterMs: api.pollAfterMs,
	});

	let containerId = pending.containerId;
	if (!containerId) {
		const childIds = pending.childIds ?? [];
		const states = await Promise.all(childIds.map((id) => api.status(id)));
		const bad = states.find((s) => s.state === "failed");
		if (bad) throw failed(bad);
		if (states.some((s) => s.state === "pending")) return processing(pending);
		containerId = await api.createCarousel(
			childIds,
			pending.text ?? "",
			pending.parentParams ?? {},
		);
	}

	const state = await api.status(containerId);
	if (state.state === "failed") throw failed(state);
	if (state.state === "pending") return processing({ containerId });
	return api.publish(containerId);
}

/** Maps the status strings IG (`status_code`) and Threads (`status`) report. */
export function toContainerState(status: string | undefined, message?: string): ContainerState {
	switch (status) {
		case "FINISHED":
		case "PUBLISHED":
			return { state: "ready" };
		case "ERROR":
		case "EXPIRED":
			return { state: "failed", message: message ?? status };
		default:
			// IN_PROGRESS, or a status Meta added later: keep polling rather than fail.
			return { state: "pending" };
	}
}

// ---------------------------------------------------------------------------
// OAuth shared by Facebook and Instagram
// ---------------------------------------------------------------------------

type TokenResponse = { access_token: string; token_type?: string; expires_in?: number };

type PageRow = {
	id: string;
	name: string;
	access_token?: string;
	tasks?: string[];
	link?: string;
	picture?: { data?: { url?: string } };
	instagram_business_account?: {
		id: string;
		username?: string;
		name?: string;
		profile_picture_url?: string;
	};
};

abstract class MetaBase<TSettings extends Record<string, unknown>>
	implements SocialProvider<TSettings>
{
	abstract readonly id: "facebook" | "instagram";
	abstract readonly displayName: string;
	abstract readonly capabilities: Capabilities;
	abstract readonly settingsSchema: z.ZodType<TSettings>;
	abstract readonly publishRateLimit: { max: number; durationMs: number };
	protected abstract readonly scopes: string[];

	constructor(protected readonly config: MetaConfig) {}

	protected get graph() {
		return `${GRAPH_HOST}/${this.config.graphVersion}`;
	}

	isConfigured() {
		return Boolean(this.config.appId && this.config.appSecret && this.config.graphVersion);
	}

	protected classify(mutating = false) {
		return (status: number, body: string) => classifyMetaError(this.id, status, body, mutating);
	}

	/** https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow */
	async getAuthorizationUrl({ redirectUri, state }: { redirectUri: string; state: string }) {
		const url = new URL(`${DIALOG_HOST}/${this.config.graphVersion}/dialog/oauth`);
		url.search = form({
			client_id: this.config.appId,
			redirect_uri: redirectUri,
			state,
			response_type: "code",
			scope: this.scopes.join(","),
		});
		return { url: url.toString() };
	}

	/**
	 * Code → short-lived user token (~1-2h) → long-lived user token (~60 days).
	 * Page tokens derived from the LONG-lived user token do not expire, which is
	 * why the exchange matters even though we publish with page tokens.
	 * https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
	 */
	async exchangeCode({
		code,
		redirectUri,
	}: {
		code: string;
		redirectUri: string;
	}): Promise<ConnectResult> {
		const short = await providerJson<TokenResponse>(
			this.id,
			`${this.graph}/oauth/access_token?${form({
				client_id: this.config.appId,
				client_secret: this.config.appSecret,
				redirect_uri: redirectUri,
				code,
			})}`,
			{ classify: this.classify() },
		);
		const long = await providerJson<TokenResponse>(
			this.id,
			`${this.graph}/oauth/access_token?${form({
				grant_type: "fb_exchange_token",
				client_id: this.config.appId,
				client_secret: this.config.appSecret,
				fb_exchange_token: short.access_token,
			})}`,
			{ classify: this.classify() },
		);
		const tokens: TokenSet = {
			accessToken: long.access_token,
			// Facebook Login has no refresh token: a long-lived user token can only be
			// re-obtained by the user logging in again.
			refreshToken: null,
			expiresAt: expiresAtFrom(long.expires_in),
			scopes: this.scopes,
		};
		return { tokens, accounts: await this.discoverAccounts(tokens.accessToken) };
	}

	/** Page tokens from a long-lived user token never expire and cannot be refreshed. */
	protected pageTokens(pageToken: string): TokenSet {
		return { accessToken: pageToken, refreshToken: null, expiresAt: null, scopes: this.scopes };
	}

	protected async listPages(userToken: string, fields: string): Promise<PageRow[]> {
		return graphPages<PageRow>(
			this.id,
			`${this.graph}/me/accounts?${form({ fields, limit: "100" })}`,
			userToken,
		);
	}

	protected abstract discoverAccounts(userToken: string): Promise<DiscoveredAccount[]>;
	abstract publish(
		channel: ChannelContext,
		input: PublishInput<TSettings>,
	): Promise<PublishOutcome>;
}

// ---------------------------------------------------------------------------
// Facebook Pages
// ---------------------------------------------------------------------------

const facebookCapabilities: Capabilities = {
	// https://developers.facebook.com/docs/graph-api/reference/page/feed/ (message limit 63,206)
	maxTextLength: 63_206,
	requiresText: false,
	requiresMedia: false,
	// attached_media has no documented hard cap; the composer UI tops out around 10
	// and larger sets start failing intermittently, so we stay there.
	maxImages: 10,
	maxVideos: 1,
	mixedMedia: false,
	// https://developers.facebook.com/docs/graph-api/reference/page/photos/
	imageMimeTypes: ["image/jpeg", "image/png", "image/gif"],
	videoMimeTypes: ["video/mp4", "video/quicktime"],
	maxImageBytes: 10 * 1024 * 1024,
	// Non-resumable (file_url) uploads are limited to 1 GB / 20 minutes.
	// https://developers.facebook.com/docs/video-api/guides/publishing
	maxVideoBytes: 1024 * 1024 * 1024,
	maxVideoDurationSeconds: 20 * 60,
};

const facebookSettingsSchema = z.object({});
type FacebookSettings = z.infer<typeof facebookSettingsSchema>;

export class FacebookProvider extends MetaBase<FacebookSettings> {
	readonly id = "facebook" as const;
	readonly displayName = "Facebook";
	readonly capabilities = facebookCapabilities;
	readonly settingsSchema = facebookSettingsSchema as z.ZodType<FacebookSettings>;
	// Pages have their own BUC limits; this app-wide cap keeps us far below them.
	readonly publishRateLimit = { max: 10, durationMs: 60_000 };
	protected readonly scopes = [
		"pages_show_list",
		"pages_read_engagement",
		"pages_manage_posts",
		"pages_manage_metadata",
		"read_insights",
		"business_management",
	];

	protected async discoverAccounts(userToken: string): Promise<DiscoveredAccount[]> {
		const pages = await this.listPages(userToken, "id,name,access_token,tasks,link,picture{url}");
		return (
			pages
				// Without CREATE_CONTENT the page token cannot post (e.g. analyst role).
				.filter((p) => p.access_token && (!p.tasks || p.tasks.includes("CREATE_CONTENT")))
				.map((p) => ({
					externalId: p.id,
					name: p.name,
					avatarUrl: p.picture?.data?.url ?? null,
					profileUrl: p.link ?? `https://www.facebook.com/${p.id}`,
					tokens: this.pageTokens(p.access_token ?? ""),
				}))
		);
	}

	async publish(
		channel: ChannelContext,
		input: PublishInput<FacebookSettings>,
	): Promise<PublishOutcome> {
		const page = channel.externalId;
		const images = input.media.filter((m) => m.kind === "image");
		const video = input.media.find((m) => m.kind === "video");

		if (video) {
			// Facebook downloads file_url itself before answering, hence the long timeout.
			// https://developers.facebook.com/docs/graph-api/reference/page/videos/
			const res = await this.post<{ id: string }>(
				channel,
				`${page}/videos`,
				{ file_url: video.url, description: input.text },
				{ mutating: true, timeoutMs: 300_000 },
			);
			// The id is accepted and addressable immediately; encoding continues on
			// Facebook's side without changing whether the post exists.
			return { status: "published", externalId: res.id, url: `https://www.facebook.com/${res.id}` };
		}

		const [single] = images;
		if (images.length === 1 && single) {
			const res = await this.post<{ id: string; post_id?: string }>(
				channel,
				`${page}/photos`,
				{
					url: single.url,
					caption: input.text,
					...(single.altText ? { alt_text_custom: single.altText } : {}),
				},
				{ mutating: true },
			);
			const id = res.post_id ?? res.id;
			return { status: "published", externalId: id, url: `https://www.facebook.com/${id}` };
		}

		// Multi-photo: unpublished photos are invisible until attached, so uploading
		// them is not mutating; only the /feed call creates the visible post.
		// https://developers.facebook.com/docs/graph-api/reference/page/photos/#multi
		const attached: { media_fbid: string }[] = [];
		for (const image of images) {
			const photo = await this.post<{ id: string }>(channel, `${page}/photos`, {
				url: image.url,
				published: false,
				...(image.altText ? { alt_text_custom: image.altText } : {}),
			});
			attached.push({ media_fbid: photo.id });
		}

		const res = await this.post<{ id: string }>(
			channel,
			`${page}/feed`,
			{ message: input.text, ...(attached.length ? { attached_media: attached } : {}) },
			{ mutating: true },
		);
		return { status: "published", externalId: res.id, url: `https://www.facebook.com/${res.id}` };
	}

	private post<T>(
		channel: ChannelContext,
		path: string,
		body: Record<string, unknown>,
		opts: { mutating?: boolean; timeoutMs?: number } = {},
	): Promise<T> {
		return providerJson<T>(this.id, `${this.graph}/${path}`, {
			method: "POST",
			headers: graphHeaders(channel.accessToken),
			body: JSON.stringify(body),
			mutating: opts.mutating ?? false,
			timeoutMs: opts.timeoutMs,
			classify: this.classify(opts.mutating),
		});
	}
}

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------

/**
 * https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
 * (caption 2,200 chars, carousel up to 10 items, JPEG only, image 8 MB, reels up to 1 GB / 15 min).
 */
const instagramCapabilities: Capabilities = {
	maxTextLength: 2200,
	requiresText: false,
	requiresMedia: true,
	maxImages: 10,
	maxVideos: 10,
	mixedMedia: true,
	imageMimeTypes: ["image/jpeg"],
	videoMimeTypes: ["video/mp4", "video/quicktime"],
	maxImageBytes: 8 * 1024 * 1024,
	maxVideoBytes: 1024 * 1024 * 1024,
	maxVideoDurationSeconds: 15 * 60,
};

const instagramSettingsSchema = z.object({
	postType: z.enum(["feed", "reel", "story"]).default("feed"),
});
type InstagramSettings = z.infer<typeof instagramSettingsSchema>;

/** Feed images must sit between 4:5 (portrait) and 1.91:1 (landscape). */
export const IG_MIN_ASPECT = 4 / 5;
export const IG_MAX_ASPECT = 1.91;
const IG_MAX_HASHTAGS = 30;

/** Checks feed/carousel image aspect ratios where dimensions are known. */
export function instagramAspectRatioErrors(media: MediaItem[]): string[] {
	const errors: string[] = [];
	media.forEach((m, i) => {
		if (m.kind !== "image" || !m.width || !m.height) return;
		const ratio = m.width / m.height;
		if (ratio < IG_MIN_ASPECT || ratio > IG_MAX_ASPECT) {
			errors.push(
				`Instagram image ${i + 1} is ${m.width}×${m.height}; feed images must be between 4:5 and 1.91:1`,
			);
		}
	});
	return errors;
}

export function validateInstagram(input: PublishInput<InstagramSettings>): string[] {
	const errors: string[] = [];
	const { postType } = input.settings;
	const videos = input.media.filter((m) => m.kind === "video");

	if (postType === "reel" && (input.media.length !== 1 || videos.length !== 1)) {
		errors.push("Instagram reels need exactly one video");
	}
	if (postType === "story" && input.media.length !== 1) {
		errors.push("Instagram stories take exactly one image or video");
	}
	// Stories and reels are shown full-screen and cropped by Instagram; the ratio
	// rule only applies to feed posts and carousels.
	if (postType === "feed") errors.push(...instagramAspectRatioErrors(input.media));

	const hashtags = input.text.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
	if (hashtags > IG_MAX_HASHTAGS) {
		errors.push(`Instagram allows at most ${IG_MAX_HASHTAGS} hashtags (this post has ${hashtags})`);
	}
	return errors;
}

export class InstagramProvider extends MetaBase<InstagramSettings> {
	readonly id = "instagram" as const;
	readonly displayName = "Instagram";
	readonly capabilities = instagramCapabilities;
	readonly settingsSchema = instagramSettingsSchema as z.ZodType<InstagramSettings>;
	// Hard platform cap is 100 API-published posts per account per 24h; this is app-wide pacing.
	// https://developers.facebook.com/docs/instagram-platform/content-publishing#rate-limit
	readonly publishRateLimit = { max: 5, durationMs: 60_000 };
	protected readonly scopes = [
		"instagram_basic",
		"instagram_content_publish",
		"instagram_manage_insights",
		"instagram_manage_comments",
		"pages_show_list",
		"pages_read_engagement",
		"business_management",
	];

	validate(input: PublishInput<InstagramSettings>): string[] {
		return validateInstagram(input);
	}

	protected async discoverAccounts(userToken: string): Promise<DiscoveredAccount[]> {
		const pages = await this.listPages(
			userToken,
			"id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}",
		);
		const accounts: DiscoveredAccount[] = [];
		for (const page of pages) {
			const ig = page.instagram_business_account;
			if (!ig || !page.access_token) continue;
			accounts.push({
				externalId: ig.id,
				name: ig.name ?? ig.username ?? page.name,
				username: ig.username ?? null,
				avatarUrl: ig.profile_picture_url ?? null,
				profileUrl: ig.username ? `https://www.instagram.com/${ig.username}/` : null,
				tokens: this.pageTokens(page.access_token),
				metadata: { pageId: page.id, pageName: page.name },
			});
		}
		return accounts;
	}

	/**
	 * Content publishing: create container(s) → wait until FINISHED → media_publish.
	 * https://developers.facebook.com/docs/instagram-platform/content-publishing
	 */
	async publish(
		channel: ChannelContext,
		input: PublishInput<InstagramSettings>,
	): Promise<PublishOutcome> {
		const { postType } = input.settings;
		const [first] = input.media;
		if (!first)
			throw new ProviderError("invalid_request", this.id, "Instagram posts need an image or video");
		const hasVideo = input.media.some((m) => m.kind === "video");

		let pending: ContainerPending;
		if (postType === "story") {
			pending = {
				containerId: await this.createContainer(channel, {
					media_type: "STORIES",
					...(first.kind === "video" ? { video_url: first.url } : { image_url: first.url }),
				}),
			};
		} else if (postType === "reel" || (input.media.length === 1 && first.kind === "video")) {
			// Single feed videos are published as reels: media_type=VIDEO is deprecated
			// for feed posts and only valid for carousel children.
			pending = {
				containerId: await this.createContainer(channel, {
					media_type: "REELS",
					video_url: first.url,
					caption: input.text,
					share_to_feed: true,
				}),
			};
		} else if (input.media.length === 1) {
			pending = {
				containerId: await this.createContainer(channel, {
					image_url: first.url,
					caption: input.text,
				}),
			};
		} else {
			const childIds: string[] = [];
			for (const m of input.media) {
				childIds.push(
					await this.createContainer(
						channel,
						m.kind === "video"
							? { media_type: "VIDEO", video_url: m.url, is_carousel_item: true }
							: { image_url: m.url, is_carousel_item: true },
					),
				);
			}
			pending = { childIds, text: input.text };
		}

		// Videos take seconds to minutes to process: hand back to the worker rather
		// than block. Image containers are usually FINISHED at once.
		if (hasVideo) return { status: "processing", pendingData: pending, pollAfterMs: 10_000 };
		return advanceContainers(this.containerApi(channel), pending);
	}

	async checkStatus(
		channel: ChannelContext,
		pendingData: Record<string, unknown>,
	): Promise<PublishOutcome> {
		return advanceContainers(
			this.containerApi(channel),
			parseContainerPending(this.id, pendingData),
		);
	}

	private containerApi(channel: ChannelContext): ContainerApi {
		return {
			provider: this.id,
			pollAfterMs: 10_000,
			status: async (id) => {
				const res = await providerJson<{ status_code?: string; status?: string }>(
					this.id,
					`${this.graph}/${id}?fields=status_code,status`,
					{ headers: graphHeaders(channel.accessToken, false), classify: this.classify() },
				);
				return toContainerState(res.status_code, res.status);
			},
			createCarousel: (childIds, text) =>
				this.createContainer(channel, {
					media_type: "CAROUSEL",
					children: childIds.join(","),
					caption: text,
				}),
			publish: (containerId) => this.publishContainer(channel, containerId),
		};
	}

	/** Containers are private drafts; creating one is not mutating. */
	private async createContainer(
		channel: ChannelContext,
		body: Record<string, unknown>,
	): Promise<string> {
		const res = await providerJson<{ id: string }>(
			this.id,
			`${this.graph}/${channel.externalId}/media`,
			{
				method: "POST",
				headers: graphHeaders(channel.accessToken),
				body: JSON.stringify(body),
				classify: this.classify(),
			},
		);
		return res.id;
	}

	private async publishContainer(
		channel: ChannelContext,
		containerId: string,
	): Promise<PublishOutcome> {
		const res = await providerJson<{ id: string }>(
			this.id,
			`${this.graph}/${channel.externalId}/media_publish`,
			{
				method: "POST",
				mutating: true,
				headers: graphHeaders(channel.accessToken),
				body: JSON.stringify({ creation_id: containerId }),
				classify: this.classify(true),
			},
		);
		return { status: "published", externalId: res.id, url: await this.permalink(channel, res.id) };
	}

	/** The post is already live here: a failed lookup must never turn success into an error. */
	private async permalink(channel: ChannelContext, mediaId: string): Promise<string | null> {
		try {
			const res = await providerJson<{ permalink?: string }>(
				this.id,
				`${this.graph}/${mediaId}?fields=permalink`,
				{ headers: graphHeaders(channel.accessToken, false), classify: this.classify() },
			);
			return res.permalink ?? null;
		} catch (error) {
			channel.logger.warn({ err: error, mediaId }, "instagram permalink lookup failed");
			return null;
		}
	}
}
