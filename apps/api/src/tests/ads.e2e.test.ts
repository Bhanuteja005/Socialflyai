import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { FakeTextModel } from "@socialfly/ai/testing";
import { eq, schema } from "@socialfly/db";
import type {
	AdAccount,
	AdsCapabilities,
	AdsProvider,
	CampaignDraft,
	TargetingOption,
	TokenSet,
} from "@socialfly/integrations";
import { adsWriteQueueName, createQueueConnection, jobIds, QUEUE_PREFIX } from "@socialfly/queue";
import { Queue } from "bullmq";
import { adsTools, ai, db, redis, tokenCipher } from "#src/infrastructure/index.ts";
import { type ApiClient, createChannel, createUser } from "./helpers";

const { adAccounts, adCampaigns, adCampaignMetricsDaily } = schema;

const queueRedis = createQueueConnection(process.env.REDIS_URL as string);
const googleQueue = new Queue(adsWriteQueueName("google_ads"), {
	connection: queueRedis,
	prefix: QUEUE_PREFIX,
});

/**
 * A scripted ads platform for the API: the real adapters are exercised in
 * packages/integrations. Records what the API asked for so tests can assert on it.
 */
class FakeAds implements AdsProvider {
	readonly scopes = ["ads"];
	readonly writeRateLimit = { max: 10, durationMs: 1000 };
	readonly capabilities: AdsCapabilities = {
		objectives: ["traffic", "sales", "awareness"],
		formats: ["image", "video"],
		minDailyBudgetUsd: 5,
		maxAdsPerCampaign: 3,
		textLimits: { primaryText: 125, headline: 40 },
	};
	problems: string[] = [];
	validated: { draft: CampaignDraft; account: { currency: string } }[] = [];
	exchanges: { code: string; codeVerifier?: string }[] = [];
	accounts: AdAccount[] = [
		{
			externalId: "act_1",
			name: "Main",
			currency: "EUR",
			timezone: "Europe/Dublin",
			status: "active",
		},
		{ externalId: "act_2", name: "Second", currency: "USD", timezone: null, status: "active" },
	];
	searches = 0;

	constructor(
		readonly id: "google_ads" | "meta_ads",
		readonly displayName: string,
	) {}

	isConfigured() {
		return true;
	}

	async getAuthorizationUrl({ state }: { state: string }) {
		return { url: `https://ads.example/oauth?state=${state}`, codeVerifier: "verifier-1" };
	}

	async exchangeCode(input: { code: string; codeVerifier?: string }) {
		this.exchanges.push(input);
		const tokens: TokenSet & { tokenSecret: string } = {
			accessToken: "secret-access-token",
			refreshToken: "secret-refresh-token",
			tokenSecret: "secret-token-secret",
			expiresAt: new Date(Date.now() + 3600_000),
			scopes: ["ads"],
		};
		return { tokens, accounts: this.accounts };
	}

	validate(draft: CampaignDraft, account: { currency: string }) {
		this.validated.push({ draft, account });
		return [...this.problems];
	}

	async searchTargeting(): Promise<TargetingOption[]> {
		this.searches++;
		return [{ id: "6003", name: "Coffee", type: "interest" }];
	}

	async createCampaign(): Promise<never> {
		throw new Error("the API never creates campaigns");
	}
	async setStatus(): Promise<never> {
		throw new Error("the API never changes a campaign's status on the platform");
	}
	async getCampaignStatus(): Promise<"paused"> {
		return "paused";
	}
	async getInsights() {
		return [];
	}
}

let google: FakeAds;
let meta: FakeAds;
const realProviders = adsTools.providers;

beforeEach(() => {
	google = new FakeAds("google_ads", "Fake Google Ads");
	meta = new FakeAds("meta_ads", "Fake Meta Ads");
	const all = [google, meta];
	adsTools.providers = { all: () => all, get: (id) => all.find((p) => p.id === id) };
});

beforeAll(async () => {
	await googleQueue.obliterate({ force: true });
});

afterAll(async () => {
	adsTools.providers = realProviders;
	await googleQueue.obliterate({ force: true }).catch(() => {});
	await googleQueue.close();
	await queueRedis.quit();
});

async function member(owner: ApiClient, orgId: string, role: "viewer" | "editor" | "admin") {
	const { user, client } = await createUser(`${role} user`);
	const invite = await owner.request("POST", "/organization/invitations", {
		email: user.email,
		role,
	});
	expect(invite.status).toBe(201);
	await client.request("POST", "/organizations/invitations/accept", { token: invite.json.token });
	client.orgId = orgId;
	return { user, client };
}

async function newOrg() {
	const { user, client } = await createUser("Owner");
	const res = await client.request("POST", "/organizations", { name: "Ads Co" });
	expect(res.status).toBe(201);
	const orgId = res.json.id as string;
	client.orgId = orgId;
	return { owner: client, ownerUser: user, orgId };
}

async function account(
	orgId: string,
	over: Partial<typeof adAccounts.$inferInsert> = {},
): Promise<typeof adAccounts.$inferSelect> {
	const [row] = await db
		.insert(adAccounts)
		.values({
			organizationId: orgId,
			provider: "google_ads",
			externalId: `cust-${crypto.randomUUID()}`,
			name: "Acme Google Ads",
			currency: "EUR",
			accessTokenEnc: tokenCipher.encrypt("platform-token"),
			...over,
		})
		.returning();
	return row as typeof adAccounts.$inferSelect;
}

