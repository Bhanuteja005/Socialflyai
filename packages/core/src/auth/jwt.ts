import { sign, verify } from "hono/jwt";
import { unauthorized } from "../errors";
import type { AccessClaims } from "./types";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export type JwtConfig = { issuer: string; audience: string; secret: string };

export async function signAccessJwt(
	config: JwtConfig,
	claims: Omit<AccessClaims, "iss" | "aud" | "iat" | "exp" | "jti">,
	ttlSeconds = ACCESS_TOKEN_TTL_SECONDS,
): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	return sign(
		{
			...claims,
			iss: config.issuer,
			aud: config.audience,
			jti: crypto.randomUUID(),
			iat: now,
			exp: now + ttlSeconds,
		},
		config.secret,
		"HS256",
	);
}

/** Verifies signature, expiry, issuer and audience. Throws AppError(401) on any failure. */
export async function verifyAccessJwt(config: JwtConfig, token: string): Promise<AccessClaims> {
	let decoded: AccessClaims;
	try {
		decoded = (await verify(token, config.secret, "HS256")) as unknown as AccessClaims;
	} catch {
		throw unauthorized("Invalid or expired access token");
	}
	if (decoded.iss !== config.issuer || decoded.aud !== config.audience) {
		throw unauthorized("Access token was issued for a different service");
	}
	return decoded;
}
