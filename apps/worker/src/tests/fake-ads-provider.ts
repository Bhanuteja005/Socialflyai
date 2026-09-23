import type {
	AdsCapabilities,
	AdsContext,
	AdsProvider,
	CampaignDraft,
	CampaignInsightsDay,
	CreatedCampaign,
	TokenSet,
} from "@socialfly/integrations";

type PlatformStatus = Awaited<ReturnType<AdsProvider["getCampaignStatus"]>>;

/**
 * A scripted ad platform. Each mutating call consumes the next queued error (none left
 * = success) and every call is recorded, so tests can assert exactly what the "platform"
 * was asked to do — above all, that nothing was ever set active unasked.
 */
export class FakeAdsProvider implements AdsProvider {
	readonly id = "meta_ads" as const;
	readonly displayName = "Fake Meta Ads";
	readonly capabilities: AdsCapabilities = {
		objectives: ["traffic", "sales", "awareness"],
		formats: ["image", "video"],
		minDailyBudgetUsd: 1,
		maxAdsPerCampaign: 5,
		textLimits: { primaryText: 125, headline: 40 },
	};
	readonly scopes = ["ads_management"];
	readonly writeRateLimit = { max: 100, durationMs: 1000 };

	createErrors: Error[] = [];
	statusErrors: Error[] = [];
	readErrors: Error[] = [];
	problems: string[] = [];
	created: { token: string; draft: CampaignDraft }[] = [];
	statusCalls: { id: string; status: "active" | "paused" | "archive" }[] = [];
	platformStatus = new Map<string, PlatformStatus>();
	insights: CampaignInsightsDay[] = [];
	refreshCalls = 0;
	private counter = 0;

	isConfigured() {
		return true;
	}

	async getAuthorizationUrl() {
		return { url: "https://ads.example/oauth" };
	}

	async exchangeCode(): Promise<{ tokens: TokenSet; accounts: [] }> {
		return { tokens: { accessToken: "t", scopes: [] }, accounts: [] };
	}

	async refreshTokens(): Promise<TokenSet> {
		this.refreshCalls++;
		return {
			accessToken: `refreshed-${this.refreshCalls}`,
			refreshToken: `refresh-${this.refreshCalls}`,
			expiresAt: new Date(Date.now() + 3600_000),
			scopes: [],
		};
	}

	validate() {
		return [...this.problems];
	}

	async createCampaign(ctx: AdsContext, draft: CampaignDraft): Promise<CreatedCampaign> {
		this.created.push({ token: ctx.accessToken, draft });
		const error = this.createErrors.shift();
		if (error) throw error;
		const id = `cmp-${++this.counter}`;
		this.platformStatus.set(id, "paused");
		return {
			campaignExternalId: id,
			objects: [
				{ type: "ad_set", externalId: `${id}-set` },
				{ type: "ad", externalId: `${id}-ad` },
			],
			status: "paused",
			manageUrl: `https://ads.example/manage/${id}`,
		};
	}

	async setStatus(_ctx: AdsContext, id: string, status: "active" | "paused") {
		this.statusCalls.push({ id, status });
		const error = this.statusErrors.shift();
		if (error) throw error;
		this.platformStatus.set(id, status);
	}

	async archiveCampaign(_ctx: AdsContext, id: string) {
		this.statusCalls.push({ id, status: "archive" });
		const error = this.statusErrors.shift();
		if (error) throw error;
		this.platformStatus.set(id, "archived");
	}

	async getCampaignStatus(_ctx: AdsContext, id: string): Promise<PlatformStatus> {
		const error = this.readErrors.shift();
		if (error) throw error;
		return this.platformStatus.get(id) ?? "deleted";
	}

	async getInsights(
		_ctx: AdsContext,
		input: { campaignExternalIds: string[] },
	): Promise<CampaignInsightsDay[]> {
		const error = this.readErrors.shift();
		if (error) throw error;
		return this.insights.filter((d) => input.campaignExternalIds.includes(d.campaignExternalId));
	}
}
