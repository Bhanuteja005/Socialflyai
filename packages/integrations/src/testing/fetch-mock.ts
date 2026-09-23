import type { Logger } from "@socialfly/core/logger";
import type { ChannelContext } from "../types";

/**
 * Test-only fetch stub for adapter tests. Adapters call the global fetch through
 * providerFetch, so swapping globalThis.fetch exercises the real URL building,
 * headers and error mapping without any network.
 */

export type RecordedCall = { url: URL; init: RequestInit };
type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;

export function mockFetch(handler: Handler) {
	const calls: RecordedCall[] = [];
	const original = globalThis.fetch;
	const stub = async (input: string | URL | Request, init: RequestInit = {}) => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		calls.push({ url, init });
		return handler(url, init);
	};
	globalThis.fetch = stub as unknown as typeof fetch;
	return {
		calls,
		restore: () => {
			globalThis.fetch = original;
		},
	};
}

export const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});

export const graphErrorResponse = (code: number, subcode?: number, message = `boom ${code}`) =>
	jsonResponse(
		{
			error: {
				message,
				type: "OAuthException",
				code,
				...(subcode ? { error_subcode: subcode } : {}),
			},
		},
		400,
	);

const noop = () => {};
const silentLogger = {
	trace: noop,
	debug: noop,
	info: noop,
	warn: noop,
	error: noop,
	fatal: noop,
	child: () => silentLogger,
} as unknown as Logger;

export const channel = (overrides: Partial<ChannelContext> = {}): ChannelContext => ({
	externalId: "acct-1",
	accessToken: "tok-123",
	metadata: {},
	logger: silentLogger,
	...overrides,
});

/** Header value regardless of how the adapter passed headers. */
export const header = (init: RequestInit, name: string) =>
	new Headers(init.headers).get(name) ?? undefined;
