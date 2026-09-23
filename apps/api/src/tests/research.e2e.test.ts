import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { FakeTextModel } from "@socialfly/ai/testing";
import { eq, schema } from "@socialfly/db";
import { createQueueConnection, jobIds, QUEUE_PREFIX, QUEUES } from "@socialfly/queue";
import type { DataForSeo, KeywordMetric } from "@socialfly/research";
import { Queue } from "bullmq";
import { ai, db, researchTools } from "#src/infrastructure/index.ts";
import { type ApiClient, createUser } from "./helpers";

const queueRedis = createQueueConnection(process.env.REDIS_URL as string);
const researchQueue = new Queue(QUEUES.research, { connection: queueRedis, prefix: QUEUE_PREFIX });

afterAll(async () => {
	await researchQueue.obliterate({ force: true }).catch(() => {});
	await researchQueue.close();
	await queueRedis.quit();
});

class FakeSeo implements Pick<DataForSeo, "keywordIdeas"> {
	ideaCalls: { seeds: string[]; limit?: number }[] = [];
	fail: Error | null = null;
	async keywordIdeas(seeds: string[], opts: { limit?: number }) {
		this.ideaCalls.push({ seeds, limit: opts.limit });
		if (this.fail) throw this.fail;
		const items: KeywordMetric[] = [
			{ keyword: `${seeds[0]} pricing`, searchVolume: 900, difficulty: 30, cpcUsd: 2.5 },
			{ keyword: `best ${seeds[0]}`, searchVolume: null, difficulty: null, cpcUsd: null },
		];
		return { items, costMicros: 12_000 };
	}
}

let seo: FakeSeo;

beforeEach(() => {
	ai.text = new FakeTextModel();
	seo = new FakeSeo();
	researchTools.seo = seo;
	researchTools.visibilityEngines = [
		{ id: "chatgpt", model: "gpt-test" },
		{ id: "perplexity", model: "sonar" },
	];
});

async function newOrg(name = "Research Co") {
	const { user, client } = await createUser("Owner");
	const res = await client.request("POST", "/organizations", { name });
	expect(res.status).toBe(201);
	client.orgId = res.json.id;
	return { user, client, orgId: res.json.id as string };
}

async function addMember(owner: ApiClient, orgId: string, role: "viewer" | "editor") {
	const { user, client } = await createUser(role);
	const invite = await owner.request("POST", "/organization/invitations", {
		email: user.email,
		role,
	});
	await client.request("POST", "/organizations/invitations/accept", { token: invite.json.token });
	client.orgId = orgId;
	return client;
}

async function exhaustBudget(orgId: string, userId: string) {
	await db
		.update(schema.organizations)
		.set({ aiMonthlyBudgetUsd: 0.01 })
		.where(eq(schema.organizations.id, orgId));
	await db.insert(schema.aiGenerations).values({
		organizationId: orgId,
		userId,
		kind: "post",
		status: "succeeded",
		costMicros: 10_000,
	});
}

async function insertRun(
	orgId: string,
	values: Partial<typeof schema.researchRuns.$inferInsert> = {},
) {
	const [run] = await db
		.insert(schema.researchRuns)
		.values({ organizationId: orgId, startUrl: "https://acme.test/", ...values })
		.returning();
	return run as typeof schema.researchRuns.$inferSelect;
}

// ── capabilities ─────────────────────────────────────────────────────────────

describe("capabilities", () => {
	test("reports research, seo and the configured engines", async () => {
		const { client } = await newOrg();
		const res = await client.request("GET", "/research/capabilities");
		expect(res.status).toBe(200);
		expect(res.json).toEqual({
			research: true,
			seo: true,
			visibilityEngines: [
				{ id: "chatgpt", model: "gpt-test" },
				{ id: "perplexity", model: "sonar" },
			],
		});

		ai.text = null;
		researchTools.seo = null;
		researchTools.visibilityEngines = [];
		const off = await client.request("GET", "/research/capabilities");
		expect(off.json).toEqual({ research: false, seo: false, visibilityEngines: [] });
	});
});

// ── runs ─────────────────────────────────────────────────────────────────────

