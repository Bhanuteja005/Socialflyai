import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { AiError } from "@socialfly/ai";
import { FakeImageModel, FakeSpeechModel, FakeTextModel } from "@socialfly/ai/testing";
import { eq, schema } from "@socialfly/db";
import { createQueueConnection, jobIds, QUEUE_PREFIX, QUEUES } from "@socialfly/queue";
import { Queue } from "bullmq";
import { ai, db } from "#src/infrastructure/index.ts";
import { type ApiClient, createUser } from "./helpers";

const queueRedis = createQueueConnection(process.env.REDIS_URL as string);
const aiMediaQueue = new Queue(QUEUES.aiMedia, { connection: queueRedis, prefix: QUEUE_PREFIX });

afterAll(async () => {
	await aiMediaQueue.obliterate({ force: true }).catch(() => {});
	await aiMediaQueue.close();
	await queueRedis.quit();
});

/** A fresh org per scenario: budgets and histories are per organization, so tests stay independent. */
async function newOrg(name = "AI Co") {
	const { user, client } = await createUser("Owner");
	const res = await client.request("POST", "/organizations", { name });
	expect(res.status).toBe(201);
	client.orgId = res.json.id;
	return { user, client, orgId: res.json.id as string };
}

async function addViewer(owner: ApiClient, orgId: string) {
	const { user, client } = await createUser("Viewer");
	const invite = await owner.request("POST", "/organization/invitations", {
		email: user.email,
		role: "viewer",
	});
	await client.request("POST", "/organizations/invitations/accept", { token: invite.json.token });
	client.orgId = orgId;
	return client;
}

const postsReply = {
	variants: [
		{
			angle: "Story",
			drafts: [
				{ platform: "linkedin", text: "We shipped rockets.", hashtags: ["#Space", "rockets"] },
			],
		},
	],
};

let text: FakeTextModel;
let images: FakeImageModel;

beforeEach(() => {
	text = new FakeTextModel();
	images = new FakeImageModel();
	ai.text = text;
	ai.images = images;
	ai.speech = new FakeSpeechModel();
});

describe("capabilities", () => {
	test("reports configured models and this month's budget", async () => {
		const { client } = await newOrg();
		const res = await client.request("GET", "/ai/capabilities");
		expect(res.status).toBe(200);
		expect(res.json).toMatchObject({
			text: true,
			images: true,
			carousels: true,
			videos: true,
			voiceover: true,
			budget: { limitUsd: 25, usedUsd: 0, remainingUsd: 25 },
		});
		const start = new Date(res.json.budget.periodStart);
		expect(start.getUTCDate()).toBe(1);
		expect(start.getUTCHours()).toBe(0);
	});

	test("without keys, text and images are off but carousels still work", async () => {
		ai.text = null;
		ai.images = null;
		ai.speech = null;
		const { client } = await newOrg();
		const res = await client.request("GET", "/ai/capabilities");
		expect(res.json).toMatchObject({
			text: false,
			images: false,
			carousels: true,
			videos: true,
			voiceover: false,
		});
	});
});

describe("brand profile", () => {
	test("defaults → save → read back; viewers cannot save", async () => {
		const { client, orgId } = await newOrg();
		const empty = await client.request("GET", "/ai/brand");
		expect(empty.status).toBe(200);
		expect(empty.json).toMatchObject({
			brandName: "",
			website: null,
			keywords: [],
			examplePosts: [],
			updatedAt: null,
		});

		const saved = await client.request("PUT", "/ai/brand", {
			brandName: "Acme Rockets",
			voice: "confident, no jargon",
			website: "https://acme.test",
			keywords: ["space", "launches"],
		});
		expect(saved.status).toBe(200);
		expect(saved.json).toMatchObject({ brandName: "Acme Rockets", website: "https://acme.test" });

		const again = await client.request("GET", "/ai/brand");
		expect(again.json).toMatchObject({
			brandName: "Acme Rockets",
			voice: "confident, no jargon",
			keywords: ["space", "launches"],
			avoid: [],
		});
		expect(again.json.updatedAt).not.toBeNull();

		const tooMany = await client.request("PUT", "/ai/brand", {
			keywords: Array.from({ length: 31 }, (_, i) => `k${i}`),
		});
		expect(tooMany.status).toBe(422);

		const viewer = await addViewer(client, orgId);
		expect((await viewer.request("GET", "/ai/brand")).status).toBe(200);
		expect((await viewer.request("PUT", "/ai/brand", { brandName: "Nope" })).status).toBe(403);
		const gen = await viewer.request("POST", "/ai/posts", {
			brief: "anything",
			platforms: ["linkedin"],
		});
		expect(gen.status).toBe(403);
	});
});

