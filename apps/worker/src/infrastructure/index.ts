import { createAi } from "@socialfly/ai";
import { workerEnv as env } from "@socialfly/config";
import { TokenCipher } from "@socialfly/core/crypto";
import { createLogger } from "@socialfly/core/logger";
import { createDb } from "@socialfly/db";
import { createAdsRegistry, createProviderRegistry } from "@socialfly/integrations";
import { createQueueConnection, JobProducer } from "@socialfly/queue";
import {
	analyzeBrand,
	analyzeMention,
	classifySentiment,
	crawlSite,
	createDataForSeo,
	createVisibilityEngines,
} from "@socialfly/research";
import { S3Client } from "bun";
import { AdTokens } from "#src/ads/ad-tokens.ts";
import { AdsSync } from "#src/ads/ads-sync.ts";
import { AdsWriter } from "#src/ads/ads-writer.ts";
import { AdCampaignState } from "#src/ads/campaign-state.ts";
import { AiMediaProcessor } from "#src/ai/ai-media.ts";
import { AnalyticsCollector } from "#src/analytics/analytics-collector.ts";
import { RedisCallBudget } from "#src/analytics/call-budget.ts";
import { ChannelTokens } from "#src/channels/channel-tokens.ts";
import { EngagementProcessor } from "#src/engagement/engagement-processor.ts";
import { ReplySender } from "#src/engagement/reply-sender.ts";
import { ReplyState } from "#src/engagement/reply-state.ts";
import { Maintenance } from "#src/maintenance/maintenance.ts";
import { PublishingEngine } from "#src/publishing/publishing-engine.ts";
import { TargetState } from "#src/publishing/target-state.ts";
import { ResearchProcessor } from "#src/research/research-processor.ts";

/** Process-wide singletons, created once here and closed once in index.ts. */
export const logger = createLogger({
	service: env.OTEL_SERVICE_NAME,
	level: env.LOG_LEVEL,
	pretty: env.NODE_ENV === "development",
});

export const database = createDb(env.DATABASE_URL, {
	// Workers hold a connection per concurrent job plus row locks during refresh.
	max: Math.max(env.DATABASE_POOL_MAX, env.PUBLISH_CONCURRENCY * 2),
	applicationName: env.OTEL_SERVICE_NAME,
});
export const db = database.db;

/** One connection for producing, separate from the blocking connections workers open. */
export const queueConnection = createQueueConnection(env.REDIS_URL);
export const jobs = new JobProducer(queueConnection);

export const providers = createProviderRegistry(env);
export const tokenCipher = new TokenCipher(
	env.TOKEN_ENCRYPTION_KEY,
	env.TOKEN_ENCRYPTION_KEY_PREVIOUS ? [env.TOKEN_ENCRYPTION_KEY_PREVIOUS] : [],
);

export const channelTokens = new ChannelTokens(db, providers, tokenCipher, logger);
export const targetState = new TargetState(db);
export const engine = new PublishingEngine({
	db,
	providers,
	tokens: channelTokens,
	state: targetState,
	jobs,
	logger,
	publicMediaUrl: env.S3_PUBLIC_URL,
});
export const replyState = new ReplyState(db);
/** Ad platforms (Phase 7). A platform without credentials is skipped, like publishing. */
export const adsProviders = createAdsRegistry(env);
export const adCampaignState = new AdCampaignState(db);
export const adTokens = new AdTokens(db, adsProviders, tokenCipher, logger);

export const maintenance = new Maintenance(
	db,
	jobs,
	targetState,
	logger,
	replyState,
	adCampaignState,
);

export const analytics = new AnalyticsCollector({
	db,
	providers,
	tokens: channelTokens,
	budget: new RedisCallBudget(queueConnection),
	jobs,
	logger,
});

/** Same bucket as the API: it presigns user uploads there, the worker writes AI output there. */
export const storage = new S3Client({
	endpoint: env.S3_ENDPOINT,
	region: env.S3_REGION,
	bucket: env.S3_BUCKET,
	accessKeyId: env.S3_ACCESS_KEY_ID,
	secretAccessKey: env.S3_SECRET_ACCESS_KEY,
});

/** Missing keys disable a capability (images) instead of failing the boot. */
export const ai = createAi(env);
export const aiMedia = new AiMediaProcessor({
	db,
	ai,
	storage,
	logger,
	publicMediaUrl: env.S3_PUBLIC_URL,
});

/**
 * Website research, AI visibility and SEO. Engines and DataForSEO follow the same rule
 * as every other provider: a missing key turns the feature off instead of failing boot.
 */
export const research = new ResearchProcessor({
	db,
	ai,
	fns: { crawlSite, analyzeBrand, analyzeMention, classifySentiment },
	engines: createVisibilityEngines(env),
	seo: createDataForSeo(env),
	jobs,
	logger,
	config: {
		maxPages: env.RESEARCH_MAX_PAGES,
		userAgent: env.RESEARCH_USER_AGENT,
		monthlyBudgetUsd: env.AI_ORG_MONTHLY_BUDGET_USD,
	},
});

/**
 * Engagement inbox. Its platform reads get their own per-provider budget (20 calls a
 * minute), separate from analytics, so neither can starve the other and together they
 * stay well inside what publishing needs.
 */
export const engagement = new EngagementProcessor({
	db,
	ai,
	providers,
	tokens: channelTokens,
	budget: new RedisCallBudget(queueConnection, { max: 20, windowMs: 60_000 }, "engagement"),
	jobs,
	logger,
	config: { monthlyBudgetUsd: env.AI_ORG_MONTHLY_BUDGET_USD },
});
export const replySender = new ReplySender({
	db,
	providers,
	tokens: channelTokens,
	state: replyState,
	jobs,
	logger,
});

/**
 * Ads: the writer creates campaigns (always paused) and starts/stops spend; the sync
 * reads statuses and spend with its own per-provider read budget (20 calls a minute),
 * separate from analytics and the inbox.
 */
export const adsWriter = new AdsWriter({
	db,
	providers: adsProviders,
	tokens: adTokens,
	state: adCampaignState,
	jobs,
	logger,
	publicMediaUrl: env.S3_PUBLIC_URL,
	serverDailyCeiling: env.ADS_MAX_DAILY_BUDGET,
});
export const adsSync = new AdsSync({
	db,
	providers: adsProviders,
	tokens: adTokens,
	state: adCampaignState,
	budget: new RedisCallBudget(queueConnection, { max: 20, windowMs: 60_000 }, "ads"),
	jobs,
	logger,
});
