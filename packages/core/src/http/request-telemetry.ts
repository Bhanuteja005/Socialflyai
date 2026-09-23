import { context, propagation, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { MiddlewareHandler } from "hono";
import type { Logger } from "../logger";
import { getMeter, getTracer } from "../telemetry";

const QUIET_PATHS = new Set(["/health", "/ready", "/version"]);

/**
 * One server span, one duration metric and one access-log line per request.
 *
 *  - Continues an incoming W3C `traceparent`, so web → api → worker is one trace.
 *  - Names the span by ROUTE (`GET /posts/:id`), not raw path, to keep span and
 *    metric cardinality bounded.
 *  - Returns `X-Trace-Id` so a user-reported error can be found in SigNoz directly.
 *  - Probe endpoints are not traced: they would drown real traffic.
 */
export const requestTelemetry = (logger: Logger): MiddlewareHandler => {
	const tracer = getTracer("http");
	const duration = getMeter("http").createHistogram("http.server.request.duration", {
		unit: "ms",
		description: "Duration of inbound HTTP requests",
	});

	return async (ctx, next) => {
		if (ctx.req.method === "OPTIONS" || QUIET_PATHS.has(ctx.req.path)) return next();

		const parent = propagation.extract(context.active(), ctx.req.raw.headers, {
			get: (carrier, key) => (carrier as Headers).get(key) ?? undefined,
			keys: (carrier) => [...(carrier as Headers).keys()],
		});

		await context.with(parent, () =>
			tracer.startActiveSpan(
				`${ctx.req.method} ${ctx.req.path}`,
				{
					kind: SpanKind.SERVER,
					attributes: { "http.request.method": ctx.req.method, "url.path": ctx.req.path },
				},
				async (span) => {
					const started = performance.now();
					let failed = false;
					try {
						await next();
					} catch (error) {
						failed = true;
						span.recordException(error as Error);
						throw error;
					} finally {
						const route = ctx.req.routePath || ctx.req.path;
						const status = failed ? 500 : ctx.res.status;
						const ms = performance.now() - started;

						span.updateName(`${ctx.req.method} ${route}`);
						span.setAttributes({ "http.route": route, "http.response.status_code": status });
						span.setStatus({ code: status >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK });
						ctx.header("X-Trace-Id", span.spanContext().traceId);

						const attrs = {
							"http.request.method": ctx.req.method,
							"http.route": route,
							"http.response.status_code": status,
						};
						duration.record(ms, attrs);
						const line = { method: ctx.req.method, route, status, durationMs: Math.round(ms) };
						if (status >= 500) logger.error(line, "request failed");
						else if (status >= 400) logger.warn(line, "request rejected");
						else logger.info(line, "request");
						span.end();
					}
				},
			),
		);
	};
};
