import { apiEnv as env } from "@socialfly/config";
import { TokenCipher } from "@socialfly/core/crypto";
import { createLogger } from "@socialfly/core/logger";
import { createMailer } from "@socialfly/core/mail";
import { createRedis } from "@socialfly/core/redis";
import { createDb } from "@socialfly/db";
import { createProviderRegistry } from "@socialfly/integrations";
import { createQueueConnection, JobProducer } from "@socialfly/queue";
import { S3Client } from "bun";

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

export const jobs = new JobProducer(createQueueConnection(env.REDIS_URL));

export const tokenCipher = new TokenCipher(
	env.TOKEN_ENCRYPTION_KEY,
	env.TOKEN_ENCRYPTION_KEY_PREVIOUS ? [env.TOKEN_ENCRYPTION_KEY_PREVIOUS] : [],
);

export const providers = createProviderRegistry(env);

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
