import type { AppType } from "@socialfly/api";
import { webEnv } from "@socialfly/config/web";
import { hc } from "hono/client";
import {
	ensureCsrf,
	isCsrfFailure,
	networkFetch,
	refreshSession,
	signalUnauthorized,
	toApiError,
} from "./auth-client";

export const API_URL = webEnv.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");

let currentOrgId: string | null = null;

/** Set by the organization provider; sent as `X-Organization-Id` on every request. */
export function setApiOrganization(id: string | null) {
	currentOrgId = id;
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Transport for the typed client: cookies, CSRF, org header, and one transparent
 * refresh-and-retry on 401. Errors are NOT thrown here — `call()` does that — so
 * the hono client keeps its normal Response semantics.
 */
const apiFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
	const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
	const method = (init?.method ?? "GET").toUpperCase();

	const send = async (forceCsrf = false) => {
		const headers = new Headers(init?.headers);
		if (currentOrgId) headers.set("X-Organization-Id", currentOrgId);
		if (!SAFE.has(method)) headers.set("X-CSRF-Token", await ensureCsrf(forceCsrf));
		return networkFetch(url, { ...init, method, headers, credentials: "include" });
	};

	let res = await send();
	if (res.status === 403 && !SAFE.has(method) && isCsrfFailure(await toApiError(res.clone()))) {
		res = await send(true);
	}
	if (res.status === 401) {
		if (await refreshSession()) res = await send();
		if (res.status === 401) signalUnauthorized();
	}
	return res;
}) as typeof fetch;

export const api = hc<AppType>(API_URL, { fetch: apiFetch });

type JsonResponse = { ok: boolean; status: number; json(): Promise<unknown> };
type JsonOf<R> = R extends { json(): Promise<infer T> } ? T : never;

/** Awaits a typed request and returns its JSON body, throwing `ApiError` on non-2xx. */
export async function call<R extends JsonResponse>(request: Promise<R>): Promise<JsonOf<R>> {
	const res = await request;
	if (!res.ok) throw await toApiError(res as unknown as Response);
	return (await res.json()) as JsonOf<R>;
}

/** For endpoints that answer 204 No Content. */
export async function callVoid(request: Promise<{ ok: boolean }>): Promise<void> {
	const res = await request;
	if (!res.ok) throw await toApiError(res as unknown as Response);
}
