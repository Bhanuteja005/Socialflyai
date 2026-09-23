import { authEnv as env } from "@socialfly/config";
import { createLogger } from "@socialfly/core/logger";
import { createMailer } from "@socialfly/core/mail";
import { createDb } from "@socialfly/db";

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

export const mailer = createMailer({ smtpUrl: env.SMTP_URL, from: env.MAIL_FROM, logger });
