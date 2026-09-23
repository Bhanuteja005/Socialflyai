import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { AiError, type AiModels, type TextModel, type TextResult } from "@socialfly/ai";
import { FakeTextModel } from "@socialfly/ai/testing";
import { workerEnv as env } from "@socialfly/config";
import { createLogger } from "@socialfly/core/logger";
import { normalizeEmail } from "@socialfly/core/security";
import { and, createDb, eq, schema, sql } from "@socialfly/db";
import type { JobProducer } from "@socialfly/queue";
import type {
	BrandInsights,
	CrawledPage,
	KeywordMetric,
	VisibilityEngine,
} from "@socialfly/research";
import { Maintenance } from "#src/maintenance/maintenance.ts";
import { TargetState } from "#src/publishing/target-state.ts";
import type { ResearchFns, SeoClient } from "#src/research/deps.ts";
import { ResearchProcessor } from "#src/research/research-processor.ts";

// Own connection, not #src/infrastructure (see ai-media.e2e.test.ts for why).
const database = createDb(env.DATABASE_URL, { max: 5 });
const db = database.db;
const logger = createLogger({ service: "worker-test", level: "fatal" });

afterAll(async () => {
	await database.close();
});

const FIRST_OF_TWO = { attemptsMade: 0, maxAttempts: 2 };
const LAST_OF_TWO = { attemptsMade: 1, maxAttempts: 2 };

// ── fakes ────────────────────────────────────────────────────────────────────

const INSIGHTS: BrandInsights = {
	summary: "Acme sells rockets to small satellite companies.",
	audience: "Satellite startups",
	valueProposition: "Cheap rides to orbit",
	topics: [{ name: "Launch pricing", description: "What a launch costs" }],
	buyerQuestions: ["What is the cheapest small-satellite launch provider?"],
	competitors: [{ name: "Orbitly", domain: "orbitly.test", reason: "Same market" }],
	contentGaps: [{ topic: "Launch insurance", why: "Buyers ask, the site is silent" }],
	contentIdeas: [
		{
			title: "Launch costs explained",
			format: "carousel",
			angle: "Myths",
			platforms: ["linkedin"],
		},
	],
	keywords: ["small satellite launch"],
};

const page = (path: string, words = 120): CrawledPage => ({
	url: `https://acme.test${path}`,
	statusCode: 200,
	title: `Acme ${path}`,
	description: "Rockets for everyone",
	headings: ["Rockets"],
	text: "rocket ".repeat(words).trim(),
	wordCount: words,
});

class FakeCrawler {
	calls: { startUrl: string; maxPages: number; userAgent: string }[] = [];
	pages: CrawledPage[] = [page("/"), page("/pricing")];
	pagesFound = 3;
	blockedByRobots = false;
	/** Progress observed in the DB while onPage ran, to prove writes are progressive. */
	progressSeen: number[] = [];

	crawl: ResearchFns["crawlSite"] = async (startUrl, opts) => {
		this.calls.push({ startUrl, maxPages: opts.maxPages, userAgent: opts.userAgent });
		if (this.blockedByRobots) return { pages: [], pagesFound: 0, blockedByRobots: true };
		let crawled = 0;
		for (const p of this.pages) {
			crawled++;
			await opts.onPage?.(p, { crawled, found: this.pagesFound });
		}
		return { pages: this.pages, pagesFound: this.pagesFound, blockedByRobots: false };
	};
}

class FakeAnalyzer {
	calls: { pages: number; brandName: string | null; knownCompetitors: string[] }[] = [];
	private readonly failures: Error[] = [];

	failNext(error: Error) {
		this.failures.push(error);
	}

	analyze: ResearchFns["analyzeBrand"] = async (model, input) => {
		this.calls.push({
			pages: input.pages.length,
			brandName: input.brand?.brandName ?? null,
			knownCompetitors: input.knownCompetitors,
		});
		const failure = this.failures.shift();
		if (failure) throw failure;
		return {
			model: model.id,
			usage: { inputTokens: 5000, outputTokens: 1500 },
			costMicros: 60_000,
			output: INSIGHTS,
		};
	};
}

