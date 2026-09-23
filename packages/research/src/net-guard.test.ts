import { describe, expect, test } from "bun:test";
import { crawlSite } from "./crawler";
import { assertPublicHost, isPrivateAddress } from "./net-guard";

describe("isPrivateAddress", () => {
	test.each([
		"127.0.0.1",
		"10.1.2.3",
		"172.16.0.1",
		"172.31.255.255",
		"192.168.1.1",
		"169.254.169.254", // cloud metadata
		"100.64.0.1", // CGNAT
		"0.0.0.0",
		"224.0.0.1",
		"::1",
		"::",
		"fd00::1",
		"fe80::1",
		"::ffff:10.0.0.1",
		"not-an-ip",
	])("%s is refused", (ip) => expect(isPrivateAddress(ip)).toBe(true));

	test.each(["93.184.215.14", "172.32.0.1", "8.8.8.8", "2606:4700::1111", "::ffff:8.8.8.8"])(
		"%s is public",
		(ip) => expect(isPrivateAddress(ip)).toBe(false),
	);
});

describe("assertPublicHost", () => {
	test("rejects IP literals and names that resolve to loopback", async () => {
		expect(assertPublicHost("127.0.0.1")).rejects.toMatchObject({ kind: "invalid_request" });
		expect(assertPublicHost("[::1]")).rejects.toMatchObject({ kind: "invalid_request" });
		// "localhost" always resolves to loopback.
		expect(assertPublicHost("localhost")).rejects.toMatchObject({ kind: "invalid_request" });
	});
});

describe("crawlSite SSRF guard", () => {
	test("refuses a start URL that resolves to a private address", async () => {
		// Real network path (no injected fetch): 127.0.0.1 passes the URL syntax check but
		// must be stopped by the guard before any request is made.
		const error = await crawlSite("http://127.0.0.1:9/", { maxPages: 1, userAgent: "test" }).catch(
			(e) => e,
		);
		expect(error).toMatchObject({ kind: "invalid_request" });
		expect(String(error.message)).toContain("private or internal");
	});
});
