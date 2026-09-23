import { DiagConsoleLogger, DiagLogLevel, diag, metrics, trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import {
	CompositePropagator,
	W3CBaggagePropagator,
	W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import * as Sentry from "@sentry/bun";

export type TelemetryOptions = {
	serviceName: string;
	serviceVersion: string;
	environment: string;
	disabled: boolean;
	otlpEndpoint: string;
	/** "k1=v1,k2=v2" — the OTEL_EXPORTER_OTLP_HEADERS format (e.g. an ingestion key). */
	otlpHeaders: string;
	sentryDsn?: string;
	sentryTracesSampleRate?: number;
};

let shutdownHook: (() => Promise<void>) | undefined;

/**
 * Boot OpenTelemetry (traces, metrics, logs over OTLP/HTTP) and Sentry.
 *
 * Must run before anything grabs a tracer or meter: each app has an
 * `instrumentation.ts` imported on line 1 of its entrypoint.
 *
 * Telemetry goes to the local OTel collector (infra/otel), which fans out to SigNoz.
 * Services never talk to the telemetry backend directly, so switching backends is
 * a collector config change, not a redeploy of every service.
 */
export function initTelemetry(options: TelemetryOptions) {
	if (options.sentryDsn) {
		Sentry.init({
			dsn: options.sentryDsn,
			environment: options.environment,
			release: options.serviceVersion,
			tracesSampleRate: options.sentryTracesSampleRate ?? 0,
			// OTel owns tracing; Sentry is for errors. Two competing tracers would double-wrap spans.
			skipOpenTelemetrySetup: true,
			initialScope: { tags: { service: options.serviceName } },
		});
	}

	if (options.disabled) return;

	diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

	const base = options.otlpEndpoint.replace(/\/$/, "");
	const headers = parseOtlpHeaders(options.otlpHeaders);
	const resource = resourceFromAttributes({
		[ATTR_SERVICE_NAME]: options.serviceName,
		[ATTR_SERVICE_VERSION]: options.serviceVersion,
		"deployment.environment.name": options.environment,
	});

	const tracerProvider = new NodeTracerProvider({
		resource,
		spanProcessors: [
			new BatchSpanProcessor(new OTLPTraceExporter({ url: `${base}/v1/traces`, headers }), {
				maxExportBatchSize: 512,
				scheduledDelayMillis: 2000,
				maxQueueSize: 4096,
			}),
		],
	});
	tracerProvider.register({
		propagator: new CompositePropagator({
			propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
		}),
	});

	const meterProvider = new MeterProvider({
		resource,
		readers: [
			new PeriodicExportingMetricReader({
				exporter: new OTLPMetricExporter({ url: `${base}/v1/metrics`, headers }),
				exportIntervalMillis: 15_000,
			}),
		],
	});
	metrics.setGlobalMeterProvider(meterProvider);

	const loggerProvider = new LoggerProvider({
		resource,
		processors: [
			new BatchLogRecordProcessor({
				exporter: new OTLPLogExporter({ url: `${base}/v1/logs`, headers }),
			}),
		],
	});
	logs.setGlobalLoggerProvider(loggerProvider);

	shutdownHook = async () => {
		await Promise.allSettled([
			tracerProvider.shutdown(),
			meterProvider.shutdown(),
			loggerProvider.shutdown(),
			Sentry.close(2000),
		]);
	};
}

/** Flush pending telemetry. Call last in each service's graceful shutdown. */
export const shutdownTelemetry = async () => {
	await shutdownHook?.();
};

export const getTracer = (name = "socialfly") => trace.getTracer(name);
export const getMeter = (name = "socialfly") => metrics.getMeter(name);

export const captureException = (error: unknown, context?: Record<string, unknown>) => {
	Sentry.captureException(error, context ? { extra: context } : undefined);
};

export const parseOtlpHeaders = (value: string): Record<string, string> =>
	Object.fromEntries(
		value
			.split(",")
			.map((entry) => {
				const i = entry.indexOf("=");
				return i === -1 ? null : ([entry.slice(0, i).trim(), entry.slice(i + 1).trim()] as const);
			})
			.filter((kv): kv is readonly [string, string] => Boolean(kv?.[0] && kv[1])),
	);
