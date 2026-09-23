import { Scalar } from "@scalar/hono-api-reference";
import { authEnv as env } from "@socialfly/config";
import {
	createErrorHandler,
	healthRoutes,
	notFoundHandler,
	requestTelemetry,
} from "@socialfly/core/http";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { openAPIRouteHandler } from "hono-openapi";
import { database, logger } from "#src/infrastructure/index.ts";
import { authRoutes } from "#src/routes/auth.routes.ts";

export const app = new Hono()
	.use(
		cors({
			origin: env.CORS_ORIGINS,
			credentials: true,
			allowHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "traceparent", "tracestate"],
			exposeHeaders: ["X-Trace-Id"],
			allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
			maxAge: 3600,
		}),
	)
	.use(secureHeaders())
	.use(requestTelemetry(logger))
	.route(
		"/",
		healthRoutes({
			service: "auth",
			version: env.APP_VERSION,
			checks: { postgres: database.ping },
		}),
	)
	.route("/auth", authRoutes);

app.get(
	"/openapi.json",
	openAPIRouteHandler(app, {
		documentation: {
			info: { title: "SocialFly Auth API", version: env.APP_VERSION },
			servers: [{ url: env.AUTH_ISSUER }],
		},
	}),
);
if (env.NODE_ENV !== "production")
	app.get("/docs", Scalar({ url: "/openapi.json", pageTitle: "SocialFly Auth API" }));

app.onError(createErrorHandler(logger));
app.notFound(notFoundHandler);