describe("text generation", () => {
	test("posts: brand goes into the prompt; a succeeded generation is recorded with its cost", async () => {
		const { client, orgId } = await newOrg();
		await client.request("PUT", "/ai/brand", { brandName: "Acme Rockets" });
		text.reply(postsReply);

		const res = await client.request("POST", "/ai/posts", {
			brief: "We launched our first reusable rocket",
			platforms: ["linkedin"],
			variants: 1,
		});
		expect(res.status).toBe(200);
		expect(res.json.model).toBe("fake:text");
		expect(res.json.variants[0].drafts[0]).toEqual({
			platform: "linkedin",
			text: "We shipped rockets.",
			hashtags: ["#Space", "#rockets"],
		});
		expect(text.requests[0]?.prompt).toContain("Acme Rockets");

		const [row] = await db
			.select()
			.from(schema.aiGenerations)
			.where(eq(schema.aiGenerations.id, res.json.generationId));
		expect(row).toMatchObject({
			organizationId: orgId,
			kind: "post",
			status: "succeeded",
			costMicros: 17_500,
			inputTokens: 1000,
			outputTokens: 500,
		});
		// Defaults from the task schema are stored, so history shows what was really asked.
		expect(row?.input).toMatchObject({ includeHashtags: true, language: "English" });

		const caps = await client.request("GET", "/ai/capabilities");
		expect(caps.json.budget.usedUsd).toBeCloseTo(0.0175);

		const detail = await client.request("GET", `/ai/generations/${res.json.generationId}`);
		expect(detail.json).toMatchObject({
			kind: "post",
			status: "succeeded",
			costUsd: 0.0175,
			error: null,
		});
	});

	test("rewrite, hashtags and carousel outline", async () => {
		const { client } = await newOrg();
		text.reply({ text: "Shorter." });
		const rw = await client.request("POST", "/ai/rewrite", {
			text: "A long draft",
			action: "shorter",
		});
		expect(rw.status).toBe(200);
		expect(rw.json.text).toBe("Shorter.");

		const custom = await client.request("POST", "/ai/rewrite", { text: "x", action: "custom" });
		expect(custom.status).toBe(422);

		text.reply({ hashtags: ["growth", "#Marketing", "growth"] });
		const tags = await client.request("POST", "/ai/hashtags", { text: "A post about growth" });
		expect(tags.json.hashtags).toEqual(["#growth", "#Marketing"]);

		text.reply({
			slides: [
				{ heading: "Cover", body: "" },
				{ heading: "Idea", body: "Body" },
				{ heading: "Follow us", body: "" },
			],
			caption: "Swipe through",
			hashtags: ["tips"],
		});
		const outline = await client.request("POST", "/ai/carousels/outline", {
			topic: "Three tips",
			slideCount: 3,
		});
		expect(outline.status).toBe(200);
		expect(outline.json.slides).toHaveLength(3);
		expect(outline.json).toMatchObject({ caption: "Swipe through", hashtags: ["#tips"] });
		expect(outline.json.generationId).toBeString();
	});

	test("a refusal is a 422 and leaves a failed generation", async () => {
		const { client, orgId } = await newOrg();
		text.reply(new AiError("refused", "model declined"));
		const res = await client.request("POST", "/ai/posts", {
			brief: "Something the model refuses",
			platforms: ["linkedin"],
		});
		expect(res.status).toBe(422);
		expect(res.json.error.code).toBe("ai_refused");

		const rows = await db
			.select()
			.from(schema.aiGenerations)
			.where(eq(schema.aiGenerations.organizationId, orgId));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ status: "failed", errorCode: "refused", costMicros: 0 });
	});

	test("provider throttling is a 429 with retryAfterSeconds", async () => {
		const { client } = await newOrg();
		text.reply(new AiError("rate_limited", "slow down", { retryAfterSeconds: 30 }));
		const res = await client.request("POST", "/ai/hashtags", { text: "A post" });
		expect(res.status).toBe(429);
		expect(res.json.error).toMatchObject({
			code: "ai_rate_limited",
			details: { retryAfterSeconds: 30 },
		});
	});

	test("an exhausted monthly budget blocks the call before the model is asked", async () => {
		const { client, orgId } = await newOrg();
		await db.insert(schema.aiGenerations).values({
			organizationId: orgId,
			kind: "image",
			status: "succeeded",
			costMicros: 26_000_000,
		});
		const res = await client.request("POST", "/ai/posts", {
			brief: "Hello",
			platforms: ["linkedin"],
		});
		expect(res.status).toBe(429);
		expect(res.json.error.code).toBe("ai_budget_exceeded");
		expect(res.json.error.message).toContain("$25");
		expect(text.requests).toHaveLength(0);

		const img = await client.request("POST", "/ai/images", { prompt: "A rocket at dawn" });
		expect(img.status).toBe(429);

		const caps = await client.request("GET", "/ai/capabilities");
		expect(caps.json.budget).toMatchObject({ usedUsd: 26, remainingUsd: 0 });
	});

	test("a per-organization budget override replaces the server default (0 = unlimited)", async () => {
		const { client, orgId } = await newOrg();
		const setOverride = (usd: number | null) =>
			db
				.update(schema.organizations)
				.set({ aiMonthlyBudgetUsd: usd })
				.where(eq(schema.organizations.id, orgId));
		await db.insert(schema.aiGenerations).values({
			organizationId: orgId,
			kind: "image",
			status: "succeeded",
			costMicros: 3_000_000,
		});
		const generate = () =>
			client.request("POST", "/ai/posts", { brief: "Hello", platforms: ["linkedin"] });

		// Lower than the default: $3 spent reaches a $2.50 limit.
		await setOverride(2.5);
		const blocked = await generate();
		expect(blocked.status).toBe(429);
		expect(blocked.json.error.details).toEqual({ limitUsd: 2.5, usedUsd: 3 });
		expect(text.requests).toHaveLength(0);
		expect((await client.request("GET", "/ai/capabilities")).json.budget).toMatchObject({
			limitUsd: 2.5,
			usedUsd: 3,
			remainingUsd: 0,
		});

		// 0 = unlimited, even far past the server default of $25.
		await setOverride(0);
		await db.insert(schema.aiGenerations).values({
			organizationId: orgId,
			kind: "image",
			status: "succeeded",
			costMicros: 100_000_000,
		});
		text.reply(postsReply);
		expect((await generate()).status).toBe(200);
		expect((await client.request("GET", "/ai/capabilities")).json.budget).toMatchObject({
			limitUsd: null,
			remainingUsd: null,
		});

		// Cleared: back to the server default, which $103 exceeds.
		await setOverride(null);
		expect((await generate()).status).toBe(429);
		expect((await client.request("GET", "/ai/capabilities")).json.budget).toMatchObject({
			limitUsd: 25,
		});
	});

	test("the budget only counts this organization's spend", async () => {
		const other = await newOrg("Big Spender");
		await db.insert(schema.aiGenerations).values({
			organizationId: other.orgId,
			kind: "image",
			status: "succeeded",
			costMicros: 30_000_000,
		});
		const { client } = await newOrg();
		const caps = await client.request("GET", "/ai/capabilities");
		expect(caps.json.budget).toMatchObject({ usedUsd: 0, remainingUsd: 25 });
	});

	test("no text model configured → 503", async () => {
		ai.text = null;
		const { client } = await newOrg();
		const res = await client.request("POST", "/ai/posts", {
			brief: "Hello",
			platforms: ["linkedin"],
		});
		expect(res.status).toBe(503);
		expect(res.json.error.code).toBe("ai_not_configured");
	});
});

