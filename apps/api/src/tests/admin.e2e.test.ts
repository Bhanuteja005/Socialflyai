import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, schema } from "@socialfly/db";
import { db } from "#src/infrastructure/index.ts";
import { type ApiClient, createChannel, createUser } from "./helpers";

/** A platform admin is a normal user whose role was granted out of band (the CLI in real life). */
async function createAdmin(name = "Staff") {
	const created = await createUser(name);
	await db
		.update(schema.users)
		.set({ platformRole: "admin" })
		.where(eq(schema.users.id, created.user.id));
	return created;
}

async function createOrg(client: ApiClient, name: string) {
	const res = await client.request("POST", "/organizations", { name });
	expect(res.status).toBe(201);
	return res.json as { id: string; name: string; slug: string };
}

/** A post with one target in the given state, inserted directly (the worker's job in real life). */
async function createTarget(
	orgId: string,
	status: (typeof schema.targetStatus.enumValues)[number],
	extra: Partial<typeof schema.postTargets.$inferInsert> = {},
) {
	const channel = await createChannel(orgId);
	const [post] = await db
		.insert(schema.posts)
		.values({ organizationId: orgId, content: "hello", status: "failed" })
		.returning();
	if (!post) throw new Error("no post");
	const [target] = await db
		.insert(schema.postTargets)
		.values({ organizationId: orgId, postId: post.id, channelId: channel.id, status, ...extra })
		.returning();
	if (!target) throw new Error("no target");
	return { post, target, channel };
}

let admin: ApiClient;
let adminUserId: string;
let adminEmail: string;
let user: ApiClient;

beforeAll(async () => {
	const a = await createAdmin();
	admin = a.client;
	adminUserId = a.user.id;
	adminEmail = a.user.email;
	({ client: user } = await createUser("Customer"));
});

const ID = "01900000-0000-7000-8000-000000000000";
const ROUTES: [string, string, unknown?][] = [
	["GET", "/admin/me"],
	["GET", "/admin/overview"],
	["GET", "/admin/organizations"],
	["GET", `/admin/organizations/${ID}`],
	["PATCH", `/admin/organizations/${ID}`, { aiMonthlyBudgetUsd: 1 }],
	["GET", "/admin/users"],
	["PATCH", `/admin/users/${ID}`, { status: "disabled" }],
	["GET", "/admin/publishing/targets"],
	["GET", "/admin/ai/generations"],
	["GET", "/admin/queues"],
	["GET", "/admin/audit"],
];

describe("access", () => {
	test("a non-admin gets 404 on every admin route (the console is not revealed)", async () => {
		for (const [method, path, body] of ROUTES) {
			const res = await user.request(method, path, body);
			expect([path, res.status]).toEqual([path, 404]);
			expect(res.json.error.code).toBe("not_found");
		}
	});

	test("revoking the role takes effect on the next request (checked from the DB, not the token)", async () => {
		const { client, user: u } = await createAdmin("Soon Ex-Staff");
		expect((await client.request("GET", "/admin/me")).status).toBe(200);
		await db.update(schema.users).set({ platformRole: "user" }).where(eq(schema.users.id, u.id));
		expect((await client.request("GET", "/admin/me")).status).toBe(404);
	});

	test("/admin/me describes the signed-in admin", async () => {
		const res = await admin.request("GET", "/admin/me");
		expect(res.status).toBe(200);
		expect(res.json).toEqual({
			id: adminUserId,
			email: adminEmail,
			name: "Staff",
			platformRole: "admin",
		});
	});
});