async function media(orgId: string, status: "ready" | "pending_upload" = "ready") {
	const [row] = await db
		.insert(schema.mediaAssets)
		.values({
			organizationId: orgId,
			storageKey: `${orgId}/${crypto.randomUUID()}.png`,
			fileName: "ad.png",
			mimeType: "image/png",
			kind: "image",
			sizeBytes: 1000,
			status,
		})
		.returning();
	return row?.id as string;
}

const tomorrow = () => new Date(Date.now() + 24 * 3600_000).toISOString();

const campaignBody = (
	adAccountId: string,
	mediaId: string,
	over: Record<string, unknown> = {},
) => ({
	adAccountId,
	name: "Autumn roast",
	objective: "traffic",
	dailyBudget: 20,
	startAt: tomorrow(),
	targeting: { countries: ["ie"] },
	ads: [
		{
			name: "Ad 1",
			format: "image",
			primaryText: "Fresh beans every month",
			headline: "Coffee worth waking up for",
			destinationUrl: "https://acme.example",
			mediaIds: [mediaId],
		},
	],
	declarations: { notPoliticalOrSpecialCategory: true },
	submit: true,
	...over,
});

async function setup() {
	const org = await newOrg();
	const editor = await member(org.owner, org.orgId, "editor");
	const acct = await account(org.orgId);
	const mediaId = await media(org.orgId);
	return { ...org, editor: editor.client, editorUser: editor.user, acct, mediaId };
}

async function setStatus(
	id: string,
	status: (typeof schema.adCampaignStatus.enumValues)[number],
	over = {},
) {
	await db
		.update(adCampaigns)
		.set({ status, ...over })
		.where(eq(adCampaigns.id, id));
}

async function queued(campaignId: string, version: number) {
	return googleQueue.getJob(jobIds.adsWrite(campaignId, version));
}

describe("connect", () => {
	test("providers are listed for every member", async () => {
		const { owner, orgId } = await newOrg();
		const viewer = await member(owner, orgId, "viewer");
		const res = await viewer.client.request("GET", "/ads/providers");
		expect(res.status).toBe(200);
		expect(res.json).toEqual([
			{
				id: "google_ads",
				displayName: "Fake Google Ads",
				configured: true,
				objectives: ["traffic", "sales", "awareness"],
				formats: ["image", "video"],
				textLimits: { primaryText: 125, headline: 40 },
				minDailyBudgetUsd: 5,
			},
			expect.objectContaining({ id: "meta_ads" }),
		]);
	});

	test("OAuth: single-use state, pending selection, encrypted tokens never returned", async () => {
		const { owner, orgId } = await newOrg();
		const editor = await member(owner, orgId, "editor");
		expect((await editor.client.request("POST", "/ads/connect/google_ads")).status).toBe(403);
		expect((await owner.request("POST", "/ads/connect/nope_ads")).status).toBe(404);

		const start = await owner.request("POST", "/ads/connect/google_ads");
		expect(start.status).toBe(200);
		const state = new URL(start.json.url).searchParams.get("state") as string;

		const { app } = await import("#src/app.ts");
		const bad = await app.request("/ads/callback/google_ads?code=c&state=forged");
		expect(bad.status).toBe(302);
		expect(bad.headers.get("location")).toContain("error=connect_expired");

		const cb = await app.request(`/ads/callback/google_ads?code=the-code&state=${state}`);
		expect(cb.status).toBe(302);
		const location = new URL(cb.headers.get("location") as string);
		expect(location.origin + location.pathname).toBe("http://localhost:3000/ads/connect");
		const pendingKey = location.searchParams.get("pending") as string;
		expect(pendingKey).toBeTruthy();
		expect(google.exchanges).toEqual([
			expect.objectContaining({ code: "the-code", codeVerifier: "verifier-1" }),
		]);
		// Nothing readable in Redis: the tokens are sealed.
		const raw = (await redis.get(`ads:pending:${pendingKey}`)) as string;
		expect(raw).not.toContain("secret-access-token");

		// Replayed callback: the state is gone.
		const replay = await app.request(`/ads/callback/google_ads?code=the-code&state=${state}`);
		expect(replay.headers.get("location")).toContain("error=connect_expired");

		const other = await newOrg();
		expect((await other.owner.request("GET", `/ads/pending/${pendingKey}`)).status).toBe(404);

		const pending = await owner.request("GET", `/ads/pending/${pendingKey}`);
		expect(pending.status).toBe(200);
		expect(pending.json).toEqual({
			provider: "google_ads",
			accounts: [
				{
					externalId: "act_1",
					name: "Main",
					currency: "EUR",
					timezone: "Europe/Dublin",
					status: "active",
					alreadyConnected: false,
				},
				expect.objectContaining({ externalId: "act_2", alreadyConnected: false }),
			],
		});

		const created = await owner.request("POST", "/ads/accounts", {
			pendingKey,
			externalIds: ["act_1"],
		});
		expect(created.status).toBe(201);
		expect(JSON.stringify(created.json)).not.toContain("secret");
		expect(created.json).toEqual([
			{
				id: expect.any(String),
				provider: "google_ads",
				name: "Main",
				currency: "EUR",
				timezone: "Europe/Dublin",
				status: "active",
				metadata: {},
				lastError: null,
				identityRequired: [],
				createdAt: expect.any(String),
			},
		]);
		const [row] = await db.select().from(adAccounts).where(eq(adAccounts.id, created.json[0].id));
		expect(row?.accessTokenEnc).not.toContain("secret");
		expect(tokenCipher.decrypt(row?.accessTokenEnc as string)).toBe("secret-access-token");
		expect(tokenCipher.decrypt(row?.refreshTokenEnc as string)).toBe("secret-refresh-token");
		expect(tokenCipher.decrypt(row?.tokenSecretEnc as string)).toBe("secret-token-secret");

		const list = await owner.request("GET", "/ads/accounts");
		expect(list.json).toHaveLength(1);
		expect(JSON.stringify(list.json)).not.toContain("secret");
		// The selection is single-use too.
		const again = await owner.request("POST", "/ads/accounts", {
			pendingKey,
			externalIds: ["act_2"],
		});
		expect(again.status).toBe(410);
	});

	test("OAuth 1.0a callback: oauth_verifier is the code", async () => {
		const { owner } = await newOrg();
		const start = await owner.request("POST", "/ads/connect/google_ads");
		const state = new URL(start.json.url).searchParams.get("state") as string;
		const { app } = await import("#src/app.ts");
		const cb = await app.request(
			`/ads/callback/google_ads?state=${state}&oauth_token=rt&oauth_verifier=v123`,
		);
		expect(cb.headers.get("location")).toContain("pending=");
		expect(google.exchanges[0]?.code).toBe("v123");
	});
});

