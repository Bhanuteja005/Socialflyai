import { describe, expect, test } from "bun:test";
import { classifyXError } from "./x";

describe("classifyXError", () => {
	test("duplicate-content 403 is invalid_request", () => {
		const body = JSON.stringify({
			detail: "You are not allowed to create a Tweet with duplicate content.",
			type: "about:blank",
			title: "Forbidden",
			status: 403,
		});
		const err = classifyXError("x", 403, body);
		expect(err?.kind).toBe("invalid_request");
		expect(err?.details.platformCode).toBe("duplicate");
	});

	test("content-level 403 (reply restrictions) is invalid_request", () => {
		const body = JSON.stringify({
			detail: "Reply to this conversation is not allowed because you have not been mentioned.",
		});
		expect(classifyXError("x", 403, body)?.kind).toBe("invalid_request");
	});

	test("app/client-level 403 falls back to the default (auth)", () => {
		const body = JSON.stringify({
			detail:
				"When authenticating requests to the Twitter API v2 endpoints, you must use keys and tokens from a Twitter developer App that is attached to a Project.",
			reason: "client-not-enrolled",
		});
		expect(classifyXError("x", 403, body)).toBeUndefined();
	});

	test("invalid_grant on the token endpoint is auth", () => {
		expect(classifyXError("x", 400, JSON.stringify({ error: "invalid_grant" }))?.kind).toBe("auth");
	});

	test("400 validation errors carry X's detail", () => {
		const body = JSON.stringify({
			errors: [{ message: "text: too long" }],
			title: "Invalid Request",
		});
		const err = classifyXError("x", 400, body);
		expect(err?.kind).toBe("invalid_request");
		expect(err?.message).toBe("text: too long");
	});

	test("5xx and 429 are left to the default mapping", () => {
		expect(classifyXError("x", 503, "Service Unavailable")).toBeUndefined();
		expect(classifyXError("x", 429, "{}")).toBeUndefined();
	});
});