/**
 * Stand-in for analyzeMention: plain substring matching, enough to exercise how the
 * processor stores what the analysis returns (the real matcher is tested in its package).
 */
const fakeAnalyzeMention: ResearchFns["analyzeMention"] = (answer, citations, brand, rivals) => {
	const lower = answer.toLowerCase();
	const hits = [
		{ id: "brand", at: lower.indexOf(brand.name.toLowerCase()) },
		...rivals.map((c) => ({ id: c.id, at: lower.indexOf(c.name.toLowerCase()) })),
	]
		.filter((h) => h.at >= 0)
		.sort((a, b) => a.at - b.at);
	const brandAt = hits.findIndex((h) => h.id === "brand");
	return {
		brandMentioned: brandAt >= 0,
		brandRank: brandAt >= 0 ? brandAt + 1 : null,
		competitorsMentioned: hits.filter((h) => h.id !== "brand").map((h) => h.id),
		citations: citations.map((c) => {
			const domain = new URL(c.url).hostname.replace(/^www\./, "");
			const rival = rivals.find((r) => r.domain === domain);
			return {
				url: c.url,
				domain,
				own: domain === brand.domain,
				...(rival ? { competitorId: rival.id } : {}),
			};
		}),
	};
};

let sentimentCalls = 0;
const fakeSentiment: ResearchFns["classifySentiment"] = async (model: TextModel) => {
	sentimentCalls++;
	return {
		model: model.id,
		usage: { inputTokens: 100, outputTokens: 10 },
		costMicros: 1_000,
		output: { sentiment: "positive" as const },
	} satisfies TextResult<{ sentiment: "positive" }>;
};

class FakeEngine implements VisibilityEngine {
	asked: string[] = [];
	constructor(
		readonly id: VisibilityEngine["id"],
		readonly model: string,
		private readonly reply: (prompt: string) => string | Error,
	) {}

	async ask(prompt: string) {
		this.asked.push(prompt);
		const r = this.reply(prompt);
		if (r instanceof Error) throw r;
		return {
			answer: r,
			citations: [{ url: "https://www.acme.test/pricing" }, { url: "https://orbitly.test/" }],
			model: this.model,
			costMicros: 2_000,
		};
	}
}

class FakeSeo implements SeoClient {
	metricCalls: string[][] = [];
	serpCalls: string[] = [];
	async keywordMetrics(kws: string[]) {
		this.metricCalls.push(kws);
		const items: KeywordMetric[] = kws
			.filter((k) => k !== "unknown term")
			.map((k) => ({ keyword: k, searchVolume: 1000, difficulty: 42, cpcUsd: 1.25 }));
		return { items, costMicros: 75 * kws.length };
	}
	async keywordIdeas() {
		return { items: [], costMicros: 0 };
	}
	async serpPosition(keyword: string) {
		this.serpCalls.push(keyword);
		return { position: 4, url: "https://acme.test/pricing", costMicros: 600 };
	}
}

// ── setup ────────────────────────────────────────────────────────────────────

let text: FakeTextModel;
let ai: AiModels;
let crawler: FakeCrawler;
let analyzer: FakeAnalyzer;
let engines: FakeEngine[];
let seo: FakeSeo;
let queued: { kind: string; orgId: string; force?: boolean }[];

const jobs = {
	enqueueVisibilityCheck: async (orgId: string, opts: { force?: boolean } = {}) => {
		queued.push({ kind: "visibility", orgId, force: opts.force });
	},
	enqueueSeoRefresh: async (orgId: string, opts: { force?: boolean } = {}) => {
		queued.push({ kind: "seo", orgId, force: opts.force });
	},
} as unknown as JobProducer;

const processor = (over: { engines?: VisibilityEngine[]; seo?: SeoClient | null } = {}) =>
	new ResearchProcessor({
		db,
		ai,
		fns: {
			crawlSite: crawler.crawl,
			analyzeBrand: analyzer.analyze,
			analyzeMention: fakeAnalyzeMention,
			classifySentiment: fakeSentiment,
		},
		engines: over.engines ?? engines,
		seo: over.seo === undefined ? seo : over.seo,
		jobs,
		logger,
		config: { maxPages: 7, userAgent: "TestBot/1.0", monthlyBudgetUsd: 25 },
	});