describe("accounts", () => {
	test("identity metadata: identityRequired, validation per provider, identity pickers", async () => {
		const { owner, orgId } = await newOrg();
		const editor = await member(owner, orgId, "editor");
		const acct = await account(orgId, {
			provider: "meta_ads",
			metadata: {
				accountStatus: 1,
				availablePages: [{ id: "111", name: "Acme Page", instagramUserId: "999" }],
			},
		});
		await createChannel(orgId, "facebook", "Acme on Facebook");

		const list = await owner.request("GET", "/ads/accounts");
		expect(list.json[0]).toMatchObject({ metadata: {}, identityRequired: ["pageId"] });

		const ids = await owner.request("GET", `/ads/accounts/${acct.id}/identities`);
		expect(ids.status).toBe(200);
		const page = ids.json.fields.find((f: { key: string }) => f.key === "pageId");
		expect(page.required).toBe(true);
		expect(page.options).toEqual(expect.arrayContaining([{ value: "111", label: "Acme Page" }]));
		expect(page.options).toHaveLength(2); // the platform's page + the org's Facebook channel
		const pixel = ids.json.fields.find((f: { key: string }) => f.key === "pixelId");
		expect(pixel.options).toBeNull(); // free text

		expect(
			(
				await editor.client.request("PATCH", `/ads/accounts/${acct.id}`, {
					metadata: { pageId: "111" },
				})
			).status,
		).toBe(403);
		const bad = await owner.request("PATCH", `/ads/accounts/${acct.id}`, {
			metadata: { boardId: "1", pageId: "not-a-number" },
		});
		expect(bad.status).toBe(422);
		expect(bad.json.error.code).toBe("invalid_metadata");
		expect(bad.json.error.details.problems).toHaveLength(2);

		const ok = await owner.request("PATCH", `/ads/accounts/${acct.id}`, {
			metadata: { pageId: "111", instagramUserId: "999" },
		});
		expect(ok.status).toBe(200);
		expect(ok.json).toMatchObject({
			metadata: { pageId: "111", instagramUserId: "999" },
			identityRequired: [],
		});
		// Platform metadata stays but is never shown.
		expect(JSON.stringify(ok.json)).not.toContain("availablePages");
		const cleared = await owner.request("PATCH", `/ads/accounts/${acct.id}`, {
			metadata: { instagramUserId: null },
		});
		expect(cleared.json.metadata).toEqual({ pageId: "111" });
	});

	test("disconnect: refused while a campaign exists on the platform", async () => {
		const s = await setup();
		const res = await s.owner.request("POST", "/ads/campaigns", campaignBody(s.acct.id, s.mediaId));
		await setStatus(res.json.id, "paused", { externalId: "cmp-1" });
		const refused = await s.owner.request("DELETE", `/ads/accounts/${s.acct.id}`);
		expect(refused.status).toBe(409);
		expect(refused.json.error.code).toBe("ad_account_in_use");

		await setStatus(res.json.id, "archived");
		expect((await s.editor.request("DELETE", `/ads/accounts/${s.acct.id}`)).status).toBe(403);
		expect((await s.owner.request("DELETE", `/ads/accounts/${s.acct.id}`)).status).toBe(204);
		const [row] = await db.select().from(adAccounts).where(eq(adAccounts.id, s.acct.id));
		expect(row).toMatchObject({
			status: "disconnected",
			accessTokenEnc: "",
			refreshTokenEnc: null,
		});
		expect((await s.owner.request("GET", "/ads/accounts")).json).toEqual([]);
	});

	test("targeting search: provider results, rate limited per organization", async () => {
		const s = await setup();
		const res = await s.editor.request(
			"GET",
			`/ads/accounts/${s.acct.id}/targeting?type=interest&q=coffee`,
		);
		expect(res.status).toBe(200);
		expect(res.json).toEqual([{ id: "6003", name: "Coffee", type: "interest" }]);
		const window = Math.floor(Date.now() / 60_000);
		await redis.set(`ads:targeting:${s.orgId}:${window}`, "30", "EX", 60);
		const limited = await s.editor.request(
			"GET",
			`/ads/accounts/${s.acct.id}/targeting?type=interest&q=coffee`,
		);
		// The window may have rolled over between the two calls; then it is allowed again.
		if (Math.floor(Date.now() / 60_000) === window) {
			expect(limited.status).toBe(429);
			expect(limited.json.error.details.retryAfterSeconds).toBeGreaterThan(0);
		}
	});
});