describe("overview", () => {
	test("counts reflect newly inserted rows", async () => {
		const before = (await admin.request("GET", "/admin/overview")).json;

		const { client: owner, user: ownerUser } = await createUser("Overview Owner");
		const org = await createOrg(owner, "Overview Org");
		await createTarget(org.id, "failed");
		await createTarget(org.id, "unconfirmed");
		const live = await createTarget(org.id, "published", { publishedAt: new Date() });
		await db.insert(schema.postTargetMetrics).values({
			organizationId: org.id,
			targetId: live.target.id,
			likes: 1,
		});
		const reauth = await createChannel(org.id, "x", "Needs reauth");
		await db
			.update(schema.channels)
			.set({ status: "needs_reauth" })
			.where(eq(schema.channels.id, reauth.id));
		await db.insert(schema.aiGenerations).values({
			organizationId: org.id,
			userId: ownerUser.id,
			kind: "post",
			status: "succeeded",
			costMicros: 1_500_000,
		});

		const res = await admin.request("GET", "/admin/overview");
		expect(res.status).toBe(200);
		const after = res.json;
		// At least, not exactly: turbo runs the auth and worker suites in parallel against
		// the same test database, so their rows can land between the two snapshots.
		const grew = (pick: (o: typeof after) => number, by: number) =>
			expect(pick(after) - pick(before)).toBeGreaterThanOrEqual(by);
		grew((o) => o.users.total, 1);
		grew((o) => o.users.new7d, 1);
		grew((o) => o.organizations.total, 1);
		grew((o) => o.organizations.new7d, 1);
		grew((o) => o.channels.total, 4);
		grew((o) => o.channels.needsReauth, 1);
		grew((o) => o.posts.byStatus.failed, 3);
		grew((o) => o.posts.total, 3);
		grew((o) => o.publishing.failed24h, 1);
		grew((o) => o.publishing.unconfirmed24h, 1);
		grew((o) => o.publishing.published24h, 1);
		grew((o) => o.ai.spendUsd, 1.5);
		grew((o) => o.ai.generations.byStatus.succeeded, 1);
		grew((o) => o.analytics.snapshots24h, 1);
		grew((o) => o.analytics.channelsCollected24h, 1);
		expect(Object.keys(after.ai.generations.byStatus).sort()).toEqual([
			"failed",
			"pending",
			"running",
			"succeeded",
		]);
		expect(new Date(after.ai.periodStart).getUTCDate()).toBe(1);
	});
});

