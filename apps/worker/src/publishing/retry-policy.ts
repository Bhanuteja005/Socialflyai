import { isProviderError, type ProviderErrorKind } from "@socialfly/integrations";

/** How many times a target may be ATTEMPTED (not how many times a request is sent). */
export const MAX_ATTEMPTS = 5;

const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 30 * 60_000;

export type Decision =
	| { action: "retry"; delayMs: number; reason: string }
	| { action: "fail"; code: string; message: string }
	/** The platform may have accepted it. Never retried automatically. */
	| { action: "unconfirmed"; message: string }
	/** Token problem: refresh (once) and try again in-process. */
	| { action: "refresh_token" };

/** 30s, 60s, 120s ... capped at 30 min, with ±20% jitter so retries don't stampede. */
export const backoffMs = (attempt: number, jitter = Math.random()) => {
	const base = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1));
	return Math.round(base * (0.8 + jitter * 0.4));
};

/**
 * Maps a publish failure to what the engine does next. Pure — every branch is
 * unit tested, because getting this wrong either loses posts or duplicates them.
 *
 * @param sent whether the provider's publish() had been invoked. A non-provider
 *   error AFTER that point (a bug, a crash in our own result handling) cannot
 *   prove the platform did nothing, so it is treated like `unknown_outcome`.
 */
export function decide(
	error: unknown,
	ctx: { attempt: number; sent: boolean; alreadyRefreshed: boolean },
): Decision {
	if (!isProviderError(error)) {
		if (ctx.sent) {
			return {
				action: "unconfirmed",
				message: "Publishing was interrupted; the post may or may not be live",
			};
		}
		return retryOrFail(
			ctx.attempt,
			backoffMs(ctx.attempt),
			"internal_error",
			"Internal error before sending",
		);
	}

	const kind: ProviderErrorKind = error.kind;
	switch (kind) {
		case "auth":
			return ctx.alreadyRefreshed
				? {
						action: "fail",
						code: "channel_needs_reauth",
						message: "The channel's access was revoked or expired — reconnect it and retry",
					}
				: { action: "refresh_token" };
		case "rate_limited":
			return retryOrFail(
				ctx.attempt,
				Math.max(error.details.retryAfterMs ?? 0, backoffMs(ctx.attempt)),
				"rate_limited",
				"The platform is rate limiting us",
			);
		case "transient":
			return retryOrFail(
				ctx.attempt,
				backoffMs(ctx.attempt),
				"platform_unavailable",
				error.message,
			);
		case "invalid_request":
			return {
				action: "fail",
				code: error.details.platformCode ?? "rejected_by_platform",
				message: error.message,
			};
		case "unknown_outcome":
			return { action: "unconfirmed", message: error.message };
	}
}

function retryOrFail(attempt: number, delayMs: number, code: string, message: string): Decision {
	return attempt < MAX_ATTEMPTS
		? { action: "retry", delayMs, reason: message }
		: { action: "fail", code, message: `${message} (gave up after ${attempt} attempts)` };
}
