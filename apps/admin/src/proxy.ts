import { type NextRequest, NextResponse } from "next/server";

/**
 * Fast path only: someone with no SocialFly cookies at all cannot have a session,
 * so skip rendering the console shell and send them straight to /login. Real checks
 * happen client-side (AdminGuard: session, then GET /admin/me) and on every API call.
 *
 * `sf_csrf` counts too: with an expired access cookie the refresh cookie (path
 * /auth, invisible here) may still be valid, and the CSRF cookie tells us the
 * browser has signed in before.
 */
export function proxy(request: NextRequest) {
	const { cookies, nextUrl } = request;
	if (cookies.has("sf_access") || cookies.has("sf_csrf")) return NextResponse.next();

	const login = new URL("/login", request.url);
	if (nextUrl.pathname !== "/") {
		login.searchParams.set("next", `${nextUrl.pathname}${nextUrl.search}`);
	}
	return NextResponse.redirect(login);
}

export const config = {
	// Everything except the sign-in page, Next internals and static files: unlike the
	// product app, the console has no public pages at all.
	matcher: ["/((?!login|_next/|assets/|robots\\.txt|favicon\\.ico).*)"],
};