describe("campaign validation", () => {
	test("draft saves without validation; submit reports every problem at once", async () => {
		const s = await setup();
		const other = await newOrg();
		const foreignMedia = await media(other.orgId);
		const draft = await s.editor.request(
			"POST",
			"/ads/campaigns",
			campaignBody(s.acct.id, foreignMedia, {
				submit: false,
				dailyBudget: 900,
				declarations: undefined,
			}),
		);
		expect(draft.status).toBe(201);
		expect(draft.json).toMatchObject({
			status: "draft",
			provider: "google_ads",
			adAccount: { id: s.acct.id, name: "Acme Google Ads", currency: "EUR" },
			dailyBudget: 900,
			lifetimeBudget: null,
			currency: "EUR",
			error: null,
			spendToDate: 0,
			createdBy: { id: s.editorUser.id, name: "editor user" },
			approvedBy: null,
			source: "human",
		});

		google.problems = ["Headline too long for Google"];
		const submit = await s.editor.request("PATCH", `/ads/campaigns/${draft.json.id}`, {
			submit: true,
		});
		expect(submit.status).toBe(422);
		expect(submit.json.error.code).toBe("ads_invalid");
		const problems: string[] = submit.json.error.details.problems;
		expect(problems).toEqual(
			expect.arrayContaining([
				"Confirm the ad is not political or in a special category",
				"The daily budget of 900 EUR is above the limit of 500 EUR per day",
				"1 media item is not available (deleted, still uploading, or not in this organization)",
			]),
		);
		// The adapter is not asked while media is unresolved.
		expect(problems).not.toContain("Headline too long for Google");
		expect((await s.owner.request("GET", `/ads/campaigns/${draft.json.id}`)).json.status).toBe(
			"draft",
		);

		const fixed = await s.editor.request("PATCH", `/ads/campaigns/${draft.json.id}`, {
			dailyBudget: 50,
			ads: campaignBody(s.acct.id, s.mediaId).ads,
			declarations: { notPoliticalOrSpecialCategory: true },
			submit: true,
		});
		expect(fixed.status).toBe(422);
		expect(fixed.json.error.details.problems).toEqual(["Headline too long for Google"]);
		expect(google.validated.at(-1)?.draft.ads[0]?.media[0]?.url).toContain(s.orgId);
		expect(google.validated.at(-1)?.account).toMatchObject({ currency: "EUR" });

		// A refused submit saves nothing, so the fixes are sent again.
		google.problems = [];
		const ok = await s.editor.request("PATCH", `/ads/campaigns/${draft.json.id}`, {
			dailyBudget: 50,
			ads: campaignBody(s.acct.id, s.mediaId).ads,
			declarations: { notPoliticalOrSpecialCategory: true },
			submit: true,
		});
		expect(ok.status).toBe(200);
		expect(ok.json.status).toBe("pending_approval");
		const detail = await s.owner.request("GET", `/ads/campaigns/${draft.json.id}`);
		expect(detail.json.declarations).toMatchObject({
			notPoliticalOrSpecialCategory: true,
			confirmedBy: { id: s.editorUser.id },
		});
	});

	test("organization ceiling, lifetime budget per day, inactive account, identity, capabilities", async () => {
		const s = await setup();
		expect(
			(await s.owner.request("PATCH", "/ads/settings", { adsMaxDailyBudget: 40 })).status,
		).toBe(200);

		const daily = await s.editor.request(
			"POST",
			"/ads/campaigns",
			campaignBody(s.acct.id, s.mediaId, { dailyBudget: 41 }),
		);
		expect(daily.status).toBe(422);
		expect(daily.json.error.details.problems).toEqual([
			"The daily budget of 41 EUR is above the limit of 40 EUR per day",
		]);

		// 300 over 5 days = 60 a day.
		const lifetime = await s.editor.request(
			"POST",
			"/ads/campaigns",
			campaignBody(s.acct.id, s.mediaId, {
				dailyBudget: undefined,
				lifetimeBudget: 300,
				endAt: new Date(Date.parse(tomorrow()) + 5 * 24 * 3600_000).toISOString(),
			}),
		);
		expect(lifetime.status).toBe(422);
		expect(lifetime.json.error.details.problems[0]).toContain("60 EUR per day");

		const okLifetime = await s.editor.request(
			"POST",
			"/ads/campaigns",
			campaignBody(s.acct.id, s.mediaId, {
				dailyBudget: undefined,
				lifetimeBudget: 150,
				endAt: new Date(Date.parse(tomorrow()) + 5 * 24 * 3600_000).toISOString(),
			}),
		);
		expect(okLifetime.status).toBe(201);

		// Budget shape: exactly one budget, lifetime needs an end.
		const shape = await s.editor.request(
			"POST",
			"/ads/campaigns",
			campaignBody(s.acct.id, s.mediaId, { lifetimeBudget: 10 }),
		);
		expect(shape.status).toBe(422);
		expect(shape.json.error.code).not.toBe("ads_invalid");

		await db.update(adAccounts).set({ status: "needs_reauth" }).where(eq(adAccounts.id, s.acct.id));
		const inactive = await s.editor.request(
			"POST",
			"/ads/campaigns",
			campaignBody(s.acct.id, s.mediaId, {
				objective: "leads",
				ads: [{ ...campaignBody(s.acct.id, s.mediaId).ads[0], format: "carousel" }],
			}),
		);
		expect(inactive.status).toBe(422);
		expect(inactive.json.error.details.problems).toEqual(
			expect.arrayContaining([
				"The ad account needs to be reconnected",
				'Fake Google Ads does not support the "leads" objective',
				"Fake Google Ads does not support carousel ads",
			]),
		);

		const metaAcct = await account(s.orgId, { provider: "meta_ads" });
		const identity = await s.editor.request(
			"POST",
			"/ads/campaigns",
			campaignBody(metaAcct.id, s.mediaId),
		);
		expect(identity.status).toBe(422);
		expect(identity.json.error.details.problems).toContain(
			"Choose the Facebook Page for this ad account first",
		);
	});

	test("unknown or foreign accounts and campaigns are 404", async () => {
		const s = await setup();
		const other = await newOrg();
		const theirs = await account(other.orgId);
		expect(
			(await s.editor.request("POST", "/ads/campaigns", campaignBody(theirs.id, s.mediaId))).status,
		).toBe(404);
		const mine = await s.editor.request(
			"POST",
			"/ads/campaigns",
			campaignBody(s.acct.id, s.mediaId),
		);
		const id = mine.json.id as string;
		for (const [method, path, body] of [
			["GET", `/ads/campaigns/${id}`],
			["PATCH", `/ads/campaigns/${id}`, { name: "x" }],
			["POST", `/ads/campaigns/${id}/approve`],
			["POST", `/ads/campaigns/${id}/activate`, { confirmBudget: 20 }],
			["DELETE", `/ads/campaigns/${id}`],
			["PATCH", `/ads/accounts/${s.acct.id}`, { metadata: {} }],
			["GET", `/ads/accounts/${s.acct.id}/identities`],
		] as const) {
			const res = await other.owner.request(method, path, body);
			expect(res.status).toBe(404);
		}
		const list = await other.owner.request("GET", "/ads/campaigns");
		expect(list.json.items).toEqual([]);
	});
});

