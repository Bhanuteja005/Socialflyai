import { type NextRequest, NextResponse } from "next/server";

/**
 * Fast path only: someone with no SocialFly cookies at all cannot have a session,
 * so skip rendering the app shell and send them straight to /login. Real session
 * checks happen client-side (AuthGuard) and on every API call.
 *
 * `sf_csrf` counts too: with an expired access cookie the refresh cookie (path
 * /auth, invisible here) may still be valid, and the CSRF cookie tells us the
 * browser has signed in before.
 */
export function proxy(request: NextRequest) {
	const { cookies, nextUrl } = request;
	if (cookies.has("sf_access") || cookies.has("sf_csrf")) return NextResponse.next();

	const login = new URL("/login", request.url);
	login.searchParams.set("next", `${nextUrl.pathname}${nextUrl.search}`);
	return NextResponse.redirect(login);
}

export const config = {
	matcher: [
		"/dashboard/:path*",
		"/calendar/:path*",
		"/posts/:path*",
		"/compose/:path*",
		"/channels/:path*",
		"/media/:path*",
		"/settings/:path*",
		"/onboarding/:path*",
		"/create/:path*",
		"/analytics/:path*",
	],
};
