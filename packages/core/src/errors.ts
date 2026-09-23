/**
 * The one error type services throw on purpose.
 *
 * Every expected failure (bad input, not found, conflict, forbidden) is an AppError
 * with an HTTP status and a stable machine-readable `code`. The HTTP layer maps it
 * in exactly one place (`errorHandler` in ./http). Anything that is NOT an AppError
 * is a bug and becomes a 500 with no internals leaked.
 *
 * Never choose a status by matching on `error.message`: messages are for humans and
 * change freely, and a reworded message must not turn a 409 into a 500.
 */
export class AppError extends Error {
	override readonly name = "AppError";

	constructor(
		readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429 | 500 | 502 | 503,
		readonly code: string,
		message: string,
		readonly details?: Record<string, unknown>,
		options?: { cause?: unknown },
	) {
		super(message, options);
	}

	toJSON() {
		return { error: { code: this.code, message: this.message, details: this.details } };
	}
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

export const badRequest = (message: string, details?: Record<string, unknown>) =>
	new AppError(400, "bad_request", message, details);
export const validationFailed = (details: Record<string, unknown>) =>
	new AppError(422, "validation_failed", "Request validation failed", details);
export const unauthorized = (message = "Authentication required") =>
	new AppError(401, "unauthorized", message);
export const forbidden = (message = "You do not have access to this resource") =>
	new AppError(403, "forbidden", message);
export const notFound = (resource: string) =>
	new AppError(404, "not_found", `${resource} not found`);
export const conflict = (message: string, code = "conflict") => new AppError(409, code, message);
export const tooManyRequests = (retryAfterSeconds?: number) =>
	new AppError(429, "rate_limited", "Too many requests", { retryAfterSeconds });
export const upstreamFailed = (service: string, cause?: unknown) =>
	new AppError(502, "upstream_failed", `${service} request failed`, undefined, { cause });
export const unavailable = (message = "Service temporarily unavailable") =>
	new AppError(503, "unavailable", message);
