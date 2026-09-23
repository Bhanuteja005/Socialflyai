import { type AiModels, createAi } from "@socialfly/ai";
import { apiEnv as env } from "@socialfly/config";
import { TokenCipher } from "@socialfly/core/crypto";
import { createLogger } from "@socialfly/core/logger";
import { createMailer } from "@socialfly/core/mail";
import { createRedis } from "@socialfly/core/redis";
import { createDb } from "@socialfly/db";
import { createProviderRegistry, type ProviderRegistry } from "@socialfly/integrations";
import {
	createQueueConnection,
	engagementReplyQueueName,
	JobProducer,
	publishQueueName,
	QUEUES,
} from "@socialfly/queue";
import {
	createDataForSeo,
	createVisibilityEngines,
	type DataForSeo,
	type VisibilityEngine,
} from "@socialfly/research";
import { S3Client } from "bun";
import { QueueStats } from "./queue-stats.ts";

/** Process-wide singletons. Created once here, closed once in index.ts on shutdown. */
export const logger = createLogger({
	service: env.OTEL_SERVICE_NAME,
	level: env.LOG_LEVEL,
	pretty: env.NODE_ENV === "development",
});

export const database = createDb(env.DATABASE_URL, {
	max: env.DATABASE_POOL_MAX,
	applicationName: env.OTEL_SERVICE_NAME,
});
export const db = database.db;

/** Request-path Redis: OAuth state, rate limits. */
export const redis = createRedis(env.REDIS_URL, { keyPrefix: "sf:api:" });

/** One BullMQ connection for everything the API does with queues (enqueue + admin stats). */
export const queueConnection = createQueueConnection(env.REDIS_URL);

export const jobs = new JobProducer(queueConnection);

export const tokenCipher = new TokenCipher(
	env.TOKEN_ENCRYPTION_KEY,
	env.TOKEN_ENCRYPTION_KEY_PREVIOUS ? [env.TOKEN_ENCRYPTION_KEY_PREVIOUS] : [],
);

export const providers = createProviderRegistry(env);

/**
 * Every queue the worker consumes. Publish queues come from the registry (configured or
 * not), so a newly registered platform shows up in the admin console without an edit here.
 */
export const queueStats = new QueueStats(queueConnection, () => [
	...providers.all().map((p) => publishQueueName(p.id)),
	...providers
		.all()
		.filter((p) => p.engagement)
		.map((p) => engagementReplyQueueName(p.id)),
	...Object.values(QUEUES),
]);

/**
 * Platform adapters as the engagement inbox sees them. Mutable (like `ai`) so tests can
 * swap in a fake registry whose inbox support is scripted.
 */
export const inboxTools: { providers: ProviderRegistry } = { providers };

/**
 * Bun's native S3 client (no AWS SDK). Works against RustFS locally and R2/S3 in
 * production. The API only ever presigns and inspects objects — bytes go from
 * the browser straight to storage and from storage straight to the platforms.
 */
export const storage = new S3Client({
	endpoint: env.S3_ENDPOINT,
	region: env.S3_REGION,
	bucket: env.S3_BUCKET,
	accessKeyId: env.S3_ACCESS_KEY_ID,
	secretAccessKey: env.S3_SECRET_ACCESS_KEY,
});

export const mailer = createMailer({ smtpUrl: env.SMTP_URL, from: env.MAIL_FROM, logger });

/**
 * AI models; a capability without a key is null (hidden, not broken). Exported as a
 * mutable object whose fields are read at call time, so tests can swap in fakes.
 */
export const ai: AiModels = createAi(env);

/**
 * Research tools that the API calls or reports on. Visibility engines are only listed
 * here (ids and models for /research/capabilities); the worker is what asks them.
 * DataForSEO is called directly for keyword ideas, which the user waits for. Mutable,
 * like `ai`, so tests can swap in fakes.
 */
export const researchTools: {
	visibilityEngines: { id: VisibilityEngine["id"]; model: string }[];
	seo: Pick<DataForSeo, "keywordIdeas"> | null;
} = {
	visibilityEngines: createVisibilityEngines(env).map((e) => ({ id: e.id, model: e.model })),
	seo: createDataForSeo(env),
};