describe("media generation", () => {
	test("image: 202 pending, one job keyed by the generation id", async () => {
		const { client, orgId } = await newOrg();
		const res = await client.request("POST", "/ai/images", {
			prompt: "A rocket at dawn",
			aspectRatio: "4:5",
		});
		expect(res.status).toBe(202);
		expect(res.json).toMatchObject({
			kind: "image",
			status: "pending",
			input: { prompt: "A rocket at dawn", aspectRatio: "4:5" },
			media: [],
			error: null,
			completedAt: null,
		});

		const job = await aiMediaQueue.getJob(jobIds.aiMedia(res.json.id));
		expect(job?.data).toEqual({ generationId: res.json.id, organizationId: orgId });
	});

	test("image without an image model → 503", async () => {
		ai.images = null;
		const { client } = await newOrg();
		const res = await client.request("POST", "/ai/images", { prompt: "A rocket" });
		expect(res.status).toBe(503);
		expect(res.json.error.code).toBe("ai_not_configured");
	});

	test("carousel: needs no provider; theme defaults; a finished generation returns its media in order", async () => {
		ai.text = null;
		ai.images = null;
		const { client, orgId } = await newOrg();
		const res = await client.request("POST", "/ai/carousels", {
			slides: [{ heading: "One" }, { heading: "Two", body: "Second" }],
		});
		expect(res.status).toBe(202);
		expect(res.json).toMatchObject({ kind: "carousel", status: "pending" });
		expect(res.json.input).toMatchObject({ theme: "midnight" });
		expect(await aiMediaQueue.getJob(jobIds.aiMedia(res.json.id))).toBeDefined();

		const bad = await client.request("POST", "/ai/carousels", { slides: [{ heading: "Only" }] });
		expect(bad.status).toBe(422);

		// Simulate the worker finishing: two slides, stored out of id order on purpose.
		const [a, b] = await db
			.insert(schema.mediaAssets)
			.values(
				["slide-1.png", "slide-2.png"].map((fileName) => ({
					organizationId: orgId,
					storageKey: `orgs/${orgId}/ai/${fileName}`,
					fileName,
					mimeType: "image/png",
					kind: "image" as const,
					sizeBytes: 10,
					source: "ai" as const,
					status: "ready" as const,
				})),
			)
			.returning();
		await db
			.update(schema.aiGenerations)
			.set({
				status: "succeeded",
				mediaIds: [b?.id as string, a?.id as string],
				completedAt: new Date(),
			})
			.where(eq(schema.aiGenerations.id, res.json.id));

		const done = await client.request("GET", `/ai/generations/${res.json.id}`);
		expect(done.json.status).toBe("succeeded");
		expect(done.json.media.map((m: { fileName: string }) => m.fileName)).toEqual([
			"slide-2.png",
			"slide-1.png",
		]);
		expect(done.json.media[0].source).toBe("ai");
	});
});

