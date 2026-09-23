import { isSpanContextValid, trace } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import pino, { type Logger, type LoggerOptions } from "pino";
import pinoPretty from "pino-pretty";

export type { Logger };

/**
 * Structured logging for every backend service.
 *
 *  - JSON to stdout only. Containers ship stdout; the OTel collector (or Azure's
 *    log agent) does the rest. No log files inside containers.
 *  - Every line inside a traced request carries trace_id/span_id, so a log in
 *    SigNoz links straight to its trace.
 *  - Each record is also emitted through the OpenTelemetry logs API, so logs,
 *    traces and metrics land in the same backend with the same resource attributes.
 *  - Secrets and PII are redacted by path before anything is written.
 */

const REDACT_PATHS = [
	"password",
	"*.password",
	"token",
	"*.token",
	"accessToken",
	"*.accessToken",
	"refreshToken",
	"*.refreshToken",
	"access_token",
	"*.access_token",
	"refresh_token",
	"*.refresh_token",
	"client_secret",
	"*.client_secret",
	"authorization",
	"*.authorization",
	"headers.authorization",
	"headers.cookie",
	"cookie",
	"email",
	"*.email",
	"phone",
	"*.phone",
];

const SEVERITY: Record<string, SeverityNumber> = {
	trace: SeverityNumber.TRACE,
	debug: SeverityNumber.DEBUG,
	info: SeverityNumber.INFO,
	warn: SeverityNumber.WARN,
	error: SeverityNumber.ERROR,
	fatal: SeverityNumber.FATAL,
};

export type CreateLoggerOptions = {
	service: string;
	level?: LoggerOptions["level"];
	/** Human-readable output for local dev. Never enable in production (it is slow). */
	pretty?: boolean;
};

export function createLogger({ service, level = "info", pretty = false }: CreateLoggerOptions) {
	const otel = logs.getLogger(service);

	return pino(
		{
			level,
			base: { service },
			timestamp: pino.stdTimeFunctions.isoTime,
			redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
			formatters: { level: (label) => ({ level: label }) },
			mixin() {
				const span = trace.getActiveSpan();
				const ctx = span?.spanContext();
				return ctx && isSpanContextValid(ctx) ? { trace_id: ctx.traceId, span_id: ctx.spanId } : {};
			},
			hooks: {
				// Mirror each record into OTel logs. Hooks see the raw, UNREDACTED arguments,
				// so only the message string and the error type are forwarded; structured
				// fields stay in the redacted stdout record.
				logMethod(args, method, levelNumber) {
					const label = this.levels.labels[levelNumber] ?? "info";
					const [first, second] = args as unknown[];
					const message =
						typeof first === "string" ? first : typeof second === "string" ? second : "";
					const err = first instanceof Error ? first : (first as { err?: unknown })?.err;
					otel.emit({
						severityNumber: SEVERITY[label] ?? SeverityNumber.INFO,
						severityText: label.toUpperCase(),
						body: message || (err instanceof Error ? err.message : ""),
						attributes: {
							"log.source": "pino",
							...(err instanceof Error ? { "exception.type": err.name } : {}),
						},
					});
					method.apply(this, args as Parameters<typeof method>);
				},
			},
		},
		// Dev only: pretty-print in-process. A pino "transport" would resolve pino-pretty
		// from a worker thread relative to the CALLING app, which fails in a workspace.
		pretty ? pinoPretty({ colorize: true, singleLine: true, sync: true }) : undefined,
	);
}
