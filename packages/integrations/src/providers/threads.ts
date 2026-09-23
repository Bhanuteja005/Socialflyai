import { z } from "zod";
import {
	addDays,
	compact,
	DayAccumulator,
	type DayRange,
	dayStartSeconds,
	mapLimit,
	sumKnown,
	todayInRange,
} from "../analytics";
import { expiresAtFrom, form, providerJson } from "../http";
import type {
	AccountMetricsDay,
	AnalyticsSupport,
	Capabilities,
	ChannelContext,
	ConnectResult,
	MediaItem,
	PostMetrics,
	PublishInput,
	PublishOutcome,
	SocialProvider,
	TokenSet,
} from "../types";
import {
	advanceContainers,
	type ContainerApi,
	type ContainerPending,
	classifyMetaError,
	collectDailySeries,
	graphHeaders,
	type InsightEntry,
	insightTotals,
	isMissingGraphObject,
	parseContainerPending,
	toContainerState,
} from "./meta";

/**
 * Threads — personal Threads profiles via the Threads API (graph.threads.net).
 *
 * Separate Meta app product with its own app id/secret, OAuth dialog and token
 * types; it shares the Graph error format and the container → publish flow with
 * Instagram, which is why those helpers live in meta.ts.
 *
 * Docs: https://developers.facebook.com/docs/threads
 */

export type ThreadsConfig = { appId: string; appSecret: string };

const AUTH_URL = "https://threads.net/oauth/authorize";
const HOST = "https://graph.threads.net";
const API = `${HOST}/v1.0`;

/**
 * https://developers.facebook.com/docs/threads/overview#limitations (500 chars, 20
 * carousel items) and https://developers.facebook.com/docs/threads/overview#media-specifications
 * (JPEG/PNG images up to 8 MB; MOV/MP4 video up to 1 GB and 5 minutes).
 */
const capabilities: Capabilities = {
	maxTextLength: 500,
	requiresText: false,
	requiresMedia: false,
	maxImages: 20,
	maxVideos: 20,
	mixedMedia: true,
	imageMimeTypes: ["image/jpeg", "image/png"],
	videoMimeTypes: ["video/mp4", "video/quicktime"],
	maxImageBytes: 8 * 1024 * 1024,
	maxVideoBytes: 1024 * 1024 * 1024,
	maxVideoDurationSeconds: 5 * 60,
};

const settingsSchema = z.object({
	replyControl: z.enum(["everyone", "accounts_you_follow", "mentioned_only"]).default("everyone"),
});
type Settings = z.infer<typeof settingsSchema>;

type TokenResponse = { access_token: string; user_id?: string | number; expires_in?: number };

const SCOPES = [
	"threads_basic",
	"threads_content_publish",
	"threads_manage_insights",
	"threads_manage_replies",
];

/**
 * Threads has no multiple-ID insights read: one request per post. The cap and
 * the small concurrency keep a collector run well inside the per-profile quota.
 */
const THREADS_MAX_POSTS_PER_CALL = 25;
const THREADS_INSIGHTS_CONCURRENCY = 4;
/** "The earliest Unix timestamp that can be used is 1712991600" (2024-04-13 07:00 UTC). */
const THREADS_EARLIEST_SECONDS = 1_712_991_600;

export function mapThreadsInsights(totals: Record<string, number>): PostMetrics {
	return compact({
		impressions: totals.views,
		likes: totals.likes,
		comments: totals.replies,
		// Reposts, quotes and off-platform shares all spread the post further — the
		// same notion as X's reposts+quotes.
		shares: sumKnown(totals.reposts, totals.quotes, totals.shares),
	});
}

export class ThreadsProvider implements SocialProvider<Settings> {
	readonly id = "threads" as const;
	readonly displayName = "Threads";
	readonly capabilities = capabilities;
	readonly settingsSchema = settingsSchema as z.ZodType<Settings>;
	// Platform cap is 250 API-published posts per profile per 24h; this is app-wide pacing.
	// https://developers.facebook.com/docs/threads/troubleshooting#rate-limiting
	readonly publishRateLimit = { max: 5, durationMs: 60_000 };

	constructor(private readonly config: ThreadsConfig) {}

	isConfigured() {
		return Boolean(this.config.appId && this.config.appSecret);
	}