describe("approval, activation and the rest of the workflow", () => {
	test("editor submits → pending; admin approves → approved + create job (paused on the platform)", async () => {
		const s = await setup();
		const res = await s.editor.request(
			"POST",
			"/ads/campaigns",
			campaignBody(s.acct.id, s.mediaId),
		);
		expect(res.status).toBe(201);
		expect(res.json.status).toBe("pending_approval");
		const id = res.json.id as string;

		expect((await s.editor.request("POST", `/ads/campaigns/${id}/approve`)).status).toBe(403);
		const approved = await s.owner.request("POST", `/ads/campaigns/${id}/approve`);
		expect(approved.status).toBe(200);
		expect(approved.json).toMatchObject({
			status: "approved",
			approvedBy: { id: s.ownerUser.id },
			approvedAt: expect.any(String),
		});
		const job = await queued(id, 1);
		expect(job?.data).toEqual({
			campaignId: id,
			organizationId: s.orgId,
			version: 1,
			action: "create",
		});
		expect((await s.owner.request("POST", `/ads/campaigns/${id}/approve`)).status).toBe(409);
		// Not editable any more.
		expect(
			(await s.editor.request("PATCH", `/ads/campaigns/${id}`, { name: "Changed" })).status,
		).toBe(409);
	});

	test("an admin's submit is approved at once; editing a pending campaign keeps it pending; reject", async () => {
		const s = await setup();
		const admin = await s.owner.request(
			"POST",
			"/ads/campaigns",
			campaignBody(s.acct.id, s.mediaId),
		);
		expect(admin.json.status).toBe("approved");
		expect(await queued(admin.json.id, 1)).toBeTruthy();

		const pending = await s.editor.request(
			"POST",
			"/ads/campaigns",
			campaignBody(s.acct.id, s.mediaId, { source: "ai" }),
		);
		expect(pending.json.source).toBe("ai");
		const edited = await s.editor.request("PATCH", `/ads/campaigns/${pending.json.id}`, {
			ads: campaignBody(s.acct.id, s.mediaId).ads,
		});
		expect(edited.json).toMatchObject({ status: "pending_approval", source: "human" });

		expect(
			(await s.editor.request("POST", `/ads/campaigns/${pending.json.id}/reject`, { reason: "No" }))
				.status,
		).toBe(403);
		const rejected = await s.owner.request("POST", `/ads/campaigns/${pending.json.id}/reject`, {
			reason: "Wrong audience",
		});
		expect(rejected.json).toMatchObject({ status: "rejected", rejectionReason: "Wrong audience" });
		const resubmitted = await s.editor.request("PATCH", `/ads/campaigns/${pending.json.id}`, {
			submit: true,
		});
		expect(resubmitted.json).toMatchObject({ status: "pending_approval", rejectionReason: null });
	});

	test("activation: admin only, paused only, exact typed budget; then pause and archive", async () => {
		const s = await setup();
		const res = await s.owner.request("POST", "/ads/campaigns", campaignBody(s.acct.id, s.mediaId));
		const id = res.json.id as string;

		const early = await s.owner.request("POST", `/ads/campaigns/${id}/activate`, {
			confirmBudget: 20,
		});
		expect(early.status).toBe(409);
		expect(early.json.error.code).toBe("not_paused");

		// The worker created it (paused).
		await setStatus(id, "paused", { externalId: "cmp-1", version: 2 });
		expect(
			(await s.editor.request("POST", `/ads/campaigns/${id}/activate`, { confirmBudget: 20 }))
				.status,
		).toBe(403);
		const wrong = await s.owner.request("POST", `/ads/campaigns/${id}/activate`, {
			confirmBudget: 200,
		});
		expect(wrong.status).toBe(422);
		expect(wrong.json.error.code).toBe("confirm_mismatch");
		expect(await queued(id, 3)).toBeFalsy();

		const ok = await s.owner.request("POST", `/ads/campaigns/${id}/activate`, {
			confirmBudget: 20.0,
		});
		expect(ok.status).toBe(200);
		// Still paused until the platform confirms; who asked is recorded.
		expect(ok.json).toMatchObject({
			status: "paused",
			activatedBy: { id: s.ownerUser.id },
			activatedAt: expect.any(String),
		});
		expect((await queued(id, 3))?.data).toMatchObject({ action: "activate", version: 3 });

		expect((await s.owner.request("POST", `/ads/campaigns/${id}/pause`)).status).toBe(409);
		await setStatus(id, "active");
		const viewer = await member(s.owner, s.orgId, "viewer");
		expect((await viewer.client.request("POST", `/ads/campaigns/${id}/pause`)).status).toBe(403);
		const paused = await s.editor.request("POST", `/ads/campaigns/${id}/pause`);
		expect(paused.status).toBe(200);
		expect((await queued(id, 4))?.data).toMatchObject({ action: "pause" });

		expect((await s.editor.request("POST", `/ads/campaigns/${id}/archive`)).status).toBe(403);
		const archived = await s.owner.request("POST", `/ads/campaigns/${id}/archive`);
		expect(archived.status).toBe(200);
		expect((await queued(id, 5))?.data).toMatchObject({ action: "archive" });
	});

	test("activation re-checks the ceiling (lowered after approval)", async () => {
		const s = await setup();
		const res = await s.owner.request("POST", "/ads/campaigns", campaignBody(s.acct.id, s.mediaId));
		await setStatus(res.json.id, "paused", { externalId: "cmp-1" });
		await s.owner.request("PATCH", "/ads/settings", { adsMaxDailyBudget: 10 });
		const refused = await s.owner.request("POST", `/ads/campaigns/${res.json.id}/activate`, {
			confirmBudget: 20,
		});
		expect(refused.status).toBe(422);
		expect(refused.json.error.code).toBe("ads_invalid");
	});

	test("retry: failed → approved; unconfirmed needs confirmNotCreated; created ones never twice", async () => {
		const s = await setup();
		const res = await s.owner.request("POST", "/ads/campaigns", campaignBody(s.acct.id, s.mediaId));
		const id = res.json.id as string;
		expect((await s.editor.request("POST", `/ads/campaigns/${id}/retry`, {})).status).toBe(409);

		await setStatus(id, "unconfirmed", { version: 2, errorCode: "outcome_unknown" });
		const needConfirm = await s.editor.request("POST", `/ads/campaigns/${id}/retry`, {});
		expect(needConfirm.status).toBe(409);
		expect(needConfirm.json.error.code).toBe("confirm_required");
		const retried = await s.editor.request("POST", `/ads/campaigns/${id}/retry`, {
			confirmNotCreated: true,
		});
		expect(retried.status).toBe(200);
		expect(retried.json).toMatchObject({ status: "approved", error: null });
		expect((await queued(id, 3))?.data).toMatchObject({ action: "create", version: 3 });

		await setStatus(id, "failed", { externalId: "cmp-9" });
		const twice = await s.editor.request("POST", `/ads/campaigns/${id}/retry`, {});
		expect(twice.json.error.code).toBe("already_created");

		// A failed creation that never reached the platform is archived locally.
		await setStatus(id, "failed", { externalId: null });
		const archived = await s.owner.request("POST", `/ads/campaigns/${id}/archive`);
		expect(archived.json.status).toBe("archived");
	});

	test("delete: drafts and rejected only", async () => {
		const s = await setup();
		const draft = await s.editor.request(
			"POST",
			"/ads/campaigns",
			campaignBody(s.acct.id, s.mediaId, { submit: false }),
		);
		const approved = await s.owner.request(
			"POST",
			"/ads/campaigns",
			campaignBody(s.acct.id, s.mediaId),
		);
		expect((await s.editor.request("DELETE", `/ads/campaigns/${approved.json.id}`)).status).toBe(
			409,
		);
		expect((await s.editor.request("DELETE", `/ads/campaigns/${draft.json.id}`)).status).toBe(204);
		expect((await s.editor.request("GET", `/ads/campaigns/${draft.json.id}`)).status).toBe(404);
	});

	test("list filters and pages; detail carries draft and metrics", async () => {
		const s = await setup();
		const ids: string[] = [];
		for (let i = 0; i < 3; i++) {
			const r = await s.editor.request(
				"POST",
				"/ads/campaigns",
				campaignBody(s.acct.id, s.mediaId, { name: `C${i}`, submit: false }),
			);
			ids.push(r.json.id);
		}
		await setStatus(ids[0] as string, "active", { externalId: "cmp-a" });
		const page1 = await s.editor.request("GET", "/ads/campaigns?limit=2");
		expect(page1.json.items.map((c: { id: string }) => c.id)).toEqual([ids[2], ids[1]]);
		const page2 = await s.editor.request(
			"GET",
			`/ads/campaigns?limit=2&before=${page1.json.nextCursor}`,
		);
		expect(page2.json.items.map((c: { id: string }) => c.id)).toEqual([ids[0]]);
		expect(page2.json.nextCursor).toBeNull();
		const active = await s.editor.request("GET", "/ads/campaigns?status=active");
		expect(active.json.items).toHaveLength(1);

		await db.insert(adCampaignMetricsDaily).values([
			{
				campaignId: ids[0] as string,
				organizationId: s.orgId,
				day: "2026-09-20",
				spend: 10,
				impressions: 1000,
				clicks: 20,
				conversions: 2,
			},
			{
				campaignId: ids[0] as string,
				organizationId: s.orgId,
				day: "2026-09-21",
				spend: 5.5,
				impressions: 500,
				clicks: 5,
			},
		]);
		const detail = await s.editor.request("GET", `/ads/campaigns/${ids[0]}`);
		expect(detail.status).toBe(200);
		expect(detail.json.spendToDate).toBe(15.5);
		expect(detail.json.draft.targeting).toEqual({ countries: ["IE"] });
		expect(detail.json.draft.ads[0].mediaIds).toEqual([s.mediaId]);
		expect(detail.json.metrics.totals).toEqual({
			spend: 15.5,
			impressions: 1500,
			clicks: 25,
			conversions: 2,
			ctr: 0.0167,
			cpc: 0.62,
			cpm: 10.3333,
		});
		expect(detail.json.metrics.daily).toEqual([
			{ date: "2026-09-20", spend: 10, impressions: 1000, clicks: 20, conversions: 2 },
			{ date: "2026-09-21", spend: 5.5, impressions: 500, clicks: 5, conversions: null },
		]);
	});
});