describe("short videos", () => {
	const scenes = [
		{
			caption: "Stop scrolling",
			narration: "Here is a tip.",
			visual: "a desk",
			durationSeconds: 3,
		},
		{ caption: "Follow for more", narration: "", visual: "a phone", durationSeconds: 3 },
	];
	const noVoice = { enabled: false, voice: "alloy" };

	test("script: scenes, caption and hashtags from the text model, recorded as video_script", async () => {
		const { client, orgId } = await newOrg();
		await client.request("PUT", "/ai/brand", { brandName: "Acme Rockets" });
		text.reply({
			title: "Rocket tips",
			scenes: scenes.map((s) => ({ ...s, durationSeconds: 5 })),
			caption: "Watch till the end",
			hashtags: ["rockets", "#Space"],
		});

		const res = await client.request("POST", "/ai/videos/script", {
			topic: "Three rocket facts",
			durationSeconds: 10,
		});
		expect(res.status).toBe(200);
		expect(res.json).toMatchObject({
			title: "Rocket tips",
			hashtags: ["#rockets", "#Space"],
		});
		expect(res.json.scenes).toHaveLength(2);
		expect(res.json.scenes[0]).toMatchObject({ caption: "Stop scrolling", durationSeconds: 5 });
		expect(res.json.caption).toContain("Watch till the end");
		expect(text.requests[0]?.prompt).toContain("Acme Rockets");

		const [row] = await db
			.select()
			.from(schema.aiGenerations)
			.where(eq(schema.aiGenerations.id, res.json.generationId));
		expect(row).toMatchObject({ organizationId: orgId, kind: "video_script", status: "succeeded" });
		expect(row?.input).toMatchObject({ platform: "instagram", voiceover: true });

		expect(
			(await client.request("POST", "/ai/videos/script", { topic: "x", durationSeconds: 5 }))
				.status,
		).toBe(422);
	});

	test("render: 202 pending with defaults, one job keyed by the generation id", async () => {
		const { client, orgId } = await newOrg();
		const res = await client.request("POST", "/ai/videos", {
			scenes,
			voiceover: { enabled: true, voice: "coral" },
		});
		expect(res.status).toBe(202);
		expect(res.json).toMatchObject({ kind: "video", status: "pending", media: [], error: null });
		expect(res.json.input).toMatchObject({
			background: "theme",
			theme: "midnight",
			voiceover: { enabled: true, voice: "coral" },
		});
		const job = await aiMediaQueue.getJob(jobIds.aiMedia(res.json.id));
		expect(job?.data).toEqual({ generationId: res.json.id, organizationId: orgId });
	});

	test("render: a theme-only video with no voice needs no provider", async () => {
		ai.text = null;
		ai.images = null;
		ai.speech = null;
		const { client } = await newOrg();
		const res = await client.request("POST", "/ai/videos", { scenes, voiceover: noVoice });
		expect(res.status).toBe(202);
	});

	test("render: AI backgrounds or voiceover without their provider → 503", async () => {
		const { client } = await newOrg();
		ai.images = null;
		const noImages = await client.request("POST", "/ai/videos", {
			scenes,
			background: "ai",
			voiceover: noVoice,
		});
		expect(noImages.status).toBe(503);
		expect(noImages.json.error.code).toBe("ai_not_configured");

		ai.images = images;
		ai.speech = null;
		const noSpeech = await client.request("POST", "/ai/videos", {
			scenes,
			voiceover: { enabled: true, voice: "alloy" },
		});
		expect(noSpeech.status).toBe(503);
		expect(noSpeech.json.error.code).toBe("ai_not_configured");
	});

	test("render: validation — scene count, total length, voice, extra scene media", async () => {
		const { client } = await newOrg();
		const post = (body: Record<string, unknown>) =>
			client.request("POST", "/ai/videos", { scenes, voiceover: noVoice, ...body });
		expect((await post({ scenes: [] })).status).toBe(422);
		expect((await post({ scenes: Array.from({ length: 13 }, () => scenes[0]) })).status).toBe(422);
		// 9 × 15 s = 135 s > 120 s.
		const long = await post({
			scenes: Array.from({ length: 9 }, () => ({ ...scenes[0], durationSeconds: 15 })),
		});
		expect(long.status).toBe(422);
		expect((await post({ voiceover: { enabled: true, voice: "robot" } })).status).toBe(422);
		expect((await post({ theme: "neon-nope" })).status).toBe(422);
		expect((await post({ sceneMediaIds: [null, null, crypto.randomUUID()] })).status).toBe(422);
	});

	test("render: scene media must be the org's own ready images", async () => {
		const { client, orgId } = await newOrg();
		const other = await newOrg("Other");
		const media = (
			organizationId: string,
			kind: "image" | "video",
			status: "ready" | "pending_upload",
		) =>
			db
				.insert(schema.mediaAssets)
				.values({
					organizationId,
					storageKey: `orgs/${organizationId}/media/${crypto.randomUUID()}/f`,
					fileName: "f",
					mimeType: kind === "image" ? "image/png" : "video/mp4",
					kind,
					sizeBytes: 10,
					status,
				})
				.returning()
				.then((rows) => rows[0]?.id as string);
		const post = (id: string) =>
			client.request("POST", "/ai/videos", {
				scenes,
				background: "ai",
				sceneMediaIds: [id],
				voiceover: noVoice,
			});

		const foreign = await post(await media(other.orgId, "image", "ready"));
		expect(foreign.status).toBe(404);
		expect((await post(await media(orgId, "video", "ready"))).status).toBe(422);
		expect((await post(await media(orgId, "image", "pending_upload"))).status).toBe(422);

		const ok = await post(await media(orgId, "image", "ready"));
		expect(ok.status).toBe(202);
	});

	test("render: paid steps are budget-checked; a theme-only video is not", async () => {
		const { client, orgId } = await newOrg();
		await db.insert(schema.aiGenerations).values({
			organizationId: orgId,
			kind: "image",
			status: "succeeded",
			costMicros: 26_000_000,
		});
		const post = (body: Record<string, unknown>) =>
			client.request("POST", "/ai/videos", { scenes, voiceover: noVoice, ...body });
		expect((await post({ background: "ai" })).json.error.code).toBe("ai_budget_exceeded");
		expect((await post({ voiceover: { enabled: true, voice: "alloy" } })).json.error.code).toBe(
			"ai_budget_exceeded",
		);
		expect((await post({})).status).toBe(202);
	});
});

