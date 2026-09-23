import type {
	ChannelContext,
	PublishOutcome,
	SocialProvider,
	TokenSet,
} from "@socialfly/integrations";
import { z } from "zod";

type Step = PublishOutcome | Error;

/**
 * A scripted platform: each publish/checkStatus call consumes the next step
 * (an outcome to return or an error to throw). Records every call, so tests can
 * assert how many times the "platform" was actually hit.
 */
export class FakeProvider implements SocialProvider {
	readonly id = "linkedin" as const;
	readonly displayName = "Fake LinkedIn";
	readonly capabilities = {
		maxTextLength: 280,
		requiresText: true,
		requiresMedia: false,
		maxImages: 4,
		maxVideos: 1,
		mixedMedia: false,
		imageMimeTypes: ["image/png"],
		videoMimeTypes: ["video/mp4"],
		maxImageBytes: 5_000_000,
		maxVideoBytes: 50_000_000,
	};
	readonly settingsSchema = z.object({}).passthrough() as unknown as z.ZodType<
		Record<string, unknown>
	>;
	readonly publishRateLimit = { max: 100, durationMs: 1000 };

	publishSteps: Step[] = [];
	statusSteps: Step[] = [];
	publishCalls: { token: string; text: string }[] = [];
	statusCalls = 0;
	refreshCalls = 0;

	isConfigured() {
		return true;
	}
	async getAuthorizationUrl() {
		return { url: "https://fake.example/oauth" };
	}
	async exchangeCode() {
		return { tokens: { accessToken: "a", scopes: [] }, accounts: [] };
	}
	async refreshTokens(): Promise<TokenSet> {
		this.refreshCalls++;
		return {
			accessToken: `refreshed-${this.refreshCalls}`,
			refreshToken: `rotated-${this.refreshCalls}`,
			expiresAt: new Date(Date.now() + 3600_000),
			scopes: [],
		};
	}
	async publish(channel: ChannelContext, input: { text: string }): Promise<PublishOutcome> {
		this.publishCalls.push({ token: channel.accessToken, text: input.text });
		return this.next(this.publishSteps);
	}
	async checkStatus(): Promise<PublishOutcome> {
		this.statusCalls++;
		return this.next(this.statusSteps);
	}
	private next(steps: Step[]): PublishOutcome {
		const step = steps.shift();
		if (!step) throw new Error("FakeProvider: no scripted step left");
		if (step instanceof Error) throw step;
		return step;
	}
}
