export const COOKIE_NAMES = {
	access: "sf_access",
	refresh: "sf_refresh",
	csrf: "sf_csrf",
} as const;

/** Reads a JS-visible cookie (only `sf_csrf` is; the session cookies are httpOnly). */
export function readCookie(name: string): string | null {
	if (typeof document === "undefined") return null;
	for (const part of document.cookie.split(";")) {
		const [key, ...rest] = part.trim().split("=");
		if (key === name) return decodeURIComponent(rest.join("="));
	}
	return null;
}