	private classify(mutating = false) {
		return (status: number, body: string) => classifyMetaError(this.id, status, body, mutating);
	}

	/** Needs threads_basic + threads_manage_insights, both already requested. */
	readonly analytics: AnalyticsSupport = {
		maxPostsPerCall: THREADS_MAX_POSTS_PER_CALL,
		getPostMetrics: (channel, ids) => this.getPostMetrics(channel, ids),
		getAccountMetrics: (channel, range) => this.getAccountMetrics(channel, range),
	};

	/** https://developers.facebook.com/docs/threads/insights */
	private async getPostMetrics(
		channel: ChannelContext,
		ids: string[],
	): Promise<Record<string, PostMetrics>> {
		const rows = await mapLimit(ids, THREADS_INSIGHTS_CONCURRENCY, async (id) => {
			try {
				const res = await providerJson<{ data?: InsightEntry[] }>(
					this.id,
					`${API}/${encodeURIComponent(id)}/insights?${form({
						metric: "views,likes,replies,reposts,quotes,shares",
					})}`,
					{ headers: graphHeaders(channel.accessToken, false), classify: this.classify() },
				);
				return [id, mapThreadsInsights(insightTotals(res.data))] as const;
			} catch (error) {
				// Deleted post: drop it, as the contract asks.
				if (isMissingGraphObject(error)) return undefined;
				throw error;
			}
		});
		return Object.fromEntries(rows.filter((r) => r !== undefined));
	}

	/**
	 * Daily `views` (time series) plus today's `followers_count`, which is a
	 * current total and does not accept since/until, hence the second request.
	 * https://developers.facebook.com/docs/threads/insights
	 */
	private async getAccountMetrics(
		channel: ChannelContext,
		range: DayRange,
	): Promise<AccountMetricsDay[]> {
		const days = new DayAccumulator(range);
		const since = Math.max(dayStartSeconds(range.since), THREADS_EARLIEST_SECONDS);
		const until = dayStartSeconds(addDays(range.until, 1));
		const headers = graphHeaders(channel.accessToken, false);
		const insightsUrl = `${API}/${channel.externalId}/threads_insights`;

		if (since < until) {
			const res = await providerJson<{ data?: InsightEntry[] }>(
				this.id,
				`${insightsUrl}?${form({ metric: "views", since: String(since), until: String(until) })}`,
				{ headers, classify: this.classify() },
			);
			for (const entry of res.data ?? []) {
				if (entry.name === "views") collectDailySeries(days, entry, "impressions");
			}
		}

		const today = todayInRange(range);
		if (today) {
			const res = await providerJson<{ data?: InsightEntry[] }>(
				this.id,
				`${insightsUrl}?${form({ metric: "followers_count" })}`,
				{ headers, classify: this.classify() },
			);
			days.set(today, { followers: insightTotals(res.data).followers_count });
		}
		return days.result();
	}

	/** https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions */
	async getAuthorizationUrl({ redirectUri, state }: { redirectUri: string; state: string }) {
		const url = new URL(AUTH_URL);
		url.search = form({
			client_id: this.config.appId,
			redirect_uri: redirectUri,
			scope: SCOPES.join(","),
			response_type: "code",
			state,
		});
		return { url: url.toString() };
	}

	/**
	 * The long-lived token (60 days) is also the refresh credential: Threads has no
	 * separate refresh token, you exchange the current long-lived token for a new one.
	 */
	private toTokens(t: TokenResponse): TokenSet {
		return {
			accessToken: t.access_token,
			refreshToken: t.access_token,
			expiresAt: expiresAtFrom(t.expires_in),
			scopes: SCOPES,
		};
	}

	async exchangeCode({
		code,
		redirectUri,
	}: {
		code: string;
		redirectUri: string;
	}): Promise<ConnectResult> {
		const short = await providerJson<TokenResponse>(this.id, `${HOST}/oauth/access_token`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: form({
				client_id: this.config.appId,
				client_secret: this.config.appSecret,
				grant_type: "authorization_code",
				redirect_uri: redirectUri,
				code,
			}),
			classify: this.classify(),
		});
		// https://developers.facebook.com/docs/threads/get-started/long-lived-tokens
		const long = await providerJson<TokenResponse>(
			this.id,
			`${HOST}/access_token?${form({
				grant_type: "th_exchange_token",
				client_secret: this.config.appSecret,
				access_token: short.access_token,
			})}`,
			{ classify: this.classify() },
		);
		const tokens = this.toTokens(long);