beforeEach(() => {
	text = new FakeTextModel();
	ai = { text, images: null, speech: null };
	crawler = new FakeCrawler();
	analyzer = new FakeAnalyzer();
	sentimentCalls = 0;
	queued = [];
	seo = new FakeSeo();
	engines = [
		new FakeEngine("chatgpt", "gpt-test", (p) =>
			p.includes("cheapest") ? "Orbitly is popular, but Acme Rockets is cheaper." : "Try Orbitly.",
		),
		new FakeEngine("gemini", "gemini-test", () => new AiError("transient", "Gemini is down")),
	];
});

async function org(opts: { brandName?: string; website?: string | null } = {}) {
	const email = `research-${crypto.randomUUID()}@example.test`;
	const [user] = await db
		.insert(schema.users)
		.values({ email, emailNormalized: normalizeEmail(email) })
		.returning();
	const [organization] = await db
		.insert(schema.organizations)
		.values({ name: "Acme Org", slug: `org-${crypto.randomUUID()}`, createdBy: user?.id })
		.returning();
	const orgId = organization?.id as string;
	if (opts.brandName !== undefined || opts.website !== undefined) {
		await db.insert(schema.brandProfiles).values({
			organizationId: orgId,
			brandName: opts.brandName ?? "",
			website: opts.website ?? null,
		});
	}
	return { orgId, userId: user?.id as string };
}

async function newRun(orgId: string, userId: string) {
	const [run] = await db
		.insert(schema.researchRuns)
		.values({ organizationId: orgId, requestedBy: userId, startUrl: "https://acme.test/" })
		.returning();
	return run?.id as string;
}

const loadRun = async (id: string) => {
	const [run] = await db.select().from(schema.researchRuns).where(eq(schema.researchRuns.id, id));
	if (!run) throw new Error("run not found");
	return run;
};

const ledger = (orgId: string, kind: "research" | "visibility" | "seo") =>
	db
		.select()
		.from(schema.aiGenerations)
		.where(
			and(eq(schema.aiGenerations.organizationId, orgId), eq(schema.aiGenerations.kind, kind)),
		);

// ── crawl ────────────────────────────────────────────────────────────────────

