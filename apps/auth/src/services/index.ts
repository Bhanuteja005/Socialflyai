import { authEnv as env } from "@socialfly/config";
import type { JwtConfig } from "@socialfly/core/auth";
import { db, mailer } from "#src/infrastructure/index.ts";
import { AuthService } from "./auth.service";
import { GoogleOAuthService } from "./google-oauth.service";
import { ServiceTokenService } from "./service-token.service";

export const jwtConfig: JwtConfig = {
	issuer: env.AUTH_ISSUER,
	audience: env.AUTH_AUDIENCE,
	secret: env.AUTH_JWT_SECRET,
};

export const authService = new AuthService(db, mailer, jwtConfig, env.WEB_URL);
export const googleOAuthService = new GoogleOAuthService(db, {
	clientId: env.GOOGLE_CLIENT_ID,
	clientSecret: env.GOOGLE_CLIENT_SECRET,
	redirectUri: env.GOOGLE_REDIRECT_URI,
});
export const serviceTokenService = new ServiceTokenService(db, jwtConfig);
