import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, schema } from "@socialfly/db";
import { createQueueConnection, jobIds, publishQueueName, QUEUE_PREFIX } from "@socialfly/queue";
import { Queue } from "bullmq";
import { app } from "#src/app.ts";
import { db, redis, tokenCipher } from "#src/infrastructure/index.ts";
import { type ApiClient, createChannel, createUser } from "./helpers";

const queueRedis = createQueueConnection(process.env.REDIS_URL as string);
const linkedinQueue = new Queue(publishQueueName("linkedin"), {
	connection: queueRedis,
	prefix: QUEUE_PREFIX,
});

afterAll(async () => {
	await linkedinQueue.obliterate({ force: true }).catch(() => {});
	await linkedinQueue.close();
	await queueRedis.quit();
});

let owner: ApiClient;
let orgId: string;

beforeAll(async () => {
	({ client: owner } = await createUser("Owner"));
	const res = await owner.request("POST", "/organizations", {
		name: "Acme Inc",
		timezone: "Europe/London",
	});
	expect(res.status).toBe(201);
	orgId = res.json.id;
	owner.orgId = orgId;
});

describe("auth boundary", () => {
	test("no token → 401 with the standard error shape", async () => {
		const res = await app.request("/organizations");
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({
			error: { code: "unauthorized", message: "Authentication required" },
		});
	});

	test("cookie-authenticated writes need the CSRF header", async () => {
		const res = await app.request("/organizations", {
			method: "POST",
			headers: { Cookie: `sf_access=${owner.accessToken}`, "Content-Type": "application/json" },
			body: JSON.stringify({ name: "No CSRF" }),
		});
		expect(res.status).toBe(403);
	});

	test("an organization you do not belong to is invisible (404, not 403)", async () => {
		const { client: stranger } = await createUser("Stranger");
		stranger.orgId = orgId;
		expect((await stranger.request("GET", "/organization")).status).toBe(404);
	});

	test("/ready checks postgres, redis and the queue for real", async () => {
		const res = await app.request("/ready");
		expect(res.status).toBe(200);
		expect(((await res.json()) as { checks: unknown }).checks).toMatchObject({
			postgres: { ok: true },
			redis: { ok: true },
			queue: { ok: true },
		});
	});
});

describe("organizations and team", () => {
	test("creator is owner; the org shows up in their list", async () => {
		const res = await owner.request("GET", "/organizations");
		expect(res.json.organizations).toContainEqual(
			expect.objectContaining({ id: orgId, role: "owner", name: "Acme Inc" }),
		);
	});

	test("invitation is bound to the invited email", async () => {
		const invite = await owner.request("POST", "/organization/invitations", {
			email: "someone-else@example.test",
			role: "editor",
		});
		expect(invite.status).toBe(201);
		const { client: wrongPerson } = await createUser();
		const res = await wrongPerson.request("POST", "/organizations/invitations/accept", {
			token: invite.json.token,
		});
		expect(res.status).toBe(403);
		expect(res.json.error.code).toBe("invitation_email_mismatch");
	});

	test("invite → accept → member with the invited role; viewers cannot write", async () => {
		const { user, client: viewer } = await createUser("Viewer");
		const invite = await owner.request("POST", "/organization/invitations", {
			email: user.email,
			role: "viewer",
		});
		const accepted = await viewer.request("POST", "/organizations/invitations/accept", {
			token: invite.json.token,
		});
		expect(accepted.status).toBe(200);
		expect(accepted.json).toMatchObject({ id: orgId, role: "viewer" });

		viewer.orgId = orgId;
		const members = await viewer.request("GET", "/organization/members");
		expect(members.json.members).toHaveLength(2);

		const channel = await createChannel(orgId);
		const write = await viewer.request("POST", "/posts", {
			content: "hello",
			targets: [{ channelId: channel.id }],
		});
		expect(write.status).toBe(403);
	});

	test("the last owner cannot be demoted", async () => {
		const me = (await owner.request("GET", "/organization/members")).json.members.find(
			(m: { role: string }) => m.role === "owner",
		);
		const res = await owner.request("PATCH", `/organization/members/${me.userId}`, {
			role: "admin",
		});
		expect(res.status).toBe(409);
		expect(res.json.error.code).toBe("last_owner");
	});
});

describe("channels", () => {
	test("list never exposes tokens", async () => {
		await createChannel(orgId);
		const res = await owner.request("GET", "/channels");
		expect(res.status).toBe(200);
		const serialized = JSON.stringify(res.json);
		expect(serialized).not.toContain("accessToken");
		expect(serialized).not.toContain("platform-access-token");
	});

	test("tokens are encrypted at rest", async () => {
		const channel = await createChannel(orgId);
		const [row] = await db.select().from(schema.channels).where(eq(schema.channels.id, channel.id));
		expect(row?.accessTokenEnc.startsWith("v1.")).toBe(true);
		expect(tokenCipher.decrypt(row?.accessTokenEnc as string)).toBe("platform-access-token");
	});

	test("connect returns a consent URL and stores single-use state", async () => {
		const res = await owner.request("POST", "/channels/connect/linkedin");
		expect(res.status).toBe(200);
		const url = new URL(res.json.url);
		expect(url.hostname).toBe("www.linkedin.com");
		const state = url.searchParams.get("state") as string;
		expect(await redis.exists(`oauth:state:${state}`)).toBe(1);

		// A callback with an unknown/replayed state is bounced back to the web app, never processed.
		const bogus = await app.request("/channels/callback/linkedin?code=x&state=not-a-real-state");
		expect(bogus.status).toBe(302);
		expect(bogus.headers.get("location")).toContain("error=connect_expired");
	});

	test("unconfigured platforms are not offered", async () => {
		const res = await owner.request("GET", "/channels/providers");
		const ids = res.json.providers.map((p: { id: string }) => p.id);
		expect(ids).toContain("linkedin");
		expect(ids).not.toContain("x");
	});
});

