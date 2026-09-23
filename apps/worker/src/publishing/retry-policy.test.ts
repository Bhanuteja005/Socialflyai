import { describe, expect, test } from "bun:test";
import { ProviderError } from "@socialfly/integrations";
import { backoffMs, decide, MAX_ATTEMPTS } from "./retry-policy";

const err = (kind: ProviderError["kind"], details: ProviderError["details"] = {}) =>
	new ProviderError(kind, "linkedin", `boom (${kind})`, details);
const ctx = { attempt: 1, sent: true, alreadyRefreshed: false };

describe("decide", () => {
	test("unknown_outcome is never retried", () => {
		expect(decide(err("unknown_outcome"), ctx).action).toBe("unconfirmed");
	});

	test("a crash after sending is treated as unknown outcome", () => {
		expect(decide(new Error("bug in result handling"), { ...ctx, sent: true }).action).toBe(
			"unconfirmed",
		);
	});

	test("a crash before sending is safe to retry", () => {
		expect(decide(new Error("db blip"), { ...ctx, sent: false }).action).toBe("retry");
	});

	test("auth: refresh once, then fail as needs-reauth", () => {
		expect(decide(err("auth"), ctx)).toEqual({ action: "refresh_token" });
		expect(decide(err("auth"), { ...ctx, alreadyRefreshed: true })).toMatchObject({
			action: "fail",
			code: "channel_needs_reauth",
		});
	});

	test("rate limits wait at least as long as the platform asked", () => {
		const d = decide(err("rate_limited", { retryAfterMs: 15 * 60_000 }), ctx);
		expect(d.action).toBe("retry");
		expect(d.action === "retry" && d.delayMs).toBeGreaterThanOrEqual(15 * 60_000);
	});

	test("transient errors retry until MAX_ATTEMPTS, then fail", () => {
		expect(decide(err("transient"), { ...ctx, attempt: MAX_ATTEMPTS - 1 }).action).toBe("retry");
		expect(decide(err("transient"), { ...ctx, attempt: MAX_ATTEMPTS })).toMatchObject({
			action: "fail",
			code: "platform_unavailable",
		});
	});

	test("invalid requests fail immediately with the platform's code", () => {
		expect(decide(err("invalid_request", { platformCode: "DUPLICATE" }), ctx)).toMatchObject({
			action: "fail",
			code: "DUPLICATE",
		});
	});
});

describe("backoffMs", () => {
	test("grows exponentially and is capped", () => {
		expect(backoffMs(1, 0.5)).toBe(30_000);
		expect(backoffMs(2, 0.5)).toBe(60_000);
		expect(backoffMs(20, 0.5)).toBe(30 * 60_000);
	});

	test("jitter stays within ±20%", () => {
		expect(backoffMs(1, 0)).toBe(24_000);
		expect(backoffMs(1, 1)).toBe(36_000);
	});
});