describe("research crawl", () => {
	test("crawls, stores pages progressively, analyses and bills one ledger row", async () => {
		const { orgId, userId } = await org({
			brandName: "Acme Rockets",
			website: "https://acme.test",
		});
		await db.insert(schema.competitors).values({ organizationId: orgId, name: "Orbitly" });
		const runId = await newRun(orgId, userId);

		// Read progress back while the crawl is running.
		const crawl = crawler.crawl;
		crawler.crawl = async (url, opts) =>
			crawl(url, {
				...opts,
				onPage: async (p, progress) => {
					await opts.onPage?.(p, progress);
					crawler.progressSeen.push((await loadRun(runId)).pagesCrawled);
				},
			});

		await processor().run({ task: "crawl", runId }, FIRST_OF_TWO);

		const run = await loadRun(runId);
		expect(run).toMatchObject({
			status: "succeeded",
			pagesCrawled: 2,
			pagesFound: 3,
			model: "fake:text",
			costMicros: 60_000,
			errorCode: null,
		});
		expect(run.startedAt).toBeInstanceOf(Date);
		expect(run.completedAt).toBeInstanceOf(Date);
		expect(run.insights).toEqual(INSIGHTS as unknown as Record<string, unknown>);
		expect(crawler.progressSeen).toEqual([1, 2]);
		expect(crawler.calls).toEqual([
			{ startUrl: "https://acme.test/", maxPages: 7, userAgent: "TestBot/1.0" },
		]);
		expect(analyzer.calls).toEqual([
			{ pages: 2, brandName: "Acme Rockets", knownCompetitors: ["Orbitly"] },
		]);

		const pages = await db
			.select()
			.from(schema.researchPages)
			.where(eq(schema.researchPages.runId, runId));
		expect(pages.map((p) => p.url).sort()).toEqual([
			"https://acme.test/",
			"https://acme.test/pricing",
		]);
		expect(pages[0]).toMatchObject({ organizationId: orgId, wordCount: 120, statusCode: 200 });

		const rows = await ledger(orgId, "research");
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			status: "succeeded",
			costMicros: 60_000,
			model: "fake:text",
			userId,
			inputTokens: 5000,
			input: { runId, startUrl: "https://acme.test/", pages: 2 },
		});
	});

	test("robots.txt disallowing us fails the run with a clear reason and no spend", async () => {
		const { orgId, userId } = await org();
		const runId = await newRun(orgId, userId);
		crawler.blockedByRobots = true;

		await processor().run({ task: "crawl", runId }, FIRST_OF_TWO); // resolves: nothing to retry

		const run = await loadRun(runId);
		expect(run.status).toBe("failed");
		expect(run.errorCode).toBe("robots_disallowed");
		expect(run.errorMessage).toContain("robots.txt");
		expect(analyzer.calls).toHaveLength(0);
		expect(await ledger(orgId, "research")).toHaveLength(0);
	});

	test("a site with no readable pages fails as no_pages", async () => {
		const { orgId, userId } = await org();
		const runId = await newRun(orgId, userId);
		crawler.pages = [];
		await processor().run({ task: "crawl", runId }, FIRST_OF_TWO);
		expect(await loadRun(runId)).toMatchObject({ status: "failed", errorCode: "no_pages" });
	});

	test("a transient analysis error is retried from the stored pages, not a new crawl", async () => {
		const { orgId, userId } = await org();
		const runId = await newRun(orgId, userId);
		analyzer.failNext(new AiError("transient", "The AI provider is unavailable"));

		const error = await processor()
			.run({ task: "crawl", runId }, FIRST_OF_TWO)
			.then(
				() => null,
				(e: unknown) => e,
			);
		expect(error).toBeInstanceOf(AiError);
		expect((await loadRun(runId)).status).toBe("analyzing");

		await processor().run({ task: "crawl", runId }, LAST_OF_TWO);
		expect((await loadRun(runId)).status).toBe("succeeded");
		expect(crawler.calls).toHaveLength(1);
		expect(analyzer.calls.map((c) => c.pages)).toEqual([2, 2]);
		expect(await ledger(orgId, "research")).toHaveLength(1);
	});

	test("a refusal fails without retrying and leaves a failed ledger row", async () => {
		const { orgId, userId } = await org();
		const runId = await newRun(orgId, userId);
		analyzer.failNext(new AiError("refused", "The AI declined this request"));

		await processor().run({ task: "crawl", runId }, FIRST_OF_TWO);

		expect(await loadRun(runId)).toMatchObject({ status: "failed", errorCode: "refused" });
		const rows = await ledger(orgId, "research");
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ status: "failed", errorCode: "refused", costMicros: 0 });
	});

	test("an unexpected error on the last attempt fails without leaking internals", async () => {
		const { orgId, userId } = await org();
		const runId = await newRun(orgId, userId);
		analyzer.failNext(new Error("ECONNRESET 10.0.0.3:5432"));
		await processor().run({ task: "crawl", runId }, LAST_OF_TWO);
		const run = await loadRun(runId);
		expect(run).toMatchObject({ status: "failed", errorCode: "internal" });
		expect(run.errorMessage).not.toContain("ECONNRESET");
	});

	test("no text model fails the run as not_configured", async () => {
		const { orgId, userId } = await org();
		const runId = await newRun(orgId, userId);
		ai.text = null;
		await processor().run({ task: "crawl", runId }, FIRST_OF_TWO);
		expect(await loadRun(runId)).toMatchObject({ status: "failed", errorCode: "not_configured" });
	});

	test("a duplicate job for a finished run does nothing", async () => {
		const { orgId, userId } = await org();
		const runId = await newRun(orgId, userId);
		await processor().run({ task: "crawl", runId }, FIRST_OF_TWO);
		await processor().run({ task: "crawl", runId }, FIRST_OF_TWO);
		expect(crawler.calls).toHaveLength(1);
		expect(analyzer.calls).toHaveLength(1);
		expect(await ledger(orgId, "research")).toHaveLength(1);
	});

	test("a job for a missing run is a no-op", async () => {
		await processor().run({ task: "crawl", runId: crypto.randomUUID() }, FIRST_OF_TWO);
		expect(crawler.calls).toHaveLength(0);
	});
});

