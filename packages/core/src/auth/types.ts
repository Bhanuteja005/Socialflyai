/**
 * Claims inside an access JWT minted by apps/auth.
 *
 * Deliberately identity-only: no organization or role. A user can belong to many
 * organizations and roles change; baking them into a 15-minute token would make a
 * removed member keep access until expiry. The API resolves membership per request
 * from the `X-Organization-Id` header instead.
 */
export type AccessClaims = {
	iss: string;
	aud: string;
	/** User id, or the service client id for `principal: "service"`. */
	sub: string;
	/** Session id ("" for service tokens, which have no session). */
	sid: string;
	/** First-party client that obtained the token (e.g. "socialfly-web"). */
	cid: string;
	email: string;
	email_verified: boolean;
	/** Bumped on password change/reset; tokens carrying an older value are rejected. */
	token_version: number;
	principal: "user" | "service";
	/** Space-separated scopes. Only service tokens carry scopes today. */
	scope?: string;
	jti: string;
	iat: number;
	exp: number;
};

export type AuthContext = {
	userId: string;
	sessionId: string;
	clientId: string;
	email: string;
	emailVerified: boolean;
	principal: AccessClaims["principal"];
	scopes: string[];
};

/** Hono `Variables` for any route behind `requireAuth`. */
export type AuthVariables = { auth: AuthContext };

export type PublicUser = {
	id: string;
	email: string;
	emailVerified: boolean;
	name: string | null;
	avatarUrl: string | null;
};

export type SessionInfo = {
	id: string;
	clientId: string;
	expiresAt: string;
	authenticatedAt: string;
};