		const me = await providerJson<{
			id: string;
			username: string;
			name?: string;
			threads_profile_picture_url?: string;
		}>(this.id, `${API}/me?fields=id,username,name,threads_profile_picture_url`, {
			headers: graphHeaders(tokens.accessToken, false),
			classify: this.classify(),
		});
		return {
			tokens,
			accounts: [
				{
					externalId: me.id,
					name: me.name || me.username,
					username: me.username,
					avatarUrl: me.threads_profile_picture_url ?? null,
					profileUrl: `https://www.threads.net/@${me.username}`,
					metadata: { username: me.username },
				},
			],
		};
	}

	/**
	 * Only works on an unexpired long-lived token at least 24h old; an expired one
	 * fails with an auth error and the user reconnects.
	 */
	async refreshTokens(refreshToken: string): Promise<TokenSet> {
		return this.toTokens(
			await providerJson<TokenResponse>(
				this.id,
				`${HOST}/refresh_access_token?${form({ grant_type: "th_refresh_token", access_token: refreshToken })}`,
				{ classify: this.classify() },
			),
		);
	}

	/**
	 * Container → (processing) → threads_publish.
	 * https://developers.facebook.com/docs/threads/posts
	 */
	async publish(channel: ChannelContext, input: PublishInput<Settings>): Promise<PublishOutcome> {
		const replyControl = { reply_control: input.settings.replyControl };
		const [first] = input.media;
		let pending: ContainerPending;

		if (!first) {
			pending = {
				containerId: await this.createContainer(channel, {
					media_type: "TEXT",
					text: input.text,
					...replyControl,
				}),
			};
		} else if (input.media.length === 1) {
			pending = {
				containerId: await this.createContainer(channel, {
					...mediaParams(first),
					text: input.text,
					...replyControl,
				}),
			};
		} else {
			const childIds: string[] = [];
			for (const m of input.media) {
				childIds.push(
					await this.createContainer(channel, { ...mediaParams(m), is_carousel_item: true }),
				);
			}
			pending = { childIds, text: input.text, parentParams: replyControl };
		}

		// Meta recommends waiting before publishing; video always needs real processing
		// time, so hand it back to the worker. Text/image containers are checked once now.
		if (input.media.some((m) => m.kind === "video")) {
			return { status: "processing", pendingData: pending, pollAfterMs: 10_000 };
		}
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
				const res = await providerJson<{ status?: string; error_message?: string }>(
					this.id,
					`${API}/${id}?fields=status,error_message`,
					{ headers: graphHeaders(channel.accessToken, false), classify: this.classify() },
				);
				return toContainerState(res.status, res.error_message);
			},
			// reply_control for carousels rides along in pendingData.parentParams.
			createCarousel: (childIds, text, extra) =>
				this.createContainer(channel, {
					...extra,
					media_type: "CAROUSEL",
					children: childIds.join(","),
					text,
				}),
			publish: (containerId) => this.publishContainer(channel, containerId),
		};
	}

	/** Containers are unpublished drafts; creating one is not mutating. */
	private async createContainer(
		channel: ChannelContext,
		body: Record<string, unknown>,
	): Promise<string> {
		const res = await providerJson<{ id: string }>(
			this.id,
			`${API}/${channel.externalId}/threads`,
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
			`${API}/${channel.externalId}/threads_publish`,
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
				`${API}/${mediaId}?fields=permalink`,
				{
					headers: graphHeaders(channel.accessToken, false),
					classify: this.classify(),
				},
			);
			return res.permalink ?? null;
		} catch (error) {
			channel.logger.warn({ err: error, mediaId }, "threads permalink lookup failed");
			return null;
		}
	}
}

function mediaParams(m: MediaItem): Record<string, unknown> {
	if (m.kind === "video") return { media_type: "VIDEO", video_url: m.url };
	return { media_type: "IMAGE", image_url: m.url, ...(m.altText ? { alt_text: m.altText } : {}) };
}
