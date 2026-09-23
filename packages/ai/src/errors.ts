/**
 * Why an AI call failed, phrased as what the CALLER should do — the same idea as
 * ProviderError.kind for social platforms.
 *
 *  - not_configured:  no key for this capability; hide the feature.
 *  - refused:         the model declined the request (safety). Show the user; do not retry.
 *  - invalid_request: our input was rejected (too long, bad parameter). Do not retry.
 *  - invalid_output:  the model answered but not in the required shape. One retry is reasonable.
 *  - rate_limited:    provider throttled us. Retry later.
 *  - transient:       network / 5xx / timeout. Retry with backoff.
 */
export type AiErrorKind =
	| "not_configured"
	| "refused"
	| "invalid_request"
	| "invalid_output"
	| "rate_limited"
	| "transient";

export class AiError extends Error {
	override readonly name = "AiError";

	constructor(
		readonly kind: AiErrorKind,
		message: string,
		readonly details: { provider?: string; status?: number; retryAfterSeconds?: number } = {},
		options?: { cause?: unknown },
	) {
		super(message, options);
	}

	get retryable() {
		return (
			this.kind === "rate_limited" || this.kind === "transient" || this.kind === "invalid_output"
		);
	}
}

export const isAiError = (e: unknown): e is AiError => e instanceof AiError;

/** Maps an HTTP status from any provider SDK to a kind. Used by every adapter. */
export function kindFromStatus(status: number | undefined): AiErrorKind {
	if (status === 429) return "rate_limited";
	if (status === 400 || status === 404 || status === 413 || status === 422)
		return "invalid_request";
	// 401/403 mean OUR key is wrong — the operator must fix config; retrying will not help.
	if (status === 401 || status === 403) return "not_configured";
	return "transient";
}