describe("generation history", () => {
	test("another organization's generation is a 404", async () => {
		const { client } = await newOrg();
		const other = await newOrg("Other");
		const img = await other.client.request("POST", "/ai/images", { prompt: "Theirs" });
		expect((await client.request("GET", `/ai/generations/${img.json.id}`)).status).toBe(404);
	});

	test("list is newest first, filterable by kind, and pages with a cursor", async () => {
		const { client, orgId } = await newOrg();
		await db.insert(schema.aiGenerations).values(
			Array.from({ length: 5 }, (_, i) => ({
				organizationId: orgId,
				kind: i % 2 ? ("rewrite" as const) : ("hashtags" as const),
				status: "succeeded" as const,
			})),
		);

		const first = await client.request("GET", "/ai/generations?limit=2");
		expect(first.status).toBe(200);
		expect(first.json.items).toHaveLength(2);
		expect(first.json.nextCursor).toBe(first.json.items[1].id);

		const second = await client.request(
			"GET",
			`/ai/generations?limit=2&before=${first.json.nextCursor}`,
		);
		const third = await client.request(
			"GET",
			`/ai/generations?limit=2&before=${second.json.nextCursor}`,
		);
		expect(third.json.items).toHaveLength(1);
		expect(third.json.nextCursor).toBeNull();
		const ids = [...first.json.items, ...second.json.items, ...third.json.items].map(
			(g: { id: string }) => g.id,
		);
		expect(new Set(ids).size).toBe(5);
		expect([...ids].sort().reverse()).toEqual(ids);

		const rewrites = await client.request("GET", "/ai/generations?kind=rewrite");
		expect(rewrites.json.items).toHaveLength(2);

		expect((await client.request("GET", "/ai/generations?limit=51")).status).toBe(422);
	});
});
