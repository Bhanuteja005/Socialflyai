import { Scalar } from "@scalar/hono-api-reference";
import { apiEnv as env } from "@socialfly/config";
import { requireCsrf } from "@socialfly/core/auth";
import {
	createErrorHandler,
	healthRoutes,
	notFoundHandler,
	requestTelemetry,
} from "@socialfly/core/http";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { openAPIRouteHandler } from "hono-openapi";
import { database, jobs, logger, redis } from "#src/infrastructure/index.ts";
import { aiRoutes } from "#src/modules/ai/ai.routes.ts";
import { channelCallbackRoutes, channelsRoutes } from "#src/modules/channels/channels.routes.ts";
import { mediaRoutes } from "#src/modules/media/media.routes.ts";
import {
	currentOrganizationRoutes,
	organizationsRoutes,
} from "#src/modules/organizations/organizations.routes.ts";
import { postsRoutes } from "#src/modules/posts/posts.routes.ts";

const base = new Hono()
	.use(
		cors({
			origin: env.CORS_ORIGINS,
			credentials: true,
			allowHeaders: [
				"Content-Type",
				"Authorization",
				"X-CSRF-Token",
				"X-Organization-Id",
				"traceparent",
				"tracestate",
			],
			exposeHeaders: ["X-Trace-Id"],
			allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
			maxAge: 3600,
		}),
	)
	.use(secureHeaders())
	.use(requestTelemetry(logger))
	// JSON bodies only — media bytes never pass through the API (presigned uploads).
	.use(bodyLimit({ maxSize: 1024 * 1024 }))
	.route(
		"/",
		healthRoutes({
			service: "api",
			version: env.APP_VERSION,
			checks: { postgres: database.ping, redis: () => redis.ping(), queue: () => jobs.ping() },
		}),
	)
	// The platform → browser OAuth redirect: a top-level GET, outside CSRF.
	.route("/channels", channelCallbackRoutes);

/**
 * The typed API surface. Chained so `AppType` carries every route's input and
 * output types to the web app's `hc` client (see ./app-type.ts).
 */
const api = new Hono()
	.use(requireCsrf())
	.route("/organizations", organizationsRoutes)
	.route("/organization", currentOrganizationRoutes)
	.route("/channels", channelsRoutes)
	.route("/media", mediaRoutes)
	.route("/posts", postsRoutes)
	.route("/ai", aiRoutes);

export const app = base.route("/", api);
export type AppType = typeof api;

app.get(
	"/openapi.json",
	openAPIRouteHandler(app, {
		documentation: {
			info: { title: "SocialFly API", version: env.APP_VERSION },
			servers: [{ url: env.API_URL }],
			components: {
				securitySchemes: {
					cookie: { type: "apiKey", in: "cookie", name: "sf_access" },
					bearer: { type: "http", scheme: "bearer" },
				},
			},
			security: [{ cookie: [] }, { bearer: [] }],
		},
	}),
);
if (env.NODE_ENV !== "production")
	app.get("/docs", Scalar({ url: "/openapi.json", pageTitle: "SocialFly API" }));

app.onError(createErrorHandler(logger));
app.notFound(notFoundHandler);
