import { createAi } from "@socialfly/ai";
import { workerEnv as env } from "@socialfly/config";
import { TokenCipher } from "@socialfly/core/crypto";
import { createLogger } from "@socialfly/core/logger";
import { createDb } from "@socialfly/db";
import { createProviderRegistry } from "@socialfly/integrations";
import { createQueueConnection, JobProducer } from "@socialfly/queue";
import { S3Client } from "bun";
import { AiMediaProcessor } from "#src/ai/ai-media.ts";
import { ChannelTokens } from "#src/channels/channel-tokens.ts";
import { Maintenance } from "#src/maintenance/maintenance.ts";
import { PublishingEngine } from "#src/publishing/publishing-engine.ts";
import { TargetState } from "#src/publishing/target-state.ts";

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
export const maintenance = new Maintenance(db, jobs, targetState, logger);

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
