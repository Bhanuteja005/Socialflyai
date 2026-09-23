import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "../errors";
import type { Logger } from "../logger";
import { captureException } from "../telemetry";

/**
 * The single place an exception becomes an HTTP response.
 *
 *   AppError       → its own status + code (expected failure, logged at info/warn)
 *   HTTPException  → Hono's own (e.g. body too large), passed through
 *   anything else  → 500, logged at error, sent to Sentry, internals never leaked
 *
 * Response shape is always `{ error: { code, message, details? } }`, so the web
 * client needs exactly one error parser.
 */
export const createErrorHandler =
	(logger: Logger): ErrorHandler =>
	(error, ctx) => {
		if (error instanceof AppError) {
			if (error.status >= 500) logger.error({ err: error, code: error.code }, error.message);
			else logger.debug({ code: error.code, status: error.status }, error.message);
			if (error.status === 429 && typeof error.details?.retryAfterSeconds === "number") {
				ctx.header("Retry-After", String(error.details.retryAfterSeconds));
			}
			return ctx.json(error.toJSON(), error.status as ContentfulStatusCode);
		}

		if (error instanceof HTTPException) {
			return ctx.json(
				{ error: { code: "http_error", message: error.message } },
				error.status as ContentfulStatusCode,
			);
		}

		logger.error({ err: error, method: ctx.req.method, path: ctx.req.path }, "Unhandled error");
		captureException(error, { method: ctx.req.method, path: ctx.req.path });
		return ctx.json(
			{ error: { code: "internal_error", message: "Something went wrong on our side" } },
			500,
		);
	};

export const notFoundHandler: NotFoundHandler = (ctx: Context) =>
	ctx.json(
		{
			error: { code: "route_not_found", message: `No route for ${ctx.req.method} ${ctx.req.path}` },
		},
		404,
	);
