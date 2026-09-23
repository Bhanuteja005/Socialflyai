import { createGoogleAdsProvider, type GoogleAdsEnv } from "./google-ads";
import { createLinkedInAdsProvider, type LinkedInAdsEnv } from "./linkedin-ads";
import { createMetaAdsProvider, type MetaAdsEnv } from "./meta-ads";
import { createPinterestAdsProvider, type PinterestAdsEnv } from "./pinterest";
import { createTikTokAdsProvider, type TikTokAdsEnv } from "./tiktok";
import type { AdsProvider, AdsProviderId } from "./types";
import { createXAdsProvider, type XAdsEnv } from "./x-ads";

/**
 * Every ad platform's credentials. Callers pass their validated env (the api and
 * worker envs include `adsEnv` and `integrationsEnv`); this package never reads
 * process.env. Meta and LinkedIn reuse the organic apps' credentials.
 */
export type AdsRegistryEnv = MetaAdsEnv &
	GoogleAdsEnv &
	LinkedInAdsEnv &
	TikTokAdsEnv &
	PinterestAdsEnv &
	XAdsEnv;

export type AdsRegistry = {
	/** Every ad platform known to the codebase (configured or not). */
	all(): AdsProvider[];
	/** Platforms with credentials present — what the "connect an ad account" screen shows. */
	available(): AdsProvider[];
	get(id: string): AdsProvider | undefined;
};

export function createAdsRegistry(env: AdsRegistryEnv): AdsRegistry {
	const providers: AdsProvider[] = [
		createMetaAdsProvider(env),
		createGoogleAdsProvider(env),
		createLinkedInAdsProvider(env),
		createTikTokAdsProvider(env),
		createPinterestAdsProvider(env),
		createXAdsProvider(env),
	];
	const byId = new Map<AdsProviderId, AdsProvider>(providers.map((p) => [p.id, p]));
	return {
		all: () => [...byId.values()],
		available: () => [...byId.values()].filter((p) => p.isConfigured()),
		get: (id) => byId.get(id as AdsProviderId),
	};
}
