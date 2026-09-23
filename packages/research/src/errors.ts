import { AiError, type AiErrorKind } from "@socialfly/ai";

/**
 * HTTP status → AiError kind, the same mapping packages/ai uses for its providers
 * (that helper is internal to the package, so it is mirrored here rather than
 * widening @socialfly/ai's public surface).
 */
export function kindFromStatus(status: number | undefined): AiErrorKind {
	if (status === 429) return "rate_limited";
	if (status === 400 || status === 404 || status === 413 || status === 422)
		return "invalid_request";
	// 401/403 mean OUR key is wrong — the operator must fix config; retrying will not help.
	if (status === 401 || status === 403) return "not_configured";
	return "transient";
}

/** Wraps anything thrown by a provider SDK (or fetch) into an AiError. */
export function providerError(provider: string, error: unknown): AiError {
	if (error instanceof AiError) return error;
	const status = (error as { status?: unknown } | null)?.status;
	const code = typeof status === "number" ? status : undefined;
	if (code === undefined) {
		return new AiError("transient", `Could not reach ${provider}`, { provider }, { cause: error });
	}
	const headers = (error as { headers?: { get?: (name: string) => string | null } }).headers;
	const retryAfter = Number(headers?.get?.("retry-after"));
	return new AiError(
		kindFromStatus(code),
		code === 429 ? `${provider} is busy — try again shortly` : `${provider} rejected the request`,
		{
			provider,
			status: code,
			retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
		},
		{ cause: error },
	);
}
