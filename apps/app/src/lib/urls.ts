import { webEnv } from "@socialfly/config/web";

/**
 * The public marketing site is a separate deployment (apps/site), so links to it —
 * home, legal pages — are absolute, plain <a> links rather than client-side routes.
 */
export const SITE_URL = webEnv.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
