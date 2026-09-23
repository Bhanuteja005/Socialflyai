import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AiError } from "@socialfly/ai";

/**
 * SSRF guard for crawling user-supplied websites from our servers.
 *
 * Users type a URL; our worker fetches it. Without this, "https://evil.example"
 * whose DNS points at 169.254.169.254 (cloud metadata), 10.x (the VPC) or
 * 127.0.0.1 (the worker itself) would let anyone read internal services through
 * the research feature. Every request — the start URL and every redirect hop —
 * must resolve only to public unicast addresses.
 *
 * Known limit: we resolve, then fetch() resolves again, so a DNS-rebinding
 * attacker with a very short TTL could still swap the answer in between. Closing
 * that fully needs an egress proxy or pinned-IP connections; production should
 * also run the worker in a network without access to metadata endpoints.
 */

function ipv4Private(ip: string): boolean {
	const [a = 0, b = 0] = ip.split(".").map(Number);
	return (
		a === 0 || // "this" network
		a === 10 ||
		a === 127 || // loopback
		(a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
		(a === 169 && b === 254) || // link-local, incl. cloud metadata
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 192 && b === 0) || // IETF protocol assignments (incl. 192.0.0.0/24)
		(a === 198 && (b === 18 || b === 19)) || // benchmarking
		a >= 224 // multicast + reserved + broadcast
	);
}

function ipv6Private(ip: string): boolean {
	const v = ip.toLowerCase();
	if (v === "::" || v === "::1") return true;
	// IPv4-mapped (::ffff:10.0.0.1) — judge the embedded IPv4 address.
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
	if (mapped?.[1]) return ipv4Private(mapped[1]);
	return (
		v.startsWith("fc") || // unique local fc00::/7
		v.startsWith("fd") ||
		v.startsWith("fe8") || // link-local fe80::/10
		v.startsWith("fe9") ||
		v.startsWith("fea") ||
		v.startsWith("feb") ||
		v.startsWith("ff") // multicast
	);
}

export function isPrivateAddress(ip: string): boolean {
	const family = isIP(ip);
	if (family === 4) return ipv4Private(ip);
	if (family === 6) return ipv6Private(ip);
	return true; // not an IP at all: refuse rather than guess
}

/** Throws unless every address the hostname resolves to is public. */
export async function assertPublicHost(hostname: string): Promise<void> {
	const host = hostname.replace(/^\[|\]$/g, "");
	const addresses = isIP(host)
		? [host]
		: await lookup(host, { all: true, verbatim: true })
				.then((list) => list.map((a) => a.address))
				.catch(() => {
					throw new AiError("invalid_request", `Could not resolve ${hostname}`, {
						provider: "crawler",
					});
				});
	if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
		throw new AiError(
			"invalid_request",
			`${hostname} points to a private or internal network address and cannot be crawled`,
			{ provider: "crawler" },
		);
	}
}