describe("organizations", () => {
	test("search by name or slug, with keyset pagination", async () => {
		const tag = `zeta${crypto.randomUUID().slice(0, 8)}`;
		const { client: owner } = await createUser("Org Owner");
		const created = [];
		for (const n of [1, 2, 3]) created.push(await createOrg(owner, `${tag} Org ${n}`));

		const first = await admin.request("GET", `/admin/organizations?q=${tag}&limit=2`);
		expect(first.status).toBe(200);
		expect(first.json.items.map((o: { name: string }) => o.name)).toEqual([
			`${tag} Org 3`,
			`${tag} Org 2`,
		]);
		expect(first.json.nextCursor).toBe(created[1]?.id);
		expect(first.json.items[0]).toMatchObject({
			memberCount: 1,
			channelCount: 0,
			postCount: 0,
			aiSpendMonthUsd: 0,
			aiMonthlyBudgetUsd: null,
			aiEffectiveBudgetUsd: 25,
			deletedAt: null,
		});

		const second = await admin.request(
			"GET",
			`/admin/organizations?q=${tag}&limit=2&before=${first.json.nextCursor}`,
		);
		expect(second.json.items.map((o: { name: string }) => o.name)).toEqual([`${tag} Org 1`]);
		expect(second.json.nextCursor).toBeNull();

		// Slugs are lowercased names plus a suffix — searching by the slug finds it too.
		const bySlug = await admin.request("GET", `/admin/organizations?q=${created[0]?.slug}`);
		expect(bySlug.json.items.map((o: { id: string }) => o.id)).toEqual([created[0]?.id]);

		// LIKE wildcards are literal: "%" alone must not match everything.
		const wildcard = await admin.request(
			"GET",
			`/admin/organizations?q=${encodeURIComponent("%")}`,
		);
		expect(wildcard.json.items).toEqual([]);
	});

	test("detail lists members, channels and posts — and never any token", async () => {
		const { client: owner, user: ownerUser } = await createUser("Detail Owner");
		const org = await createOrg(owner, "Detail Org");
		const { channel } = await createTarget(org.id, "failed");
		await db
			.update(schema.channels)
			.set({ refreshTokenEnc: "sealed-refresh-token", tokenExpiresAt: new Date() })
			.where(eq(schema.channels.id, channel.id));

		const res = await admin.request("GET", `/admin/organizations/${org.id}`);
		expect(res.status).toBe(200);
		expect(res.json).toMatchObject({
			id: org.id,
			name: "Detail Org",
			memberCount: 1,
			channelCount: 1,
			postCount: 1,
			postsByStatus: { failed: 1, draft: 0 },
			aiBudget: { usedUsd: 0, overrideUsd: null, limitUsd: 25 },
		});
		expect(res.json.members).toEqual([
			{
				userId: ownerUser.id,
				email: ownerUser.email,
				name: "Detail Owner",
				role: "owner",
				joinedAt: expect.any(String),
			},
		]);
		expect(res.json.channels).toEqual([
			{
				id: channel.id,
				provider: "linkedin",
				name: "Acme on LinkedIn",
				username: null,
				status: "active",
				lastError: null,
				tokenExpiresAt: expect.any(String),
				createdAt: expect.any(String),
			},
		]);
		const raw = JSON.stringify(res.json);
		expect(raw).not.toContain(channel.accessTokenEnc);
		expect(raw).not.toContain("sealed-refresh-token");
		expect(raw.toLowerCase()).not.toContain('token"');
		expect(raw).not.toContain("accessToken");
		expect(raw).not.toContain("refreshToken");

		expect((await admin.request("GET", `/admin/organizations/${ID}`)).status).toBe(404);
	});

	test("budget override: audited, and changes what /ai/capabilities enforces for that org", async () => {
		const { client: owner } = await createUser("Budget Owner");
		const org = await createOrg(owner, "Budget Org");
		owner.orgId = org.id;
		const caps = async () => (await owner.request("GET", "/ai/capabilities")).json.budget;
		expect(await caps()).toMatchObject({ limitUsd: 25 });

		const set = await admin.request("PATCH", `/admin/organizations/${org.id}`, {
			aiMonthlyBudgetUsd: 5.5,
		});
		expect(set.status).toBe(200);
		expect(set.json).toMatchObject({
			id: org.id,
			aiMonthlyBudgetUsd: 5.5,
			aiEffectiveBudgetUsd: 5.5,
		});
		expect(await caps()).toMatchObject({ limitUsd: 5.5, remainingUsd: 5.5 });

		const unlimited = await admin.request("PATCH", `/admin/organizations/${org.id}`, {
			aiMonthlyBudgetUsd: 0,
		});
		expect(unlimited.json).toMatchObject({ aiMonthlyBudgetUsd: 0, aiEffectiveBudgetUsd: null });
		expect(await caps()).toMatchObject({ limitUsd: null, remainingUsd: null });

		const cleared = await admin.request("PATCH", `/admin/organizations/${org.id}`, {
			aiMonthlyBudgetUsd: null,
		});
		expect(cleared.json).toMatchObject({ aiMonthlyBudgetUsd: null, aiEffectiveBudgetUsd: 25 });
		expect(await caps()).toMatchObject({ limitUsd: 25 });

		const audit = await db
			.select()
			.from(schema.adminAuditEvents)
			.where(eq(schema.adminAuditEvents.targetId, org.id))
			.orderBy(schema.adminAuditEvents.id);
		expect(audit.map((a) => [a.actorUserId, a.action, a.targetType, a.data])).toEqual([
			[adminUserId, "organization.ai_budget.update", "organization", { before: null, after: 5.5 }],
			[adminUserId, "organization.ai_budget.update", "organization", { before: 5.5, after: 0 }],
			[adminUserId, "organization.ai_budget.update", "organization", { before: 0, after: null }],
		]);

		const invalid = await admin.request("PATCH", `/admin/organizations/${org.id}`, {
			aiMonthlyBudgetUsd: -1,
		});
		expect(invalid.status).toBe(422);
		const missing = await admin.request("PATCH", `/admin/organizations/${ID}`, {
			aiMonthlyBudgetUsd: 1,
		});
		expect(missing.status).toBe(404);
	});
});

