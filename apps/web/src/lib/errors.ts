/** The backend's error envelope: `{ error: { code, message, details? } }`. */
export type ApiErrorBody = {
	error: { code: string; message: string; details?: Record<string, unknown> };
};

export type PostInvalidTarget = {
	channelId: string;
	channelName: string;
	provider: string;
	errors: string[];
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

	/** 422 `post_invalid` → per-channel problems. */
	get targets(): PostInvalidTarget[] {
		const targets = this.details?.targets;
		return Array.isArray(targets) ? (targets as PostInvalidTarget[]) : [];
	}
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

const FRIENDLY: Record<string, string> = {
	email_taken: "An account with this email already exists. Try signing in instead.",
	invalid_token: "This link is invalid or has expired. Request a new one.",
	wrong_password: "Your current password is incorrect.",
	registration_disabled: "Sign-ups are currently closed.",
	login_disabled: "Sign-in is currently disabled.",
	rate_limited: "Too many attempts. Please wait a moment and try again.",
	google_email_unverified: "Your Google account has no verified email address.",
	account_disabled: "This account is disabled. Contact support if you think this is a mistake.",
	access_denied: "Google sign-in was cancelled.",
	invalid_state: "The sign-in attempt expired. Please try again.",
	oauth_failed: "Google sign-in failed. Please try again.",
	google_exchange_failed: "Google sign-in failed. Please try again.",
	invalid_invitation: "This invitation is invalid or has expired.",
	media_in_use: "This file is used by a post. Remove it from the post first.",
	post_locked: "This post has already been sent and can no longer be edited.",
	last_owner: "An organization needs at least one owner. Promote someone else first.",
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

export const friendlyCode = (code: string | null | undefined) =>
	code ? FRIENDLY[code] : undefined;
