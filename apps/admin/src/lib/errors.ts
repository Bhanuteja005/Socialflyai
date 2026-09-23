/** The backend's error envelope: `{ error: { code, message, details? } }`. */
export type ApiErrorBody = {
	error: { code: string; message: string; details?: Record<string, unknown> };
};

export class ApiError extends Error {
	override readonly name = "ApiError";

	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly details?: Record<string, unknown>,
	) {
		super(message);
	}

	/** 422 `validation_failed` → `{ fieldName: message }`. */
	get fields(): Record<string, string> {
		const fields = this.details?.fields;
		return fields && typeof fields === "object" ? (fields as Record<string, string>) : {};
	}
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

const FRIENDLY: Record<string, string> = {
	rate_limited: "Too many attempts. Please wait a moment and try again.",
	login_disabled: "Sign-in is currently disabled.",
	account_disabled: "This account is disabled.",
	cannot_disable_self: "You can't disable your own account.",
	network_error: "Can't reach SocialFly right now. Check your connection and try again.",
};

/** A message fit for a toast: the API's own message, or a friendlier one for known codes. */
export function errorMessage(
	error: unknown,
	fallback = "Something went wrong. Please try again.",
): string {
	if (isApiError(error)) {
		if (error.code === "validation_failed") {
			const first = Object.values(error.fields)[0];
			return first ?? error.message;
		}
		return FRIENDLY[error.code] ?? error.message ?? fallback;
	}
	if (error instanceof Error && error.message) return error.message;
	return fallback;
}
