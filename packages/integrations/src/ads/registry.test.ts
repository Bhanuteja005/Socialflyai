import { describe, expect, test } from "bun:test";
import { type AdsRegistryEnv, createAdsRegistry } from "./registry";

const empty: AdsRegistryEnv = {
	META_APP_ID: "",
	META_APP_SECRET: "",
	META_GRAPH_VERSION: "v24.0",
	GOOGLE_ADS_CLIENT_ID: "",
	GOOGLE_ADS_CLIENT_SECRET: "",
	GOOGLE_ADS_DEVELOPER_TOKEN: "",
	GOOGLE_ADS_LOGIN_CUSTOMER_ID: "",
	GOOGLE_ADS_API_VERSION: "v23",
	LINKEDIN_CLIENT_ID: "",
	LINKEDIN_CLIENT_SECRET: "",
	LINKEDIN_API_VERSION: "202609",
	TIKTOK_ADS_APP_ID: "",
	TIKTOK_ADS_APP_SECRET: "",
	PINTEREST_APP_ID: "",
	PINTEREST_APP_SECRET: "",
	X_ADS_CONSUMER_KEY: "",
	X_ADS_CONSUMER_SECRET: "",
};

describe("createAdsRegistry", () => {
	test("knows every ad platform; unconfigured ones are hidden", () => {
		const registry = createAdsRegistry(empty);
		expect(registry.all().map((p) => p.id)).toEqual([
			"meta_ads",
			"google_ads",
			"linkedin_ads",
			"tiktok_ads",
			"pinterest_ads",
			"x_ads",
		]);
		expect(registry.available()).toEqual([]);
		expect(registry.get("google_ads")?.displayName).toBe("Google Ads");
		expect(registry.get("nope")).toBeUndefined();
	});

	test("Google needs the developer token on top of OAuth credentials", () => {
		const oauthOnly = createAdsRegistry({
			...empty,
			GOOGLE_ADS_CLIENT_ID: "id",
			GOOGLE_ADS_CLIENT_SECRET: "secret",
		});
		expect(oauthOnly.get("google_ads")?.isConfigured()).toBe(false);
		const full = createAdsRegistry({
			...empty,
			GOOGLE_ADS_CLIENT_ID: "id",
			GOOGLE_ADS_CLIENT_SECRET: "secret",
			GOOGLE_ADS_DEVELOPER_TOKEN: "dev",
			META_APP_ID: "a",
			META_APP_SECRET: "b",
		});
		expect(full.available().map((p) => p.id)).toEqual(["meta_ads", "google_ads"]);
	});
});
