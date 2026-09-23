import { afterAll, describe, expect, test } from "bun:test";
import { eq, schema, sql } from "@socialfly/db";
import { database, db } from "#src/infrastructure/index.ts";
import { CLIENT_ID, STRONG_PASSWORD, TestBrowser, uniqueEmail } from "./helpers";

afterAll(async () => {
	await database.close();
});

async function signedUpBrowser() {
	const browser = new TestBrowser();
	const email = uniqueEmail();
	await browser.csrf();
	const res = await browser.request("POST", "/auth/register", {
		client_id: CLIENT_ID,
		email,
		password: STRONG_PASSWORD,
		name: "Test User",
	});
	expect(res.status).toBe(201);
	return { browser, email };
}

describe("registration and login", () => {
	test("register signs the user in with access + refresh cookies", async () => {
		const { browser, email } = await signedUpBrowser();
		expect(browser.cookies.has("sf_access")).toBe(true);
		expect(browser.cookies.has("sf_refresh")).toBe(true);

		const me = await browser.request("GET", "/auth/me");
		expect(me.status).toBe(200);
		expect(await me.json()).toMatchObject({ email, name: "Test User", emailVerified: false });
	});

	test("state-changing requests without the CSRF header are refused", async () => {
		const browser = new TestBrowser();
		const res = await browser.request("POST", "/auth/login", {
			client_id: CLIENT_ID,
			email: uniqueEmail(),
			password: STRONG_PASSWORD,
		});
		expect(res.status).toBe(403);
		expect(await res.json()).toMatchObject({ error: { code: "csrf_invalid" } });
	});

	test("duplicate email is a 409 with a stable code", async () => {
		const { email } = await signedUpBrowser();
		const other = new TestBrowser();
		await other.csrf();
		const res = await other.request("POST", "/auth/register", {
			client_id: CLIENT_ID,
			email: email.toUpperCase(),
			password: STRONG_PASSWORD,
		});
		expect(res.status).toBe(409);
		expect(await res.json()).toMatchObject({ error: { code: "email_taken" } });
	});

	test("weak passwords are rejected with field-level details", async () => {
		const browser = new TestBrowser();
		await browser.csrf();
		const res = await browser.request("POST", "/auth/register", {
			client_id: CLIENT_ID,
			email: uniqueEmail(),
			password: "short",
		});
		expect(res.status).toBe(422);
		const body = (await res.json()) as { error: { details: { fields: Record<string, string> } } };
		expect(body.error.details.fields.password).toContain("Password needs");
	});

	test("wrong password and unknown email get the same 401", async () => {
		const { email } = await signedUpBrowser();
		const browser = new TestBrowser();
		await browser.csrf();
		const wrong = await browser.request("POST", "/auth/login", {
			client_id: CLIENT_ID,
			email,
			password: "Wrong-password-123",
		});
		const unknown = await browser.request("POST", "/auth/login", {
			client_id: CLIENT_ID,
			email: uniqueEmail(),
			password: STRONG_PASSWORD,
		});
		expect(wrong.status).toBe(401);
		expect(unknown.status).toBe(401);
		expect(await wrong.json()).toEqual(await unknown.json());
	});

	test("an origin the client does not own cannot log in", async () => {
		const browser = new TestBrowser();
		await browser.csrf();
		const res = await browser.request(
			"POST",
			"/auth/login",
			{ client_id: CLIENT_ID, email: uniqueEmail(), password: STRONG_PASSWORD },
			{ Origin: "https://evil.example" },
		);
		expect(res.status).toBe(403);
	});
});

describe("refresh tokens", () => {
	test("refresh rotates the refresh token", async () => {
		const { browser } = await signedUpBrowser();
		const before = browser.cookies.get("sf_refresh");
		const res = await browser.request("POST", "/auth/refresh");
		expect(res.status).toBe(200);
		expect(browser.cookies.get("sf_refresh")).not.toBe(before);
	});

	test("a concurrent refresh with the just-rotated token is tolerated (two tabs)", async () => {
		const { browser } = await signedUpBrowser();
		const stale = browser.cookies.get("sf_refresh") as string;
		await browser.request("POST", "/auth/refresh");

		const otherTab = new TestBrowser();
		otherTab.cookies.set("sf_refresh", stale);
		otherTab.cookies.set("sf_csrf", browser.cookies.get("sf_csrf") as string);
		const res = await otherTab.request("POST", "/auth/refresh");
		expect(res.status).toBe(200);
		expect(otherTab.cookies.get("sf_refresh")).toBe(stale); // no new refresh token issued

		// The legitimate session is untouched.
		expect((await browser.request("GET", "/auth/me")).status).toBe(200);
	});

	test("replaying a rotated-out refresh token revokes every session", async () => {
		const { browser, email } = await signedUpBrowser();
		const stolen = browser.cookies.get("sf_refresh") as string;
		await browser.request("POST", "/auth/refresh");

		// Move the rotation outside the grace window.
		const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
		await db
			.update(schema.authSessions)
			.set({ updatedAt: sql`now() - interval '5 minutes'` })
			.where(eq(schema.authSessions.userId, user?.id as string));

		const attacker = new TestBrowser();
		attacker.cookies.set("sf_refresh", stolen);
		attacker.cookies.set("sf_csrf", browser.cookies.get("sf_csrf") as string);
		expect((await attacker.request("POST", "/auth/refresh")).status).toBe(401);

		// The victim's current tokens are dead too — reuse detection revoked everything.
		expect((await browser.request("GET", "/auth/me")).status).toBe(401);
		expect((await browser.request("POST", "/auth/refresh")).status).toBe(401);
	});
});

describe("logout and revocation", () => {
	test("logout invalidates the access token immediately, not at expiry", async () => {
		const { browser } = await signedUpBrowser();
		const access = browser.cookies.get("sf_access") as string;
		expect((await browser.request("POST", "/auth/logout")).status).toBe(200);

		const replay = new TestBrowser();
		const res = await replay.request("GET", "/auth/me", undefined, {
			Authorization: `Bearer ${access}`,
		});
		expect(res.status).toBe(401);
	});
});

describe("password recovery", () => {
	test("reset sets the new password and signs out all sessions", async () => {
		const { browser, email } = await signedUpBrowser();
		const requester = new TestBrowser();
		await requester.csrf();
		const req = await requester.request("POST", "/auth/recovery/request", {
			client_id: CLIENT_ID,
			email,
		});
		const { token } = (await req.json()) as { token: string };
		expect(token).toBeString();

		const confirm = await requester.request("POST", "/auth/recovery/confirm", {
			token,
			password: "Brand-New-Passw0rd!",
		});
		expect(confirm.status).toBe(200);
		expect((await browser.request("GET", "/auth/me")).status).toBe(401);

		// Single use.
		const again = await requester.request("POST", "/auth/recovery/confirm", {
			token,
			password: "Another-Passw0rd!!",
		});
		expect(again.status).toBe(400);

		const login = await requester.request("POST", "/auth/login", {
			client_id: CLIENT_ID,
			email,
			password: "Brand-New-Passw0rd!",
		});
		expect(login.status).toBe(200);
	});

	test("recovery for an unknown email looks identical to a known one", async () => {
		const browser = new TestBrowser();
		await browser.csrf();
		const res = await browser.request("POST", "/auth/recovery/request", {
			client_id: CLIENT_ID,
			email: uniqueEmail(),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});
});

describe("health", () => {
	test("/ready checks postgres for real", async () => {
		const { app } = await import("#src/app.ts");
		const res = await app.request("/ready");
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ status: "ready", checks: { postgres: { ok: true } } });
	});
});
