import type { AdsProvider } from "@socialfly/integrations";

/**
 * What the ads code needs from a registry of ads adapters. Deliberately the smallest
 * surface (`all` + `get`) so both the real registry from @socialfly/integrations and the
 * fake one the tests build satisfy it.
 */
export interface AdsProviders {
	all(): AdsProvider[];
	get(id: string): AdsProvider | undefined;
}

/** A plain list of adapters; used by tests and as the fallback when no registry is wired. */
export class AdsProviderList implements AdsProviders {
	private readonly byId: Map<string, AdsProvider>;

	constructor(providers: AdsProvider[]) {
		this.byId = new Map(providers.map((p) => [p.id, p]));
	}

	all() {
		return [...this.byId.values()];
	}

	get(id: string) {
		return this.byId.get(id);
	}
}

/** The adapter for a provider id when it is configured on this server, else null. */
export const configuredAdsProvider = (providers: AdsProviders, id: string) => {
	const provider = providers.get(id);
	return provider?.isConfigured() ? provider : null;
};