describe("settings & overview", () => {
	test("ceiling: at most the server's; admins only", async () => {
		const s = await setup();
		const initial = await s.editor.request("GET", "/ads/settings");
		expect(initial.json).toEqual({ maxDailyBudget: 500, serverCeiling: 500, orgCeiling: null });
		expect(
			(await s.editor.request("PATCH", "/ads/settings", { adsMaxDailyBudget: 10 })).status,
		).toBe(403);
		const high = await s.owner.request("PATCH", "/ads/settings", { adsMaxDailyBudget: 501 });
		expect(high.status).toBe(422);
		expect(high.json.error.code).toBe("ceiling_too_high");
		const set = await s.owner.request("PATCH", "/ads/settings", { adsMaxDailyBudget: 75.5 });
		expect(set.json).toEqual({ maxDailyBudget: 75.5, serverCeiling: 500, orgCeiling: 75.5 });
		const reset = await s.owner.request("PATCH", "/ads/settings", { adsMaxDailyBudget: null });
		expect(reset.json.maxDailyBudget).toBe(500);
	});

	test("overview groups money by currency and never sums across them", async () => {
		const s = await setup();
		const usdAcct = await account(s.orgId, { currency: "USD", name: "US account" });
		const eur = await s.editor.request(
			"POST",
			"/ads/campaigns",
			campaignBody(s.acct.id, s.mediaId, { submit: false }),
		);
		const usd = await s.editor.request(
			"POST",
			"/ads/campaigns",
			campaignBody(usdAcct.id, s.mediaId, { submit: false }),
		);
		await db.insert(adCampaignMetricsDaily).values([
			{
				campaignId: eur.json.id,
				organizationId: s.orgId,
				day: "2026-09-20",
				spend: 10,
				impressions: 100,
				clicks: 1,
			},
			{
				campaignId: usd.json.id,
				organizationId: s.orgId,
				day: "2026-09-21",
				spend: 7.25,
				impressions: 50,
			},
			{ campaignId: usd.json.id, organizationId: s.orgId, day: "2025-01-01", spend: 999 },
		]);
		const res = await s.editor.request("GET", "/ads/overview?from=2026-09-01&to=2026-09-22");
		expect(res.status).toBe(200);
		expect(res.json.totals).toEqual([
			expect.objectContaining({
				currency: "EUR",
				spend: 10,
				impressions: 100,
				clicks: 1,
				conversions: 0,
			}),
			expect.objectContaining({
				currency: "USD",
				spend: 7.25,
				impressions: 50,
				clicks: 0,
				conversions: 0,
			}),
		]);
		// A zero-filled daily series per currency: every day of the range, in order.
		const [eurTotals, usdTotals] = res.json.totals;
		expect(eurTotals.daily).toHaveLength(22);
		expect(eurTotals.daily[0]).toEqual({
			date: "2026-09-01",
			spend: 0,
			impressions: 0,
			clicks: 0,
			conversions: 0,
		});
		expect(eurTotals.daily.at(-1).date).toBe("2026-09-22");
		expect(eurTotals.daily.find((d: { date: string }) => d.date === "2026-09-20")).toEqual({
			date: "2026-09-20",
			spend: 10,
			impressions: 100,
			clicks: 1,
			conversions: 0,
		});
		expect(usdTotals.daily.find((d: { date: string }) => d.date === "2026-09-20").spend).toBe(0);
		expect(usdTotals.daily.find((d: { date: string }) => d.date === "2026-09-21").spend).toBe(7.25);
		expect(res.json.byProvider).toEqual([
			{
				provider: "google_ads",
				currency: "EUR",
				spend: 10,
				impressions: 100,
				clicks: 1,
				conversions: 0,
			},
			{
				provider: "google_ads",
				currency: "USD",
				spend: 7.25,
				impressions: 50,
				clicks: 0,
				conversions: 0,
			},
		]);
		expect(res.json.byCampaign.map((c: { campaignId: string }) => c.campaignId)).toEqual([
			eur.json.id,
			usd.json.id,
		]);
		expect(res.json.currencyNote).toContain("per currency");
		expect(
			(await s.editor.request("GET", "/ads/overview?from=2024-01-01&to=2026-01-01")).status,
		).toBe(400);
	});
});

