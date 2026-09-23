import type {
	AccountMetricsDay,
	AnalyticsSupport,
	ChannelContext,
	DiscussionItem,
	EngagementItem,
	EngagementSupport,
	PostMetrics,
	PublishOutcome,
	SocialProvider,
	TokenSet,
} from "@socialfly/integrations";
import { z } from "zod";

type Step = PublishOutcome | Error;

/**
 * A scripted platform: each publish/checkStatus call consumes the next step
 * (an outcome to return or an error to throw). Records every call, so tests can
 * assert how many times the "platform" was actually hit.
 */
export class FakeProvider implements SocialProvider {
	readonly id = "linkedin" as const;
	readonly displayName = "Fake LinkedIn";
	readonly capabilities = {
		maxTextLength: 280,
		requiresText: true,
		requiresMedia: false,
		maxImages: 4,
		maxVideos: 1,
		mixedMedia: false,
		imageMimeTypes: ["image/png"],
		videoMimeTypes: ["video/mp4"],
		maxImageBytes: 5_000_000,
		maxVideoBytes: 50_000_000,
	};
	readonly settingsSchema = z.object({}).passthrough() as unknown as z.ZodType<
		Record<string, unknown>
	>;
	readonly publishRateLimit = { max: 100, durationMs: 1000 };

	publishSteps: Step[] = [];
	statusSteps: Step[] = [];
	publishCalls: { token: string; text: string }[] = [];
	statusCalls = 0;
	refreshCalls = 0;

	/** Absent until a test calls `withAnalytics`, so publishing tests see a provider without it. */
	analytics?: AnalyticsSupport;
	/** What the "platform" knows, by external id; ids missing here were deleted on the platform. */
	platformMetrics = new Map<string, PostMetrics>();
	accountDays: AccountMetricsDay[] = [];
	/** Consumed one per analytics call: an error is thrown, null (or none left) answers normally. */
	analyticsErrors: (Error | null)[] = [];
	metricsCalls: { token: string; ids: string[] }[] = [];
	accountCalls: { token: string; since: string; until: string }[] = [];

	withAnalytics(opts: { maxPostsPerCall?: number; account?: boolean } = {}) {
		const fail = () => {
			const error = this.analyticsErrors.shift();
			if (error) throw error;
		};
		this.analytics = {
			maxPostsPerCall: opts.maxPostsPerCall ?? 2,
			getPostMetrics: async (channel, ids) => {
				this.metricsCalls.push({ token: channel.accessToken, ids });
				fail();
				const out: Record<string, PostMetrics> = {};
				for (const id of ids) {
					const m = this.platformMetrics.get(id);
					if (m) out[id] = m;
				}
				return out;
			},
			...(opts.account === false
				? {}
				: {
						getAccountMetrics: async (
							channel: ChannelContext,
							range: { since: string; until: string },
						) => {
							this.accountCalls.push({ token: channel.accessToken, ...range });
							fail();
							return this.accountDays;
						},
					}),
		};
		return this;
	}

	/** Absent until a test calls `withEngagement`. */
	engagement?: EngagementSupport;
	/** Comments/replies the "platform" holds; listComments filters them by post and since. */
	platformComments: EngagementItem[] = [];
	platformMentions: EngagementItem[] = [];
	platformDiscussions: DiscussionItem[] = [];
	/** Consumed one per inbox READ call (comments, mentions, search). */
	engagementErrors: (Error | null)[] = [];
	/** Consumed one per reply call: a result to return or an error to throw. */
	replySteps: ({ externalId: string; url: string | null } | Error)[] = [];
	commentCalls: { token: string; ids: string[]; since: string | null }[] = [];
	mentionCalls: { since: string | null }[] = [];
	searchCalls: { token: string; query: string; since: string | null; limit: number }[] = [];
	replyCalls: { token: string; toExternalId: string; kind: string; text: string }[] = [];

	withEngagement(
		opts: {
			maxPostsPerCall?: number;
			mentions?: boolean;
			search?: boolean;
			maxReplyLength?: number;
		} = {},
	) {
		const fail = () => {
			const error = this.engagementErrors.shift();
			if (error) throw error;
		};
		const since = (items: EngagementItem[], at: string | null) =>
			at ? items.filter((i) => i.createdAt >= at) : items;
		this.engagement = {
			requiredScopes: { read: ["r_comments"], reply: ["w_comments"] },
			maxPostsPerCall: opts.maxPostsPerCall ?? 2,
			maxReplyLength: opts.maxReplyLength ?? 100,
			listComments: async (channel, input) => {
				this.commentCalls.push({
					token: channel.accessToken,
					ids: input.postExternalIds,
					since: input.since,
				});
				fail();
				return since(
					this.platformComments.filter(
						(c) => c.postExternalId && input.postExternalIds.includes(c.postExternalId),
					),
					input.since,
				);
			},
			...(opts.mentions === false
				? {}
				: {
						listMentions: async (_channel: ChannelContext, input: { since: string | null }) => {
							this.mentionCalls.push(input);
							fail();
							return since(this.platformMentions, input.since);
						},
					}),
			...(opts.search === false
				? {}
				: {
						searchDiscussions: async (
							channel: ChannelContext,
							input: { query: string; since: string | null; limit: number },
						) => {
							this.searchCalls.push({ token: channel.accessToken, ...input });
							fail();
							return this.platformDiscussions.slice(0, input.limit);
						},
					}),
			reply: async (channel, input) => {
				this.replyCalls.push({
					token: channel.accessToken,
					toExternalId: input.toExternalId,
					kind: input.kind,
					text: input.text,
				});
				const step = this.replySteps.shift();
				if (!step) throw new Error("FakeProvider: no scripted reply step left");
				if (step instanceof Error) throw step;
				return step;
			},
		};
		return this;
	}

	isConfigured() {
		return true;
	}
	async getAuthorizationUrl() {
		return { url: "https://fake.example/oauth" };
	}
	async exchangeCode() {
		return { tokens: { accessToken: "a", scopes: [] }, accounts: [] };
	}
	async refreshTokens(): Promise<TokenSet> {
		this.refreshCalls++;
		return {
			accessToken: `refreshed-${this.refreshCalls}`,
			refreshToken: `rotated-${this.refreshCalls}`,
			expiresAt: new Date(Date.now() + 3600_000),
			scopes: [],
		};
	}
	async publish(channel: ChannelContext, input: { text: string }): Promise<PublishOutcome> {
		this.publishCalls.push({ token: channel.accessToken, text: input.text });
		return this.next(this.publishSteps);
	}
	async checkStatus(): Promise<PublishOutcome> {
		this.statusCalls++;
		return this.next(this.statusSteps);
	}
	private next(steps: Step[]): PublishOutcome {
		const step = steps.shift();
		if (!step) throw new Error("FakeProvider: no scripted step left");
		if (step instanceof Error) throw step;
		return step;
	}
}
