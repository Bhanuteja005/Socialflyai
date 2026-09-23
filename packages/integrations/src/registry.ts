import { LinkedInPageProvider, LinkedInProfileProvider } from "./providers/linkedin";
import { FacebookProvider, InstagramProvider } from "./providers/meta";
import { RedditProvider } from "./providers/reddit";
import { ThreadsProvider } from "./providers/threads";
import { XProvider } from "./providers/x";
import { YouTubeProvider } from "./providers/youtube";
import type { ProviderId, SocialProvider } from "./types";

/**
 * App credentials for every platform. Callers pass their validated env; this
 * package never reads process.env itself, which keeps it testable.
 */
export type IntegrationsConfig = {
	LINKEDIN_CLIENT_ID: string;
	LINKEDIN_CLIENT_SECRET: string;
	LINKEDIN_API_VERSION: string;
	META_APP_ID: string;
	META_APP_SECRET: string;
	META_GRAPH_VERSION: string;
	THREADS_APP_ID: string;
	THREADS_APP_SECRET: string;
	X_CLIENT_ID: string;
	X_CLIENT_SECRET: string;
	REDDIT_CLIENT_ID: string;
	REDDIT_CLIENT_SECRET: string;
	REDDIT_USER_AGENT: string;
	YOUTUBE_CLIENT_ID: string;
	YOUTUBE_CLIENT_SECRET: string;
};

export class ProviderRegistry {
	private readonly byId: Map<ProviderId, SocialProvider>;

	constructor(providers: SocialProvider[]) {
		this.byId = new Map(providers.map((p) => [p.id, p]));
	}

	/** Every provider known to the codebase (configured or not). */
	all(): SocialProvider[] {
		return [...this.byId.values()];
	}

	/** Providers with credentials present — what the "connect a channel" screen shows. */
	available(): SocialProvider[] {
		return this.all().filter((p) => p.isConfigured());
	}

	get(id: string): SocialProvider | undefined {
		return this.byId.get(id as ProviderId);
	}

	/** For callers that already validated the id (e.g. a channel row). */
	require(id: string): SocialProvider {
		const provider = this.get(id);
		if (!provider) throw new Error(`Unknown provider "${id}"`);
		return provider;
	}
}

export function createProviderRegistry(config: IntegrationsConfig): ProviderRegistry {
	const linkedin = {
		clientId: config.LINKEDIN_CLIENT_ID,
		clientSecret: config.LINKEDIN_CLIENT_SECRET,
		apiVersion: config.LINKEDIN_API_VERSION,
	};
	const meta = {
		appId: config.META_APP_ID,
		appSecret: config.META_APP_SECRET,
		graphVersion: config.META_GRAPH_VERSION,
	};
	return new ProviderRegistry([
		new LinkedInProfileProvider(linkedin),
		new LinkedInPageProvider(linkedin),
		new FacebookProvider(meta),
		new InstagramProvider(meta),
		new ThreadsProvider({ appId: config.THREADS_APP_ID, appSecret: config.THREADS_APP_SECRET }),
		new XProvider({ clientId: config.X_CLIENT_ID, clientSecret: config.X_CLIENT_SECRET }),
		new RedditProvider({
			clientId: config.REDDIT_CLIENT_ID,
			clientSecret: config.REDDIT_CLIENT_SECRET,
			userAgent: config.REDDIT_USER_AGENT,
		}),
		new YouTubeProvider({
			clientId: config.YOUTUBE_CLIENT_ID,
			clientSecret: config.YOUTUBE_CLIENT_SECRET,
		}),
		// PROVIDERS:REGISTER — additional platforms are registered here.
	] as SocialProvider[]);
}
