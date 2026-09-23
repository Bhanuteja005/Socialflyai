import { describe, expect, test } from "bun:test";
import { createProviderRegistry, type IntegrationsConfig } from "./registry";

const config: IntegrationsConfig = {
	LINKEDIN_CLIENT_ID: "x",
	LINKEDIN_CLIENT_SECRET: "x",
	LINKEDIN_API_VERSION: "202609",
	META_APP_ID: "x",
	META_APP_SECRET: "x",
	META_GRAPH_VERSION: "v23.0",
	THREADS_APP_ID: "x",
	THREADS_APP_SECRET: "x",
	X_CLIENT_ID: "x",
	X_CLIENT_SECRET: "x",
	REDDIT_CLIENT_ID: "x",
	REDDIT_CLIENT_SECRET: "x",
	REDDIT_USER_AGENT: "x",
	YOUTUBE_CLIENT_ID: "x",
	YOUTUBE_CLIENT_SECRET: "x",
};

describe("analytics support across the registry", () => {
	const registry = createProviderRegistry(config);

	test("which providers expose analytics (the collector relies on this list)", () => {
		const withAnalytics = registry
			.all()
			.filter((p) => p.analytics)
			.map((p) => p.id)
			.sort();
		// linkedin (personal) is deliberately absent: member post analytics need a
		// restricted partner scope — see docs/platforms.md → Analytics.
		expect(withAnalytics).toEqual([
			"facebook",
			"instagram",
			"linkedin_page",
			"reddit",
			"threads",
			"x",
			"youtube",
		]);
	});

	test("which providers also report account-level days", () => {
		const withAccount = registry
			.all()
			.filter((p) => p.analytics?.getAccountMetrics)
			.map((p) => p.id)
			.sort();
		expect(withAccount).toEqual([
			"facebook",
			"instagram",
			"linkedin_page",
			"threads",
			"x",
			"youtube",
		]);
	});

	test("every batch size is a positive integer", () => {
		for (const p of registry.all()) {
			if (!p.analytics) continue;
			expect(Number.isInteger(p.analytics.maxPostsPerCall)).toBe(true);
			expect(p.analytics.maxPostsPerCall).toBeGreaterThan(0);
		}
	});
});
