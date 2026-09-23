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
	ai_not_configured:
		"AI isn't set up on this server yet. Ask whoever runs SocialFly to add an API key.",
	ai_budget_exceeded:
		"Your organization has used this month's AI budget. It resets at the start of next month.",
	ai_rate_limited: "You're generating faster than the AI allows. Wait a moment and try again.",
	ai_refused: "The AI declined this request. Try rephrasing it.",
	ai_invalid_output: "The AI returned something we couldn't use. Please try again.",
	ai_unavailable: "The AI service is unavailable right now. Please try again in a minute.",
	no_website:
		"Add your website in Brand voice settings, or enter a URL here, so we know what to research.",
	research_in_progress: "A research run is already in progress. It will finish in a few minutes.",
	robots_disallowed:
		"Your website's robots.txt asks crawlers not to read these pages, so we stopped. Allow our crawler (SocialFlyBot) or research a different URL.",
	seo_not_configured:
		"Keyword data isn't set up on this server. Ask whoever runs SocialFly to add DataForSEO credentials.",
	reply_in_progress:
		"Another reply to this is already waiting for approval or being sent. Wait for it to finish first.",
	reply_not_editable: "This reply is already on its way and can no longer be changed.",
	reply_not_deletable: "Only drafts and rejected replies can be deleted.",
	reply_changed: "Someone changed this reply meanwhile. Reload and try again.",
	query_limit:
		"You can have up to 10 active listening queries. Pause or delete one to add another.",
	provider_unavailable:
		"Listening needs a connected channel on a platform that supports search, like Reddit or X.",
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
