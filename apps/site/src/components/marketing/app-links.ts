import { webEnv } from "@socialfly/config/web";

/**
 * The product app is a separate deployment (apps/app). Sign-in and sign-up live there,
 * so every "Log in" / "Get started" CTA on the site is an absolute link to it.
 */
export const APP_URL = webEnv.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
export const LOGIN_URL = `${APP_URL}/login`;
export const SIGNUP_URL = `${APP_URL}/signup`;
