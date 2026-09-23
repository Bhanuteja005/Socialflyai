// Imported on line 1 of index.ts: telemetry providers must exist before any other
// module creates a tracer or meter.
import { workerEnv as env } from "@socialfly/config";
import { initTelemetry } from "@socialfly/core/telemetry";

initTelemetry({
	serviceName: env.OTEL_SERVICE_NAME,
	serviceVersion: env.APP_VERSION,
	environment: env.NODE_ENV,
	disabled: env.OTEL_SDK_DISABLED || env.NODE_ENV === "test",
	otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
	otlpHeaders: env.OTEL_EXPORTER_OTLP_HEADERS,
	sentryDsn: env.SENTRY_DSN,
	sentryTracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
});