describe("AI copy", () => {
	test("copy for the account's platform, metered as ad_copy with research context", async () => {
		const s = await setup();
		const text = new FakeTextModel().reply({
			variants: [
				{
					primaryText: "Freshly roasted beans, delivered monthly.",
					headline: "Coffee worth waking up for",
					description: "Roasted in Leeds",
					callToAction: "shop_now",
				},
			],
			targetingSuggestions: {
				countries: ["IE"],
				ageMin: 25,
				ageMax: 54,
				interests: ["Coffee"],
				keywords: ["coffee subscription"],
			},
		});
		ai.text = text;
		await db.insert(schema.researchRuns).values({
			organizationId: s.orgId,
			startUrl: "https://acme.example",
			status: "succeeded",
			insights: {
				valueProposition: "Roasted to order",
				audience: "home baristas",
				buyerQuestions: ["How fresh are the beans?"],
			},
		});
		const viewer = await member(s.owner, s.orgId, "viewer");
		const body = {
			adAccountId: s.acct.id,
			objective: "sales",
			product: "Monthly coffee subscription",
			destinationUrl: "https://acme.example/subscribe",
			format: "image",
			variants: 1,
		};
		expect((await viewer.client.request("POST", "/ads/copy", body)).status).toBe(403);
		const res = await s.editor.request("POST", "/ads/copy", body);
		expect(res.status).toBe(200);
		expect(res.json).toEqual({
			variants: [
				{
					primaryText: "Freshly roasted beans, delivered monthly.",
					headline: "Coffee worth waking up for",
					description: "Roasted in Leeds",
					callToAction: "shop_now",
				},
			],
			targetingSuggestions: {
				countries: ["IE"],
				ageMin: 25,
				ageMax: 54,
				interests: ["Coffee"],
				keywords: ["coffee subscription"],
			},
			generationId: expect.any(String),
		});
		expect(text.requests[0]?.prompt).toContain("Google Ads");
		expect(text.requests[0]?.prompt).toContain("Roasted to order");
		const [gen] = await db
			.select()
			.from(schema.aiGenerations)
			.where(eq(schema.aiGenerations.id, res.json.generationId));
		expect(gen).toMatchObject({ kind: "ad_copy", status: "succeeded", organizationId: s.orgId });

		ai.text = null;
		expect((await s.editor.request("POST", "/ads/copy", body)).status).toBe(503);
	});
});

describe("admin", () => {
	test("overview has an additive ads section; queues include the ads queues", async () => {
		const s = await setup();
		await db
			.update(schema.users)
			.set({ platformRole: "admin" })
			.where(eq(schema.users.id, s.ownerUser.id));
		const overview = await s.owner.request("GET", "/admin/overview");
		expect(overview.status).toBe(200);
		expect(overview.json.ads).toEqual({
			accounts: expect.any(Number),
			campaignsActive: expect.any(Number),
			spend7dByCurrency: expect.any(Object),
			unconfirmed: expect.any(Number),
		});
		const queues = await s.owner.request("GET", "/admin/queues");
		const names = queues.json.queues.map((q: { name: string }) => q.name);
		expect(names).toContain("ads");
	});
});