describe("users", () => {
	test("search and pagination", async () => {
		const tag = `u${crypto.randomUUID().slice(0, 8)}`;
		const a = await createUser(`${tag} Alice`);
		const b = await createUser(`${tag} Bob`);
		await createOrg(a.client, "Alice Org");

		const res = await admin.request("GET", `/admin/users?q=${tag}&limit=1`);
		expect(res.status).toBe(200);
		expect(res.json.items).toEqual([
			{
				id: b.user.id,
				email: b.user.email,
				name: `${tag} Bob`,
				status: "active",
				platformRole: "user",
				emailVerifiedAt: expect.any(String),
				lastLoginAt: null,
				createdAt: expect.any(String),
				orgCount: 0,
			},
		]);
		const next = await admin.request(
			"GET",
			`/admin/users?q=${tag}&limit=1&before=${res.json.nextCursor}`,
		);
		expect(next.json.items).toMatchObject([{ id: a.user.id, orgCount: 1 }]);
		expect(next.json.nextCursor).toBeNull();

		const byEmail = await admin.request("GET", `/admin/users?q=${a.user.email}`);
		expect(byEmail.json.items.map((u: { id: string }) => u.id)).toEqual([a.user.id]);
	});

	test("disabling bumps token_version and revokes sessions: the user's token dies at once", async () => {
		const victim = await createUser("To Disable");
		expect((await victim.client.request("GET", "/organizations")).status).toBe(200);

		const res = await admin.request("PATCH", `/admin/users/${victim.user.id}`, {
			status: "disabled",
		});
		expect(res.status).toBe(200);
		expect(res.json).toMatchObject({ id: victim.user.id, status: "disabled" });

		const [row] = await db.select().from(schema.users).where(eq(schema.users.id, victim.user.id));
		expect(row?.tokenVersion).toBe(victim.user.tokenVersion + 1);
		const [session] = await db
			.select()
			.from(schema.authSessions)
			.where(eq(schema.authSessions.id, victim.session.id));
		expect(session?.revokedAt).not.toBeNull();
		expect(session?.revokedReason).toBe("admin_disabled");

		expect((await victim.client.request("GET", "/organizations")).status).toBe(401);

		// Re-enabling restores the account but not the old token (its version is stale).
		const enabled = await admin.request("PATCH", `/admin/users/${victim.user.id}`, {
			status: "active",
		});
		expect(enabled.json.status).toBe("active");
		expect((await victim.client.request("GET", "/organizations")).status).toBe(401);

		const audit = await db
			.select()
			.from(schema.adminAuditEvents)
			.where(
				and(
					eq(schema.adminAuditEvents.targetType, "user"),
					eq(schema.adminAuditEvents.targetId, victim.user.id),
				),
			)
			.orderBy(schema.adminAuditEvents.id);
		expect(audit.map((a) => [a.action, a.data])).toEqual([
			["user.disable", { before: "active", after: "disabled", revokedSessions: 1 }],
			["user.enable", { before: "disabled", after: "active", revokedSessions: 0 }],
		]);
	});

	test("an admin cannot disable themselves", async () => {
		const res = await admin.request("PATCH", `/admin/users/${adminUserId}`, {
			status: "disabled",
		});
		expect(res.status).toBe(409);
		expect(res.json.error.code).toBe("cannot_disable_self");
		expect((await admin.request("GET", "/admin/me")).status).toBe(200);
	});

	test("platform role cannot be changed through the API", async () => {
		const target = await createUser("Not Staff");
		const res = await admin.request("PATCH", `/admin/users/${target.user.id}`, {
			status: "active",
			platformRole: "admin",
		});
		expect(res.status).toBe(200);
		expect(res.json.platformRole).toBe("user");
	});
});