// ── visibility ───────────────────────────────────────────────────────────────

async function prompts(orgId: string, texts: string[], active = true) {
	return db
		.insert(schema.visibilityPrompts)
		.values(texts.map((prompt) => ({ organizationId: orgId, prompt, active })))
		.returning();
}

const checksOf = (orgId: string) =>
	db
		.select()
		.from(schema.visibilityChecks)
		.where(eq(schema.visibilityChecks.organizationId, orgId));

describe("visibility checks", () => {
	test("asks every engine every active prompt, stores mentions, errors and one ledger row", async () => {
		const { orgId } = await org({ brandName: "Acme Rockets", website: "https://www.acme.test" });
		const [orbitly] = await db
			.insert(schema.competitors)
			.values({ organizationId: orgId, name: "Orbitly", domain: "orbitly.test" })
			.returning();
		const [cheapest] = await prompts(orgId, [
			"What is the cheapest small-satellite launch provider?",
			"Who launches cubesats?",
		]);
		await prompts(orgId, ["A paused question"], false);

		const result = await processor().run(
			{ task: "visibility-org", organizationId: orgId },
			FIRST_OF_TWO,
		);
		expect(result).toMatchObject({ checks: 4, errors: 2 });

		const checks = await checksOf(orgId);
		expect(checks).toHaveLength(4);
		const errored = checks.filter((c) => c.errorCode);
		expect(errored.map((c) => [c.engine, c.errorCode, c.answer, c.brandMentioned])).toEqual([
			["gemini", "transient", "", false],
			["gemini", "transient", "", false],
		]);

		const mentioned = checks.find((c) => c.promptId === cheapest?.id && c.engine === "chatgpt");
		expect(mentioned).toMatchObject({
			model: "gpt-test",
			brandMentioned: true,
			brandRank: 2,
			sentiment: "positive",
			competitorsMentioned: [orbitly?.id],
			costMicros: 3_000,
			errorCode: null,
		});
		expect(mentioned?.citations).toEqual([
			{ url: "https://www.acme.test/pricing", domain: "acme.test", own: true },
			{
				url: "https://orbitly.test/",
				domain: "orbitly.test",
				own: false,
				competitorId: orbitly?.id as string,
			},
		]);
		const notMentioned = checks.find((c) => c.promptId !== cheapest?.id && c.engine === "chatgpt");
		expect(notMentioned).toMatchObject({ brandMentioned: false, brandRank: null, sentiment: null });
		// Sentiment only when the brand is mentioned.
		expect(sentimentCalls).toBe(1);

		const rows = await ledger(orgId, "visibility");
		expect(rows).toHaveLength(1);
		// 2 successful answers × 2000 + 1 sentiment × 1000.
		expect(rows[0]).toMatchObject({ status: "succeeded", costMicros: 5_000 });

		// Scheduled re-run within the week: answered pairs are skipped; errored ones re-asked.
		const [chatgpt, gemini] = engines;
		await processor().run({ task: "visibility-org", organizationId: orgId }, FIRST_OF_TWO);
		expect(chatgpt?.asked).toHaveLength(2);
		expect(gemini?.asked).toHaveLength(4);
	});

	test("answers are capped at 8000 characters", async () => {
		const { orgId } = await org({ brandName: "Acme" });
		await prompts(orgId, ["Tell me everything about rockets"]);
		const long = new FakeEngine("claude", "claude-test", () => "Acme ".repeat(3000));
		await processor({ engines: [long] }).run(
			{ task: "visibility-org", organizationId: orgId },
			FIRST_OF_TWO,
		);
		const [check] = await checksOf(orgId);
		expect(check?.answer.length).toBe(8000);
	});

	test("the brand falls back to the organization name when no profile exists", async () => {
		const { orgId } = await org();
		await prompts(orgId, ["Which org is best?"]);
		const engine = new FakeEngine("perplexity", "sonar", () => "Acme Org, clearly.");
		await processor({ engines: [engine] }).run(
			{ task: "visibility-org", organizationId: orgId },
			FIRST_OF_TWO,
		);
		const [check] = await checksOf(orgId);
		expect(check).toMatchObject({ brandMentioned: true, brandRank: 1 });
	});

	test("an organization over its monthly budget is skipped without calling any engine", async () => {
		const { orgId, userId } = await org({ brandName: "Acme" });
		await prompts(orgId, ["Who is best?"]);
		await db
			.update(schema.organizations)
			.set({ aiMonthlyBudgetUsd: 0.05 })
			.where(eq(schema.organizations.id, orgId));
		await db.insert(schema.aiGenerations).values({
			organizationId: orgId,
			userId,
			kind: "post",
			status: "succeeded",
			costMicros: 50_000,
		});

		const result = await processor().run(
			{ task: "visibility-org", organizationId: orgId },
			FIRST_OF_TWO,
		);
		expect(result).toEqual({ skipped: "budget_exceeded" });
		expect(engines.every((e) => e.asked.length === 0)).toBe(true);
		expect(await checksOf(orgId)).toHaveLength(0);
	});

	test("at most 25 prompts are asked per run", async () => {
		const { orgId } = await org({ brandName: "Acme" });
		await prompts(
			orgId,
			Array.from({ length: 27 }, (_, i) => `Question number ${i + 1}?`),
		);
		const engine = new FakeEngine("claude", "claude-test", () => "No idea.");
		await processor({ engines: [engine] }).run(
			{ task: "visibility-org", organizationId: orgId },
			FIRST_OF_TWO,
		);
		expect(engine.asked).toHaveLength(25);
	});

	test("the planner queues organizations with active prompts only", async () => {
		const withActive = await org();
		await prompts(withActive.orgId, ["An active question"]);
		const onlyPaused = await org();
		await prompts(onlyPaused.orgId, ["A paused question"], false);

		await processor().run({ task: "visibility-plan" }, FIRST_OF_TWO);
		const orgs = queued.filter((q) => q.kind === "visibility").map((q) => q.orgId);
		expect(orgs).toContain(withActive.orgId);
		expect(orgs).not.toContain(onlyPaused.orgId);

		// No engines configured: nothing to plan.
		queued = [];
		await processor({ engines: [] }).run({ task: "visibility-plan" }, FIRST_OF_TWO);
		expect(queued).toHaveLength(0);
	});
});