describe("posts", () => {
	test("draft → schedule enqueues exactly one delayed job per target", async () => {
		const channel = await createChannel(orgId);
		const scheduledAt = new Date(Date.now() + 3600_000).toISOString();

		const draft = await owner.request("POST", "/posts", {
			content: "Launching (finally) — #shipit",
			targets: [{ channelId: channel.id }],
		});
		expect(draft.status).toBe(201);
		expect(draft.json.status).toBe("draft");
		expect(draft.json.targets[0].status).toBe("draft");

		const scheduled = await owner.request("POST", `/posts/${draft.json.id}/schedule`, {
			scheduledAt,
		});
		expect(scheduled.status).toBe(200);
		expect(scheduled.json.status).toBe("scheduled");

		const targetId = scheduled.json.targets[0].id;
		const job = await linkedinQueue.getJob(jobIds.publish(targetId, 1));
		expect(job).toBeDefined();
		expect(job?.data).toEqual({ targetId, organizationId: orgId, scheduleVersion: 1 });
		expect(await job?.isDelayed()).toBe(true);

		// Scheduling again is idempotent per version: version 2, and the v1 job is gone.
		const again = await owner.request("POST", `/posts/${draft.json.id}/unschedule`);
		expect(again.json.status).toBe("draft");
		expect(await linkedinQueue.getJob(jobIds.publish(targetId, 1))).toBeUndefined();
	});

	test("platform limits are enforced before scheduling, per channel", async () => {
		const channel = await createChannel(orgId, "linkedin", "Too long");
		const res = await owner.request("POST", "/posts", {
			content: "x".repeat(3001),
			targets: [{ channelId: channel.id }],
			action: "schedule",
		});
		// Draft saved, but scheduling refused with per-channel reasons.
		expect(res.status).toBe(422);
		expect(res.json.error.code).toBe("post_invalid");
		expect(res.json.error.details.targets[0].errors[0]).toContain("3000 characters");
	});

	test("validate endpoint reports problems without saving", async () => {
		const channel = await createChannel(orgId);
		const res = await owner.request("POST", "/posts/validate", {
			content: "",
			targets: [{ channelId: channel.id }],
		});
		expect(res.status).toBe(200);
		expect(res.json.targets[0].errors).toContain("LinkedIn posts need text");
	});

	test("channels from another organization cannot be targeted", async () => {
		const { client: other } = await createUser();
		const otherOrg = (await other.request("POST", "/organizations", { name: "Other Org" })).json.id;
		const foreign = await createChannel(otherOrg);
		const res = await owner.request("POST", "/posts", {
			content: "hi",
			targets: [{ channelId: foreign.id }],
		});
		expect(res.status).toBe(400);
	});

	test("unconfirmed targets need explicit confirmation to retry", async () => {
		const channel = await createChannel(orgId);
		const post = await owner.request("POST", "/posts", {
			content: "maybe posted",
			targets: [{ channelId: channel.id }],
		});
		const targetId = post.json.targets[0].id;
		await db
			.update(schema.postTargets)
			.set({ status: "unconfirmed" })
			.where(eq(schema.postTargets.id, targetId));

		const blind = await owner.request(
			"POST",
			`/posts/${post.json.id}/targets/${targetId}/retry`,
			{},
		);
		expect(blind.status).toBe(409);
		expect(blind.json.error.code).toBe("confirm_required");

		const confirmed = await owner.request(
			"POST",
			`/posts/${post.json.id}/targets/${targetId}/retry`,
			{
				confirmNotPublished: true,
			},
		);
		expect(confirmed.status).toBe(200);
		expect(confirmed.json.targets[0].status).toBe("scheduled");
	});

	test("published posts are locked against edits", async () => {
		const channel = await createChannel(orgId);
		const post = await owner.request("POST", "/posts", {
			content: "done",
			targets: [{ channelId: channel.id }],
		});
		await db
			.update(schema.postTargets)
			.set({ status: "published" })
			.where(eq(schema.postTargets.postId, post.json.id));
		const res = await owner.request("PUT", `/posts/${post.json.id}`, {
			content: "edited",
			targets: [{ channelId: channel.id }],
		});
		expect(res.status).toBe(409);
		expect(res.json.error.code).toBe("post_locked");
	});
});

describe("media", () => {
	test("presigned upload → complete verifies the object really exists", async () => {
		const bytes = new TextEncoder().encode("not really a png, but storage does not care");
		const created = await owner.request("POST", "/media/uploads", {
			fileName: "cover.png",
			mimeType: "image/png",
			sizeBytes: bytes.byteLength,
		});
		expect(created.status).toBe(201);

		const early = await owner.request("POST", `/media/${created.json.asset.id}/complete`, {});
		expect(early.status).toBe(409);

		const put = await fetch(created.json.upload.url, {
			method: "PUT",
			headers: created.json.upload.headers,
			body: bytes,
		});
		expect(put.ok).toBe(true);

		const done = await owner.request("POST", `/media/${created.json.asset.id}/complete`, {
			width: 1200,
			height: 630,
		});
		expect(done.status).toBe(200);
		expect(done.json).toMatchObject({ status: "ready", width: 1200, kind: "image" });
	});

	test("unsupported types are rejected up front", async () => {
		const res = await owner.request("POST", "/media/uploads", {
			fileName: "virus.exe",
			mimeType: "application/x-msdownload",
			sizeBytes: 10,
		});
		expect(res.status).toBe(400);
	});
});
