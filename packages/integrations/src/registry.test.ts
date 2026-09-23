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

	test("which providers expose the engagement inbox, mentions and listening", () => {
		const ids = (pick: (p: ReturnType<typeof registry.all>[number]) => unknown) =>
			registry
				.all()
				.filter(pick)
				.map((p) => p.id)
				.sort();
		// linkedin (personal) is deliberately absent: comments on member posts need
		// r_member_social_feed, a restricted partner scope — docs/platforms.md → Engagement inbox.
		expect(ids((p) => p.engagement)).toEqual([
			"facebook",
			"instagram",
			"linkedin_page",
			"reddit",
			"threads",
			"x",
			"youtube",
		]);
		expect(ids((p) => p.engagement?.listMentions)).toEqual(["x"]);
		expect(ids((p) => p.engagement?.searchDiscussions)).toEqual(["reddit", "x"]);
	});

	test("engagement limits are sane and required scopes are ones the provider requests", async () => {
		for (const p of registry.all()) {
			const e = p.engagement;
			if (!e) continue;
			expect(Number.isInteger(e.maxPostsPerCall) && e.maxPostsPerCall > 0).toBe(true);
			expect(Number.isInteger(e.maxReplyLength) && e.maxReplyLength > 0).toBe(true);
			const { url } = await p.getAuthorizationUrl({ redirectUri: "https://x/cb", state: "s" });
			const requested = (new URL(url).searchParams.get("scope") ?? "").split(/[ ,]/);
			for (const scope of [...e.requiredScopes.read, ...e.requiredScopes.reply]) {
				expect({ provider: p.id, scope, requested: requested.includes(scope) }).toEqual({
					provider: p.id,
					scope,
					requested: true,
				});
			}
		}
	});

	test("every batch size is a positive integer", () => {
		for (const p of registry.all()) {
			if (!p.analytics) continue;
			expect(Number.isInteger(p.analytics.maxPostsPerCall)).toBe(true);
			expect(p.analytics.maxPostsPerCall).toBeGreaterThan(0);
		}
	});
});