// ── SEO ──────────────────────────────────────────────────────────────────────

async function keyword(
	orgId: string,
	kw: string,
	opts: { tracked?: boolean; metricsUpdatedAt?: Date | null } = {},
) {
	const [row] = await db
		.insert(schema.keywords)
		.values({
			organizationId: orgId,
			keyword: kw,
			tracked: opts.tracked ?? false,
			metricsUpdatedAt: opts.metricsUpdatedAt ?? null,
		})
		.returning();
	return row as typeof schema.keywords.$inferSelect;
}

describe("seo refresh", () => {
	test("refreshes stale metrics, ranks tracked keywords for today and bills once", async () => {
		const { orgId } = await org({ brandName: "Acme", website: "https://www.acme.test/" });
		const fresh = await keyword(orgId, "rocket launch", { tracked: true });
		const stale = await keyword(orgId, "orbit pricing", {
			metricsUpdatedAt: new Date(Date.now() - 40 * 24 * 3600_000),
		});
		const recent = await keyword(orgId, "cubesat", { metricsUpdatedAt: new Date() });
		const unknown = await keyword(orgId, "unknown term");

		await processor().run({ task: "seo-refresh", organizationId: orgId }, FIRST_OF_TWO);

		expect(seo.metricCalls).toHaveLength(1);
		expect(seo.metricCalls[0]?.sort()).toEqual(["orbit pricing", "rocket launch", "unknown term"]);
		const rows = await db
			.select()
			.from(schema.keywords)
			.where(eq(schema.keywords.organizationId, orgId));
		const byId = new Map(rows.map((r) => [r.id, r]));
		expect(byId.get(fresh.id)).toMatchObject({ searchVolume: 1000, difficulty: 42, cpcUsd: 1.25 });
		expect(byId.get(stale.id)?.searchVolume).toBe(1000);
		expect(byId.get(recent.id)?.searchVolume).toBeNull();
		// No data from the provider: still marked measured, metrics stay unknown.
		expect(byId.get(unknown.id)).toMatchObject({ searchVolume: null, difficulty: null });
		expect(byId.get(unknown.id)?.metricsUpdatedAt).toBeInstanceOf(Date);

		expect(seo.serpCalls).toEqual(["rocket launch"]);
		const today = new Date().toISOString().slice(0, 10);
		const rankings = await db
			.select()
			.from(schema.keywordRankings)
			.where(eq(schema.keywordRankings.keywordId, fresh.id));
		expect(rankings).toEqual([
			expect.objectContaining({ day: today, position: 4, url: "https://acme.test/pricing" }),
		]);

		const bill = await ledger(orgId, "seo");
		expect(bill).toHaveLength(1);
		expect(bill[0]).toMatchObject({ status: "succeeded", costMicros: 3 * 75 + 600 });

		// Same day again: nothing is stale, nothing to rank — no calls, no new ledger row.
		await processor().run(
			{ task: "seo-refresh", organizationId: orgId, force: true },
			FIRST_OF_TWO,
		);
		expect(seo.metricCalls).toHaveLength(1);
		expect(seo.serpCalls).toHaveLength(1);
		expect(await ledger(orgId, "seo")).toHaveLength(1);
	});

	test("without a website, rankings are skipped; without DataForSEO, everything is", async () => {
		const { orgId } = await org({ brandName: "Acme" });
		await keyword(orgId, "rocket launch", { tracked: true });
		await processor().run({ task: "seo-refresh", organizationId: orgId }, FIRST_OF_TWO);
		expect(seo.metricCalls).toHaveLength(1);
		expect(seo.serpCalls).toHaveLength(0);

		const other = await org({ website: "https://acme.test" });
		await keyword(other.orgId, "rocket launch", { tracked: true });
		const result = await processor({ seo: null }).run(
			{ task: "seo-refresh", organizationId: other.orgId },
			FIRST_OF_TWO,
		);
		expect(result).toEqual({ skipped: "not_configured" });
	});

	test("the planner queues organizations that have keywords", async () => {
		const { orgId } = await org();
		await keyword(orgId, "rocket launch");
		await processor().run({ task: "seo-plan" }, FIRST_OF_TWO);
		expect(queued.filter((q) => q.kind === "seo").map((q) => q.orgId)).toContain(orgId);
	});
});

// ── maintenance ──────────────────────────────────────────────────────────────

describe("stuck research runs", () => {
	test("runs active for over 30 minutes are failed as timeout; recent ones are left alone", async () => {
		const { orgId, userId } = await org();
		const old = await newRun(orgId, userId);
		const recent = await newRun(orgId, userId);
		await db
			.update(schema.researchRuns)
			.set({ status: "crawling", createdAt: sql`now() - interval '31 minutes'` })
			.where(eq(schema.researchRuns.id, old));

		const maintenance = new Maintenance(db, jobs, new TargetState(db), logger);
		const result = await maintenance.run({ task: "recover-stuck-targets" });
		expect((result as { researchRuns: number }).researchRuns).toBeGreaterThanOrEqual(1);

		expect(await loadRun(old)).toMatchObject({ status: "failed", errorCode: "timeout" });
		expect((await loadRun(recent)).status).toBe("pending");

		// A late job for the timed-out run does nothing.
		await processor().run({ task: "crawl", runId: old }, FIRST_OF_TWO);
		expect(crawler.calls).toHaveLength(0);
	});
});