describe("cross-organization views", () => {
	test("failed and unconfirmed targets from every organization", async () => {
		const { client: o1 } = await createUser("Pub Owner 1");
		const { client: o2 } = await createUser("Pub Owner 2");
		const org1 = await createOrg(o1, "Pub Org 1");
		const org2 = await createOrg(o2, "Pub Org 2");
		const failed = await createTarget(org1.id, "failed", {
			errorCode: "invalid_request",
			errorMessage: "Text too long",
			attempts: 1,
		});
		const unconfirmed = await createTarget(org2.id, "unconfirmed");
		const published = await createTarget(org2.id, "published");

		const all = await admin.request("GET", "/admin/publishing/targets?limit=100");
		expect(all.status).toBe(200);
		const ids = all.json.items.map((t: { id: string }) => t.id);
		expect(ids).toContain(failed.target.id);
		expect(ids).toContain(unconfirmed.target.id);
		expect(ids).not.toContain(published.target.id);
		expect(all.json.items.find((t: { id: string }) => t.id === failed.target.id)).toEqual({
			id: failed.target.id,
			postId: failed.post.id,
			organization: { id: org1.id, name: "Pub Org 1" },
			channel: { id: failed.channel.id, provider: "linkedin", name: "Acme on LinkedIn" },
			status: "failed",
			errorCode: "invalid_request",
			errorMessage: "Text too long",
			attempts: 1,
			scheduledAt: null,
			updatedAt: expect.any(String),
		});

		const onlyUnconfirmed = await admin.request(
			"GET",
			"/admin/publishing/targets?status=unconfirmed&limit=100",
		);
		const statuses = new Set(onlyUnconfirmed.json.items.map((t: { status: string }) => t.status));
		expect([...statuses]).toEqual(["unconfirmed"]);
		expect((await admin.request("GET", "/admin/publishing/targets?status=published")).status).toBe(
			422,
		);
	});

	test("AI generations across organizations, filterable", async () => {
		const { client: owner, user: ownerUser } = await createUser("Gen Owner");
		const org = await createOrg(owner, "Gen Org");
		const [gen] = await db
			.insert(schema.aiGenerations)
			.values({
				organizationId: org.id,
				userId: ownerUser.id,
				kind: "image",
				status: "failed",
				model: "openai:gpt-image-1",
				errorCode: "refused",
				costMicros: 40_000,
			})
			.returning();

		const res = await admin.request("GET", "/admin/ai/generations?status=failed&kind=image");
		expect(res.status).toBe(200);
		expect(res.json.items[0]).toEqual({
			id: gen?.id,
			organization: { id: org.id, name: "Gen Org" },
			userId: ownerUser.id,
			userEmail: ownerUser.email,
			kind: "image",
			status: "failed",
			model: "openai:gpt-image-1",
			errorCode: "refused",
			costUsd: 0.04,
			createdAt: expect.any(String),
		});
		for (const g of res.json.items) expect([g.status, g.kind]).toEqual(["failed", "image"]);
	});

	test("queue job counts for every queue", async () => {
		const res = await admin.request("GET", "/admin/queues");
		expect(res.status).toBe(200);
		const names = res.json.queues.map((q: { name: string }) => q.name);
		for (const name of [
			"publish-linkedin",
			"publish-x",
			"publish-youtube",
			"publish-status",
			"token-refresh",
			"maintenance",
			"ai-media",
		]) {
			expect(names).toContain(name);
		}
		for (const q of res.json.queues) {
			expect(Object.keys(q).sort()).toEqual([
				"active",
				"completed",
				"delayed",
				"failed",
				"name",
				"waiting",
			]);
			for (const k of ["waiting", "active", "delayed", "failed", "completed"])
				expect(typeof q[k]).toBe("number");
		}
	});
});

describe("audit trail", () => {
	test("lists admin actions newest first, with the actor's email", async () => {
		const { client: owner } = await createUser("Audit Owner");
		const org = await createOrg(owner, "Audit Org");
		await admin.request("PATCH", `/admin/organizations/${org.id}`, { aiMonthlyBudgetUsd: 7 });

		const res = await admin.request("GET", "/admin/audit?limit=1");
		expect(res.status).toBe(200);
		expect(res.json.items).toEqual([
			{
				id: expect.any(String),
				actorUserId: adminUserId,
				actorEmail: adminEmail,
				action: "organization.ai_budget.update",
				targetType: "organization",
				targetId: org.id,
				data: { before: null, after: 7 },
				createdAt: expect.any(String),
			},
		]);
		expect(res.json.nextCursor).toBe(res.json.items[0].id);
		const older = await admin.request("GET", `/admin/audit?limit=1&before=${res.json.nextCursor}`);
		expect(older.json.items[0].id < res.json.items[0].id).toBe(true);
	});
});
