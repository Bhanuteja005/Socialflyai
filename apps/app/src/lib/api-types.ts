import type { InferRequestType, InferResponseType } from "hono/client";
import type { api } from "./api-client";

// Response shapes, inferred from the API's route types — never hand-written.

export type Organization = InferResponseType<
	typeof api.organizations.$get,
	200
>["organizations"][number];
export type Role = Organization["role"];
export type Member = InferResponseType<
	typeof api.organization.members.$get,
	200
>["members"][number];
export type Invitation = InferResponseType<
	typeof api.organization.invitations.$get,
	200
>["invitations"][number];

export type ProviderInfo = InferResponseType<
	typeof api.channels.providers.$get,
	200
>["providers"][number];
export type Capabilities = ProviderInfo["capabilities"];
export type Channel = InferResponseType<typeof api.channels.$get, 200>["channels"][number];
export type ChannelStatus = Channel["status"];
export type Selection = InferResponseType<
	(typeof api.channels.selections)[":selectionId"]["$get"],
	200
>;

export type MediaPage = InferResponseType<typeof api.media.$get, 200>;
export type MediaAsset = MediaPage["items"][number];

export type Post = InferResponseType<typeof api.posts.$get, 200>["posts"][number];
export type PostDetail = InferResponseType<(typeof api.posts)[":id"]["$get"], 200>;
export type PostTarget = Post["targets"][number];
export type PostEvent = PostDetail["events"][number];
export type PostStatus = Post["status"];
export type TargetStatus = PostTarget["status"];
export type ValidationResult = InferResponseType<typeof api.posts.validate.$post, 200>;

export type CreatePostInput = InferRequestType<typeof api.posts.$post>["json"];
export type PostsQuery = InferRequestType<typeof api.posts.$get>["query"];

// ── AI (Phase 3) ────────────────────────────────────────────────────────────
export type AiCapabilities = InferResponseType<typeof api.ai.capabilities.$get, 200>;
export type AiBudget = AiCapabilities["budget"];
export type BrandProfile = InferResponseType<typeof api.ai.brand.$get, 200>;
export type BrandProfileInput = InferRequestType<typeof api.ai.brand.$put>["json"];
export type GeneratePostsInput = InferRequestType<typeof api.ai.posts.$post>["json"];
export type GeneratedPosts = InferResponseType<typeof api.ai.posts.$post, 200>;
export type PostVariant = GeneratedPosts["variants"][number];
export type PostDraft = PostVariant["drafts"][number];
export type RewriteInput = InferRequestType<typeof api.ai.rewrite.$post>["json"];
export type RewriteAction = RewriteInput["action"];
export type CarouselOutline = InferResponseType<typeof api.ai.carousels.outline.$post, 200>;
export type Generation = InferResponseType<(typeof api.ai.generations)[":id"]["$get"], 200>;
export type GenerationKind = Generation["kind"];
export type GenerationStatus = Generation["status"];
export type GenerationsQuery = InferRequestType<typeof api.ai.generations.$get>["query"];
export type ImageInput = InferRequestType<typeof api.ai.images.$post>["json"];
export type AspectRatio = NonNullable<ImageInput["aspectRatio"]>;
export type CarouselInput = InferRequestType<typeof api.ai.carousels.$post>["json"];
export type VideoScriptInput = InferRequestType<typeof api.ai.videos.script.$post>["json"];
export type VideoScript = InferResponseType<typeof api.ai.videos.script.$post, 200>;
export type VideoScene = VideoScript["scenes"][number];
export type VideoInput = InferRequestType<typeof api.ai.videos.$post>["json"];
export type VideoVoice = NonNullable<NonNullable<VideoInput["voiceover"]>["voice"]>;

// ── Analytics (Phase 4) ─────────────────────────────────────────────────────
export type AnalyticsOverviewQuery = InferRequestType<typeof api.analytics.overview.$get>["query"];
export type AnalyticsOverview = InferResponseType<typeof api.analytics.overview.$get, 200>;
export type AnalyticsTotals = AnalyticsOverview["totals"];
export type AnalyticsDay = AnalyticsOverview["daily"][number];
export type AnalyticsChannelRow = AnalyticsOverview["byChannel"][number];
export type AnalyticsTopPost = AnalyticsOverview["topPosts"][number];
export type AnalyticsPostsQuery = InferRequestType<typeof api.analytics.posts.$get>["query"];
export type AnalyticsPostsPage = InferResponseType<typeof api.analytics.posts.$get, 200>;
export type AnalyticsPostItem = AnalyticsPostsPage["items"][number];
export type AnalyticsMetrics = AnalyticsPostItem["metrics"];
export type AnalyticsSort = NonNullable<AnalyticsPostsQuery["sort"]>;
export type PostAnalytics = InferResponseType<(typeof api.analytics.posts)[":postId"]["$get"], 200>;
export type PostAnalyticsTarget = PostAnalytics["targets"][number];
export type BestTimes = InferResponseType<(typeof api.analytics)["best-times"]["$get"], 200>;
export type BestTimeCell = BestTimes["cells"][number];