describe("research runs", () => {
	test("start from the brand website, enqueue once, refuse a second while active", async () => {
		const { client, orgId } = await newOrg();
		const none = await client.request("POST", "/research/runs", {});
		expect(none.status).toBe(422);
		expect(none.json.error.code).toBe("no_website");

		await client.request("PUT", "/ai/brand", { website: "https://acme.test/about" });
		const res = await client.request("POST", "/research/runs", {});
		expect(res.status).toBe(202);
		expect(res.json).toMatchObject({
			status: "pending",
			startUrl: "https://acme.test/about",
			pagesFound: 0,
			pagesCrawled: 0,
			insights: null,
			model: null,
			costUsd: 0,
			error: null,
			startedAt: null,
			completedAt: null,
		});
		const job = await researchQueue.getJob(jobIds.researchCrawl(res.json.id));
		expect(job?.data).toEqual({ task: "crawl", runId: res.json.id });

		const again = await client.request("POST", "/research/runs", { url: "https://other.test" });
		expect(again.status).toBe(409);
		expect(again.json.error).toMatchObject({
			code: "research_in_progress",
			details: { runId: res.json.id },
		});

		// Finished runs do not block a new one.
		await db
			.update(schema.researchRuns)
			.set({ status: "succeeded" })
			.where(eq(schema.researchRuns.organizationId, orgId));
		const next = await client.request("POST", "/research/runs", { url: "acme.test/blog#top" });
		expect(next.status).toBe(202);
		expect(next.json.startUrl).toBe("https://acme.test/blog");
	});

	test("rejects unusable URLs, a missing text model, an exhausted budget and viewers", async () => {
		const { user, client, orgId } = await newOrg();
		for (const url of ["localhost:3000", "ftp://acme.test", "http://10.0.0.1/admin", "not a url"]) {
			const res = await client.request("POST", "/research/runs", { url });
			expect(res.status).toBe(422);
			expect(res.json.error.code).toBe("invalid_url");
		}
		expect((await client.request("POST", "/research/runs", { url: "" })).status).toBe(422);

		const viewer = await addMember(client, orgId, "viewer");
		expect((await viewer.request("POST", "/research/runs", { url: "acme.test" })).status).toBe(403);

		ai.text = null;
		const off = await client.request("POST", "/research/runs", { url: "acme.test" });
		expect(off.status).toBe(503);
		expect(off.json.error.code).toBe("ai_not_configured");

		ai.text = new FakeTextModel();
		await exhaustBudget(orgId, user.id);
		const broke = await client.request("POST", "/research/runs", { url: "acme.test" });
		expect(broke.status).toBe(429);
		expect(broke.json.error.code).toBe("ai_budget_exceeded");
	});

	test("list, latest, one run and its pages; other organizations see nothing", async () => {
		const { client, orgId } = await newOrg();
		const empty = await client.request("GET", "/research/runs/latest");
		expect(empty.status).toBe(200);
		expect(empty.json).toBeNull();

		const good = await insertRun(orgId, {
			status: "succeeded",
			insights: { summary: "Rockets" },
			model: "fake:text",
			costMicros: 60_000,
			startedAt: new Date(),
			completedAt: new Date(),
			pagesCrawled: 3,
			pagesFound: 3,
		});
		const bad = await insertRun(orgId, {
			status: "failed",
			errorCode: "robots_disallowed",
			errorMessage: "robots.txt says no",
		});

		const latest = await client.request("GET", "/research/runs/latest");
		expect(latest.json).toMatchObject({
			id: good.id,
			status: "succeeded",
			insights: { summary: "Rockets" },
			costUsd: 0.06,
		});

		const list = await client.request("GET", "/research/runs?limit=1");
		expect(list.json.items.map((r: { id: string }) => r.id)).toEqual([bad.id]);
		expect((await client.request("GET", "/research/runs?limit=21")).status).toBe(422);

		const one = await client.request("GET", `/research/runs/${bad.id}`);
		expect(one.json.error).toEqual({ code: "robots_disallowed", message: "robots.txt says no" });

		await db.insert(schema.researchPages).values(
			["/", "/a", "/b"].map((path) => ({
				runId: good.id,
				organizationId: orgId,
				url: `https://acme.test${path}`,
				title: `Page ${path}`,
				statusCode: 200,
				wordCount: 10,
				text: "secret body text",
			})),
		);
		const first = await client.request("GET", `/research/runs/${good.id}/pages?limit=2`);
		expect(first.status).toBe(200);
		expect(first.json.items).toHaveLength(2);
		expect(first.json.items[0]).toEqual({
			id: expect.any(String),
			url: expect.stringMatching(/^https:\/\/acme\.test\//),
			title: expect.stringMatching(/^Page /),
			description: null,
			wordCount: 10,
			statusCode: 200,
		});
		const second = await client.request(
			"GET",
			`/research/runs/${good.id}/pages?limit=2&before=${first.json.nextCursor}`,
		);
		expect(second.json.items).toHaveLength(1);
		expect(second.json.nextCursor).toBeNull();
		const urls = [...first.json.items, ...second.json.items].map((p: { url: string }) => p.url);
		expect(urls.sort()).toEqual([
			"https://acme.test/",
			"https://acme.test/a",
			"https://acme.test/b",
		]);

		const viewer = await addMember(client, orgId, "viewer");
		expect((await viewer.request("GET", `/research/runs/${good.id}`)).status).toBe(200);

		const { client: stranger } = await newOrg("Other");
		expect((await stranger.request("GET", `/research/runs/${good.id}`)).status).toBe(404);
		expect((await stranger.request("GET", `/research/runs/${good.id}/pages`)).status).toBe(404);
		expect((await stranger.request("GET", "/research/runs/latest")).json).toBeNull();
		expect((await client.request("GET", "/research/runs/not-a-uuid")).status).toBe(422);
	});
});

// ── applying insights ────────────────────────────────────────────────────────

describe("apply insights", () => {
	test("adds picks, skipping duplicates and stopping prompts at the cap", async () => {
		const { client, orgId } = await newOrg();
		const run = await insertRun(orgId, { status: "succeeded", insights: {} });
		await db.insert(schema.competitors).values({ organizationId: orgId, name: "Orbitly" });
		await db
			.insert(schema.visibilityPrompts)
			.values(
				Array.from({ length: 23 }, (_, i) => ({ organizationId: orgId, prompt: `Existing ${i}?` })),
			);

		const res = await client.request("POST", "/research/insights/apply", {
			runId: run.id,
			buyerQuestions: [
				"existing 0?",
				"Who launches cubesats?",
				"Cheapest launch?",
				"One too many?",
			],
			competitors: [
				{ name: "orbitly" },
				{ name: "Rocketo", domain: "https://www.Rocketo.test/about" },
				{ name: "Rocketo" },
			],
			keywords: ["Rocket  Launch", "rocket launch", "cubesat"],
		});
		expect(res.status).toBe(200);
		expect(res.json).toEqual({ promptsAdded: 2, competitorsAdded: 1, keywordsAdded: 2 });

		const competitors = await client.request("GET", "/research/competitors");
		expect(competitors.json.items).toContainEqual(
			expect.objectContaining({ name: "Rocketo", domain: "rocketo.test", source: "ai" }),
		);
		const keywords = await client.request("GET", "/research/keywords");
		expect(keywords.json.items.map((k: { keyword: string }) => k.keyword).sort()).toEqual([
			"cubesat",
			"rocket launch",
		]);
		// SEO is configured, so the new keywords are measured right away.
		const counts = await researchQueue.getJobCounts("waiting", "delayed", "active");
		expect((counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.active ?? 0)).toBeGreaterThan(0);

		const again = await client.request("POST", "/research/insights/apply", {
			runId: run.id,
			buyerQuestions: ["Another one?"],
			keywords: ["cubesat"],
		});
		expect(again.json).toEqual({ promptsAdded: 0, competitorsAdded: 0, keywordsAdded: 0 });

		const viewer = await addMember(client, orgId, "viewer");
		expect(
			(await viewer.request("POST", "/research/insights/apply", { runId: run.id })).status,
		).toBe(403);
		const { client: stranger } = await newOrg("Other");
		expect(
			(await stranger.request("POST", "/research/insights/apply", { runId: run.id })).status,
		).toBe(404);
	});
});

// ── competitors ──────────────────────────────────────────────────────────────

describe("competitors", () => {
	test("create, reject duplicates, rename, delete; viewers read only; tenants isolated", async () => {
		const { client, orgId } = await newOrg();
		const created = await client.request("POST", "/research/competitors", {
			name: "Orbitly",
			domain: "https://www.orbitly.test/pricing",
			aliases: ["Orbitly Inc", "orbitly inc"],
		});
		expect(created.status).toBe(201);
		expect(created.json).toMatchObject({
			name: "Orbitly",
			domain: "orbitly.test",
			aliases: ["Orbitly Inc"],
			source: "user",
		});
		const id = created.json.id as string;

		const dupe = await client.request("POST", "/research/competitors", { name: "ORBITLY" });
		expect(dupe.status).toBe(409);
		expect(dupe.json.error.code).toBe("competitor_exists");
		expect((await client.request("POST", "/research/competitors", { name: "" })).status).toBe(422);

		const other = await client.request("POST", "/research/competitors", { name: "Rocketo" });
		const clash = await client.request("PATCH", `/research/competitors/${other.json.id}`, {
			name: "orbitly",
		});
		expect(clash.status).toBe(409);

		const renamed = await client.request("PATCH", `/research/competitors/${id}`, {
			name: "Orbitly Space",
			domain: null,
		});
		expect(renamed.status).toBe(200);
		expect(renamed.json).toMatchObject({ name: "Orbitly Space", domain: null });
		expect((await client.request("PATCH", `/research/competitors/${id}`, {})).status).toBe(422);

		const viewer = await addMember(client, orgId, "viewer");
		expect((await viewer.request("GET", "/research/competitors")).json.items).toHaveLength(2);
		expect((await viewer.request("POST", "/research/competitors", { name: "X" })).status).toBe(403);
		expect((await viewer.request("DELETE", `/research/competitors/${id}`)).status).toBe(403);

		const { client: stranger } = await newOrg("Other");
		expect(
			(await stranger.request("PATCH", `/research/competitors/${id}`, { name: "Mine" })).status,
		).toBe(404);
		expect((await stranger.request("DELETE", `/research/competitors/${id}`)).status).toBe(404);

		expect((await client.request("DELETE", `/research/competitors/${id}`)).status).toBe(204);
		expect((await client.request("DELETE", `/research/competitors/${id}`)).status).toBe(404);
	});
});

// ── keywords ─────────────────────────────────────────────────────────────────

describe("keywords", () => {
	test("add (normalised, de-duplicated), list with rankings, track, history, delete", async () => {
		const { client, orgId } = await newOrg();
		const added = await client.request("POST", "/research/keywords", {
			keywords: ["Rocket Launch", "rocket   launch", "cubesat"],
			tracked: true,
		});
		expect(added.status).toBe(201);
		expect(added.json).toEqual({ added: 2 });
		expect(
			(await client.request("POST", "/research/keywords", { keywords: ["cubesat"] })).json,
		).toEqual({ added: 0 });
		// Same keyword for another market is a separate row.
		expect(
			(
				await client.request("POST", "/research/keywords", {
					keywords: ["cubesat"],
					locationCode: 2826,
				})
			).json,
		).toEqual({ added: 1 });

		expect((await client.request("POST", "/research/keywords", { keywords: [] })).status).toBe(422);
		const tooMany = Array.from({ length: 51 }, (_, i) => `kw ${i}`);
		expect((await client.request("POST", "/research/keywords", { keywords: tooMany })).status).toBe(
			422,
		);

		const [kw] = await db
			.select()
			.from(schema.keywords)
			.where(eq(schema.keywords.keyword, "rocket launch"))
			.then((rows) => rows.filter((r) => r.organizationId === orgId));
		const id = kw?.id as string;
		await db
			.update(schema.keywords)
			.set({ searchVolume: 1200, difficulty: 35, cpcUsd: 1.5, metricsUpdatedAt: new Date() })
			.where(eq(schema.keywords.id, id));
		await db.insert(schema.keywordRankings).values([
			{ keywordId: id, day: "2026-09-01", position: 12, url: "https://acme.test/a" },
			{ keywordId: id, day: "2026-09-08", position: 9, url: "https://acme.test/a" },
			{ keywordId: id, day: "2026-09-15", position: null, url: null },
			{
				keywordId: id,
				day: new Date().toISOString().slice(0, 10),
				position: 7,
				url: "https://acme.test/b",
			},
		]);

		const list = await client.request("GET", "/research/keywords");
		expect(list.status).toBe(200);
		expect(list.json.items).toHaveLength(3);
		const row = list.json.items.find((k: { id: string }) => k.id === id);
		expect(row).toMatchObject({
			keyword: "rocket launch",
			locationCode: 2840,
			languageCode: "en",
			tracked: true,
			searchVolume: 1200,
			difficulty: 35,
			cpcUsd: 1.5,
			position: 7,
			previousPosition: null,
			rankedUrl: "https://acme.test/b",
		});
		expect(typeof row.rankCheckedAt).toBe("string");
		expect(typeof row.metricsUpdatedAt).toBe("string");
		const unranked = list.json.items.find(
			(k: { keyword: string; locationCode: number }) =>
				k.keyword === "cubesat" && k.locationCode === 2840,
		);
		expect(unranked).toMatchObject({
			position: null,
			previousPosition: null,
			rankedUrl: null,
			rankCheckedAt: null,
			searchVolume: null,
		});

		const history = await client.request("GET", `/research/keywords/${id}/rankings?days=365`);
		expect(history.json.days.map((d: { position: number | null }) => d.position)).toEqual([
			12,
			9,
			null,
			7,
		]);
		expect(history.json.days[0]).toEqual({
			date: "2026-09-01",
			position: 12,
			url: "https://acme.test/a",
		});
		const recent = await client.request("GET", `/research/keywords/${id}/rankings?days=1`);
		expect(recent.json.days).toHaveLength(1);
		expect((await client.request("GET", `/research/keywords/${id}/rankings?days=0`)).status).toBe(
			422,
		);

		const untracked = await client.request("PATCH", `/research/keywords/${id}`, {
			tracked: false,
		});
		expect(untracked.status).toBe(200);
		expect(untracked.json).toMatchObject({ id, tracked: false, position: 7 });

		const viewer = await addMember(client, orgId, "viewer");
		expect((await viewer.request("GET", "/research/keywords")).status).toBe(200);
		expect(
			(await viewer.request("PATCH", `/research/keywords/${id}`, { tracked: true })).status,
		).toBe(403);
		const { client: stranger } = await newOrg("Other");
		expect((await stranger.request("GET", `/research/keywords/${id}/rankings`)).status).toBe(404);
		expect((await stranger.request("DELETE", `/research/keywords/${id}`)).status).toBe(404);

		expect((await client.request("DELETE", `/research/keywords/${id}`)).status).toBe(204);
		const ranks = await db
			.select()
			.from(schema.keywordRankings)
			.where(eq(schema.keywordRankings.keywordId, id));
		expect(ranks).toHaveLength(0);
	});

	test("the previous position is the last check before the latest one", async () => {
		const { client, orgId } = await newOrg();
		await client.request("POST", "/research/keywords", { keywords: ["orbit"] });
		const [kw] = await db
			.select()
			.from(schema.keywords)
			.where(eq(schema.keywords.organizationId, orgId));
		await db.insert(schema.keywordRankings).values([
			{ keywordId: kw?.id as string, day: "2026-09-01", position: 12, url: null },
			{ keywordId: kw?.id as string, day: "2026-09-08", position: 9, url: "https://acme.test/" },
		]);
		const [row] = (await client.request("GET", "/research/keywords")).json.items;
		expect(row).toMatchObject({
			position: 9,
			previousPosition: 12,
			rankedUrl: "https://acme.test/",
		});
	});

	test("keyword ideas: synchronous, billed, budgeted; 503 without DataForSEO", async () => {
		const { user, client, orgId } = await newOrg();
		const res = await client.request("POST", "/research/keywords/ideas", {
			seeds: ["rocket launch"],
			limit: 10,
		});
		expect(res.status).toBe(200);
		expect(res.json.items).toEqual([
			{ keyword: "rocket launch pricing", searchVolume: 900, difficulty: 30, cpcUsd: 2.5 },
			{ keyword: "best rocket launch", searchVolume: null, difficulty: null, cpcUsd: null },
		]);
		expect(seo.ideaCalls).toEqual([{ seeds: ["rocket launch"], limit: 10 }]);
		const [bill] = await db
			.select()
			.from(schema.aiGenerations)
			.where(eq(schema.aiGenerations.organizationId, orgId));
		expect(bill).toMatchObject({ kind: "seo", status: "succeeded", costMicros: 12_000 });

		expect((await client.request("POST", "/research/keywords/ideas", { seeds: [] })).status).toBe(
			422,
		);
		expect(
			(
				await client.request("POST", "/research/keywords/ideas", {
					seeds: ["a", "b", "c", "d", "e", "f"],
				})
			).status,
		).toBe(422);

		const viewer = await addMember(client, orgId, "viewer");
		expect(
			(await viewer.request("POST", "/research/keywords/ideas", { seeds: ["x"] })).status,
		).toBe(403);

		researchTools.seo = null;
		const off = await client.request("POST", "/research/keywords/ideas", { seeds: ["x"] });
		expect(off.status).toBe(503);
		expect(off.json.error.code).toBe("seo_not_configured");

		researchTools.seo = seo;
		await exhaustBudget(orgId, user.id);
		const broke = await client.request("POST", "/research/keywords/ideas", { seeds: ["x"] });
		expect(broke.status).toBe(429);
		expect(broke.json.error.code).toBe("ai_budget_exceeded");
	});

	test("a provider failure is a 502 with a failed ledger row", async () => {
		const { client, orgId } = await newOrg();
		seo.fail = new Error("socket hang up");
		const res = await client.request("POST", "/research/keywords/ideas", { seeds: ["x"] });
		expect(res.status).toBe(502);
		expect(res.json.error.code).toBe("seo_unavailable");
		const [bill] = await db
			.select()
			.from(schema.aiGenerations)
			.where(eq(schema.aiGenerations.organizationId, orgId));
		expect(bill).toMatchObject({ kind: "seo", status: "failed", errorCode: "internal" });
	});
});

// ── visibility ───────────────────────────────────────────────────────────────

describe("visibility prompts", () => {
	test("create, reject duplicates and the 26th active prompt, pause/resume, delete", async () => {
		const { client, orgId } = await newOrg();
		const created = await client.request("POST", "/research/visibility/prompts", {
			prompt: "What is the best rocket company?",
		});
		expect(created.status).toBe(201);
		expect(created.json).toMatchObject({
			prompt: "What is the best rocket company?",
			active: true,
			lastCheckedAt: null,
			mentionRate: null,
		});
		const id = created.json.id as string;

		const dupe = await client.request("POST", "/research/visibility/prompts", {
			prompt: "what is the best  rocket company?",
		});
		expect(dupe.status).toBe(409);
		expect(dupe.json.error.code).toBe("prompt_exists");
		expect(
			(await client.request("POST", "/research/visibility/prompts", { prompt: "Hi" })).status,
		).toBe(422);
		expect(
			(await client.request("POST", "/research/visibility/prompts", { prompt: "x".repeat(501) }))
				.status,
		).toBe(422);

		await db
			.insert(schema.visibilityPrompts)
			.values(Array.from({ length: 24 }, (_, i) => ({ organizationId: orgId, prompt: `Q ${i}?` })));
		const full = await client.request("POST", "/research/visibility/prompts", {
			prompt: "One prompt too many?",
		});
		expect(full.status).toBe(409);
		expect(full.json.error.code).toBe("prompt_limit");

		const paused = await client.request("PATCH", `/research/visibility/prompts/${id}`, {
			active: false,
		});
		expect(paused.json.active).toBe(false);
		const added = await client.request("POST", "/research/visibility/prompts", {
			prompt: "Now there is room?",
		});
		expect(added.status).toBe(201);
		const resume = await client.request("PATCH", `/research/visibility/prompts/${id}`, {
			active: true,
		});
		expect(resume.status).toBe(409);
		const edited = await client.request("PATCH", `/research/visibility/prompts/${id}`, {
			prompt: "Which rocket company is cheapest?",
		});
		expect(edited.json).toMatchObject({
			prompt: "Which rocket company is cheapest?",
			active: false,
		});

		const viewer = await addMember(client, orgId, "viewer");
		expect((await viewer.request("GET", "/research/visibility/prompts")).json.items).toHaveLength(
			26,
		);
		expect(
			(await viewer.request("POST", "/research/visibility/prompts", { prompt: "Viewer here?" }))
				.status,
		).toBe(403);

		const { client: stranger } = await newOrg("Other");
		expect(
			(await stranger.request("PATCH", `/research/visibility/prompts/${id}`, { active: true }))
				.status,
		).toBe(404);
		expect((await stranger.request("DELETE", `/research/visibility/prompts/${id}`)).status).toBe(
			404,
		);
		expect((await client.request("DELETE", `/research/visibility/prompts/${id}`)).status).toBe(204);
	});

	test("run now: needs engines and prompts, respects the budget, once per hour", async () => {
		const { client, orgId } = await newOrg();
		researchTools.visibilityEngines = [];
		const off = await client.request("POST", "/research/visibility/run");
		expect(off.status).toBe(503);
		expect(off.json.error.code).toBe("visibility_not_configured");

		researchTools.visibilityEngines = [{ id: "claude", model: "claude-test" }];
		const empty = await client.request("POST", "/research/visibility/run");
		expect(empty.status).toBe(422);
		expect(empty.json.error.code).toBe("no_prompts");

		await client.request("POST", "/research/visibility/prompts", { prompt: "Who is best?" });
		const viewer = await addMember(client, orgId, "viewer");
		expect((await viewer.request("POST", "/research/visibility/run")).status).toBe(403);

		const ok = await client.request("POST", "/research/visibility/run");
		expect(ok.status).toBe(202);
		expect(ok.json).toEqual({ queued: true });
		const jobs = await researchQueue.getJobs(["waiting", "delayed", "active"]);
		expect(jobs.map((j) => j.data)).toContainEqual({
			task: "visibility-org",
			organizationId: orgId,
			force: true,
		});

		const soon = await client.request("POST", "/research/visibility/run");
		expect(soon.status).toBe(429);
		expect(soon.json.error.code).toBe("rate_limited");
		expect(soon.json.error.details.retryAfterSeconds).toBeGreaterThan(3500);

		const { user: u2, client: other, orgId: otherOrg } = await newOrg("Broke");
		await other.request("POST", "/research/visibility/prompts", { prompt: "Who is best?" });
		await exhaustBudget(otherOrg, u2.id);
		const broke = await other.request("POST", "/research/visibility/run");
		expect(broke.status).toBe(429);
		expect(broke.json.error.code).toBe("ai_budget_exceeded");
		// The refused request did not burn the hour.
		await db.delete(schema.aiGenerations).where(eq(schema.aiGenerations.organizationId, otherOrg));
		expect((await other.request("POST", "/research/visibility/run")).status).toBe(202);
	});
});

describe("visibility reports", () => {
	async function seed() {
		const org = await newOrg("Acme Org");
		const { client, orgId } = org;
		await client.request("PUT", "/ai/brand", { brandName: "Acme Rockets" });
		const orbitly = (await client.request("POST", "/research/competitors", { name: "Orbitly" }))
			.json;
		const rocketo = (await client.request("POST", "/research/competitors", { name: "Rocketo" }))
			.json;
		const p1 = (
			await client.request("POST", "/research/visibility/prompts", { prompt: "Best rockets?" })
		).json;
		const p2 = (
			await client.request("POST", "/research/visibility/prompts", { prompt: "Cheap launches?" })
		).json;

		const now = Date.now();
		const ago = (days: number) => new Date(now - days * 24 * 3600_000);
		const own = { url: "https://acme.test/a", domain: "acme.test", own: true };
		const theirs = {
			url: "https://orbitly.test/",
			domain: "orbitly.test",
			own: false,
			competitorId: orbitly.id,
		};
		const base = { organizationId: orgId, costMicros: 1000 };
		await db.insert(schema.visibilityChecks).values([
			// p1 × chatgpt: mentioned first, positive, cites us; Orbitly also named.
			{
				...base,
				promptId: p1.id,
				engine: "chatgpt",
				model: "gpt-test",
				checkedAt: ago(1),
				answer: `Acme Rockets leads. ${"Details. ".repeat(100)}`,
				brandMentioned: true,
				brandRank: 1,
				sentiment: "positive",
				citations: [own, theirs],
				competitorsMentioned: [orbitly.id],
			},
			// p1 × perplexity: mentioned third, neutral.
			{
				...base,
				promptId: p1.id,
				engine: "perplexity",
				model: "sonar",
				checkedAt: ago(2),
				answer: "Orbitly, Rocketo and Acme Rockets.",
				brandMentioned: true,
				brandRank: 3,
				sentiment: "neutral",
				citations: [theirs],
				competitorsMentioned: [orbitly.id, rocketo.id],
			},
			// p2 × chatgpt: not mentioned.
			{
				...base,
				promptId: p2.id,
				engine: "chatgpt",
				model: "gpt-test",
				checkedAt: ago(3),
				answer: "Orbitly is cheapest.",
				brandMentioned: false,
				competitorsMentioned: [orbitly.id],
			},
			// p2 × perplexity: errored — excluded from every rate.
			{
				...base,
				promptId: p2.id,
				engine: "perplexity",
				model: "sonar",
				checkedAt: ago(1),
				answer: "",
				brandMentioned: false,
				errorCode: "transient",
			},
			// Out of a 30-day window.
			{
				...base,
				promptId: p2.id,
				engine: "chatgpt",
				model: "gpt-test",
				checkedAt: ago(45),
				answer: "Acme Rockets!",
				brandMentioned: true,
				brandRank: 1,
				competitorsMentioned: [],
			},
		]);
		return { ...org, orbitly, rocketo, p1, p2 };
	}

	test("summary: rates exclude errored checks; share of voice across brand and competitors", async () => {
		const { client, p1 } = await seed();
		const res = await client.request("GET", "/research/visibility/summary");
		expect(res.status).toBe(200);
		const s = res.json;
		expect(s.engines).toEqual([
			{ id: "chatgpt", model: "gpt-test" },
			{ id: "perplexity", model: "sonar" },
		]);
		expect(s.overall).toEqual({
			checks: 3,
			mentionRate: 2 / 3,
			avgRank: 2,
			sentiment: { positive: 1, neutral: 1, negative: 0 },
			ownCitationRate: 1 / 3,
		});
		expect(s.byEngine).toEqual([
			{ engine: "chatgpt", checks: 2, mentionRate: 0.5, avgRank: 1 },
			{ engine: "perplexity", checks: 1, mentionRate: 1, avgRank: 3 },
		]);
		// Brand 2, Orbitly 3, Rocketo 1 → 6 mentions.
		expect(s.shareOfVoice).toEqual([
			{ name: "Acme Rockets", isBrand: true, mentions: 2, share: 2 / 6 },
			{ name: "Orbitly", isBrand: false, mentions: 3, share: 3 / 6 },
			{ name: "Rocketo", isBrand: false, mentions: 1, share: 1 / 6 },
		]);
		const totalTrendChecks = s.trend.reduce((n: number, w: { checks: number }) => n + w.checks, 0);
		expect(totalTrendChecks).toBe(3);
		for (const w of s.trend) {
			expect(new Date(`${w.weekStart}T00:00:00Z`).getUTCDay()).toBe(1); // Monday
			if (w.checks === 0) expect(w.mentionRate).toBeNull();
		}
		expect(s.trend.length).toBeGreaterThanOrEqual(5);
		expect(typeof s.lastCheckedAt).toBe("string");

		// The wider window picks up the old check.
		const wide = await client.request("GET", "/research/visibility/summary?days=90");
		expect(wide.json.overall).toMatchObject({ checks: 4, mentionRate: 3 / 4 });
		expect((await client.request("GET", "/research/visibility/summary?days=0")).status).toBe(422);

		const prompts = await client.request("GET", "/research/visibility/prompts");
		const first = prompts.json.items.find((p: { id: string }) => p.id === p1.id);
		expect(first.mentionRate).toBe(1);
		expect(typeof first.lastCheckedAt).toBe("string");
	});

	test("an organization with no checks gets null rates, not zeros", async () => {
		const { client } = await newOrg();
		const s = (await client.request("GET", "/research/visibility/summary")).json;
		expect(s.overall).toEqual({
			checks: 0,
			mentionRate: null,
			avgRank: null,
			sentiment: { positive: 0, neutral: 0, negative: 0 },
			ownCitationRate: null,
		});
		expect(s.byEngine).toEqual([
			{ engine: "chatgpt", checks: 0, mentionRate: null, avgRank: null },
			{ engine: "perplexity", checks: 0, mentionRate: null, avgRank: null },
		]);
		expect(s.shareOfVoice).toEqual([{ name: "Research Co", isBrand: true, mentions: 0, share: 0 }]);
		expect(s.lastCheckedAt).toBeNull();
	});

	test("checks per prompt with excerpts and competitor names; one check in full", async () => {
		const { client, orgId, p1, orbitly, rocketo } = await seed();
		const res = await client.request("GET", `/research/visibility/prompts/${p1.id}/checks?limit=5`);
		expect(res.status).toBe(200);
		const [latest, older] = res.json.items;
		expect(latest).toMatchObject({
			engine: "chatgpt",
			model: "gpt-test",
			brandMentioned: true,
			brandRank: 1,
			sentiment: "positive",
			competitors: [{ id: orbitly.id, name: "Orbitly" }],
			errorCode: null,
		});
		expect(latest.answerExcerpt.length).toBe(400);
		expect(latest.answer).toBeUndefined();
		expect(latest.citations).toHaveLength(2);
		expect(older.competitors).toEqual([
			{ id: orbitly.id, name: "Orbitly" },
			{ id: rocketo.id, name: "Rocketo" },
		]);
		expect(
			(await client.request("GET", `/research/visibility/prompts/${p1.id}/checks?limit=51`)).status,
		).toBe(422);

		const full = await client.request("GET", `/research/visibility/checks/${latest.id}`);
		expect(full.status).toBe(200);
		expect(full.json.answer.length).toBeGreaterThan(400);
		expect(full.json).toMatchObject({ promptId: p1.id, prompt: "Best rockets?" });

		// Deleting a competitor drops it from past checks instead of showing a dangling id.
		await client.request("DELETE", `/research/competitors/${rocketo.id}`);
		const after = await client.request("GET", `/research/visibility/prompts/${p1.id}/checks`);
		expect(after.json.items[1].competitors).toEqual([{ id: orbitly.id, name: "Orbitly" }]);

		const viewer = await addMember(client, orgId, "viewer");
		expect((await viewer.request("GET", `/research/visibility/checks/${latest.id}`)).status).toBe(
			200,
		);
		const { client: stranger } = await newOrg("Other");
		expect((await stranger.request("GET", `/research/visibility/checks/${latest.id}`)).status).toBe(
			404,
		);
		expect(
			(await stranger.request("GET", `/research/visibility/prompts/${p1.id}/checks`)).status,
		).toBe(404);
		const strangerSummary = await stranger.request("GET", "/research/visibility/summary");
		expect(strangerSummary.json.overall.checks).toBe(0);
	});
});
