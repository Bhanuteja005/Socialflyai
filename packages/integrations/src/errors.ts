/**
 * What went wrong, expressed as what the caller may SAFELY do next.
 *
 *   auth             token expired/revoked or scope missing. Refresh once; if that
 *                    fails, mark the channel `needs_reauth`. Nothing was published.
 *   rate_limited     platform throttled us BEFORE doing anything. Safe to retry
 *                    after `retryAfterMs`.
 *   invalid_request  the platform rejected the content (too long, bad media...).
 *                    Retrying the same payload will fail the same way — surface it.
 *   transient        failed before any side effect (DNS failure, 5xx on a READ,
 *                    media upload step before the post call). Safe to retry.
 *   unknown_outcome  a MUTATING request may have been accepted (timeout, connection
 *                    reset, 5xx on the create call). Never auto-retry: that is how
 *                    duplicate posts happen. The target becomes `unconfirmed`.
 */
export type ProviderErrorKind =
	| "auth"
	| "rate_limited"
	| "invalid_request"
	| "transient"
	| "unknown_outcome";

export class ProviderError extends Error {
	override readonly name = "ProviderError";

	constructor(
		readonly kind: ProviderErrorKind,
		readonly provider: string,
		message: string,
		readonly details: {
			status?: number;
			/** The platform's own error code, for support and the target timeline. */
			platformCode?: string;
			retryAfterMs?: number;
			/** Truncated response body; never contains our tokens. */
			body?: string;
		} = {},
		options?: { cause?: unknown },
	) {
		super(message, options);
	}

	get retryable(): boolean {
		return this.kind === "rate_limited" || this.kind === "transient";
	}
}

export const isProviderError = (e: unknown): e is ProviderError => e instanceof ProviderError;
