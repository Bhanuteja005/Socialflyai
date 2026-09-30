import type {
	AdCampaignsQuery,
	AnalyticsOverviewQuery,
	AnalyticsPostsQuery,
	GenerationsQuery,
	InboxItemsQuery,
	PostsQuery,
} from "./api-types";

/** Every org-scoped key starts with ["org", orgId] so switching orgs never mixes caches. */
export const qk = {
	session: ["session"] as const,
	authSessions: ["auth-sessions"] as const,
	organizations: ["organizations"] as const,
	org: (orgId: string) => ["org", orgId] as const,
	organization: (orgId: string) => ["org", orgId, "organization"] as const,
	members: (orgId: string) => ["org", orgId, "members"] as const,
	invitations: (orgId: string) => ["org", orgId, "invitations"] as const,
	providers: (orgId: string) => ["org", orgId, "providers"] as const,
	channels: (orgId: string) => ["org", orgId, "channels"] as const,
	selection: (orgId: string, id: string) => ["org", orgId, "selection", id] as const,
	postsAll: (orgId: string) => ["org", orgId, "posts"] as const,
	posts: (orgId: string, query: PostsQuery = {}) => ["org", orgId, "posts", query] as const,
	post: (orgId: string, id: string) => ["org", orgId, "post", id] as const,
	media: (orgId: string, kind?: string) => ["org", orgId, "media", kind ?? "all"] as const,
	mediaAll: (orgId: string) => ["org", orgId, "media"] as const,
	aiCapabilities: (orgId: string) => ["org", orgId, "ai", "capabilities"] as const,
	brand: (orgId: string) => ["org", orgId, "ai", "brand"] as const,
	generation: (orgId: string, id: string) => ["org", orgId, "ai", "generation", id] as const,
	generationsAll: (orgId: string) => ["org", orgId, "ai", "generations"] as const,
	generations: (orgId: string, query: GenerationsQuery = {}) =>
		["org", orgId, "ai", "generations", query] as const,
	analyticsAll: (orgId: string) => ["org", orgId, "analytics"] as const,
	analyticsOverview: (orgId: string, query: AnalyticsOverviewQuery) =>
		["org", orgId, "analytics", "overview", query] as const,
	analyticsPosts: (orgId: string, query: AnalyticsPostsQuery) =>
		["org", orgId, "analytics", "posts", query] as const,
	analyticsPost: (orgId: string, postId: string) =>
		["org", orgId, "analytics", "post", postId] as const,
	analyticsChannel: (orgId: string, channelId: string, from: string, to: string) =>
		["org", orgId, "analytics", "channel", channelId, from, to] as const,
	bestTimes: (orgId: string, channelIds: string) =>
		["org", orgId, "analytics", "best-times", channelIds] as const,
	researchAll: (orgId: string) => ["org", orgId, "research"] as const,
	researchCapabilities: (orgId: string) => ["org", orgId, "research", "capabilities"] as const,
	researchRuns: (orgId: string) => ["org", orgId, "research", "runs"] as const,
	researchRunsList: (orgId: string, limit: number) =>
		["org", orgId, "research", "runs", "list", limit] as const,
	researchLatestRun: (orgId: string) => ["org", orgId, "research", "runs", "latest"] as const,
	researchRun: (orgId: string, id: string) => ["org", orgId, "research", "runs", id] as const,
	researchPages: (orgId: string, runId: string) =>
		["org", orgId, "research", "runs", runId, "pages"] as const,
	competitors: (orgId: string) => ["org", orgId, "research", "competitors"] as const,
	keywords: (orgId: string) => ["org", orgId, "research", "keywords"] as const,
	keywordRankings: (orgId: string, id: string, days: number) =>
		["org", orgId, "research", "keywords", id, "rankings", days] as const,
	visibilityAll: (orgId: string) => ["org", orgId, "research", "visibility"] as const,
	visibilityPrompts: (orgId: string) =>
		["org", orgId, "research", "visibility", "prompts"] as const,
	visibilitySummary: (orgId: string, days: number) =>
		["org", orgId, "research", "visibility", "summary", days] as const,
	promptChecks: (orgId: string, promptId: string) =>
		["org", orgId, "research", "visibility", "checks", "prompt", promptId] as const,
	visibilityCheck: (orgId: string, id: string) =>
		["org", orgId, "research", "visibility", "checks", id] as const,
	inboxAll: (orgId: string) => ["org", orgId, "inbox"] as const,
	inboxItemsAll: (orgId: string) => ["org", orgId, "inbox", "items"] as const,
	inboxItems: (orgId: string, query: InboxItemsQuery) =>
		["org", orgId, "inbox", "items", "list", query] as const,
	inboxItem: (orgId: string, id: string) => ["org", orgId, "inbox", "items", "detail", id] as const,
	inboxCounts: (orgId: string) => ["org", orgId, "inbox", "counts"] as const,
	inboxApprovals: (orgId: string) => ["org", orgId, "inbox", "approvals"] as const,
	inboxListening: (orgId: string) => ["org", orgId, "inbox", "listening"] as const,
	inboxSettings: (orgId: string) => ["org", orgId, "inbox", "settings"] as const,
	adsAll: (orgId: string) => ["org", orgId, "ads"] as const,
	adsProviders: (orgId: string) => ["org", orgId, "ads", "providers"] as const,
	adAccounts: (orgId: string) => ["org", orgId, "ads", "accounts"] as const,
	adPending: (orgId: string, key: string) => ["org", orgId, "ads", "pending", key] as const,
	adIdentities: (orgId: string, accountId: string) =>
		["org", orgId, "ads", "accounts", accountId, "identities"] as const,
	adTargeting: (orgId: string, accountId: string, type: string, q: string) =>
		["org", orgId, "ads", "targeting", accountId, type, q] as const,
	adCampaignsAll: (orgId: string) => ["org", orgId, "ads", "campaigns"] as const,
	adCampaigns: (orgId: string, query: Omit<AdCampaignsQuery, "before">) =>
		["org", orgId, "ads", "campaigns", "list", query] as const,
	adCampaign: (orgId: string, id: string) =>
		["org", orgId, "ads", "campaigns", "detail", id] as const,
	adsSettings: (orgId: string) => ["org", orgId, "ads", "settings"] as const,
	adsOverview: (orgId: string, from: string, to: string) =>
		["org", orgId, "ads", "overview", from, to] as const,
};
