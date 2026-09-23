import { z } from "zod";
import { ProviderError } from "../errors";
import { expiresAtFrom, fetchMediaBytes, form, providerFetch, providerJson } from "../http";
import type {
	Capabilities,
	ChannelContext,
	ConnectResult,
	DiscoveredAccount,
	MediaItem,
	PublishInput,
	PublishOutcome,
	SocialProvider,
	TokenSet,
} from "../types";

/**
 * LinkedIn — personal profiles (`linkedin`) and company pages (`linkedin_page`).
 *
 * Uses the VERSIONED REST API (`/rest/*` + `LinkedIn-Version` header). The old
 * system used the legacy v2 UGC endpoints, which LinkedIn is retiring.
 *
 * Two providers because they need different app products: profile posting needs
 * "Share on LinkedIn" (w_member_social); page posting needs the separately
 * approved Community Management API (w_organization_social + rw_organization_admin).
 * An app without that approval still gets working profile posting.
 *
 * Docs: https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api
 */

export type LinkedInConfig = { clientId: string; clientSecret: string; apiVersion: string };

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const API = "https://api.linkedin.com";

const capabilities: Capabilities = {
	maxTextLength: 3000,
	requiresText: true,
	requiresMedia: false,
	maxImages: 20,
	maxVideos: 1,
	mixedMedia: false,
	imageMimeTypes: ["image/jpeg", "image/png", "image/gif"],
	videoMimeTypes: ["video/mp4"],
	maxImageBytes: 8 * 1024 * 1024,
	maxVideoBytes: 5 * 1024 * 1024 * 1024,
	maxVideoDurationSeconds: 30 * 60,
};

const settingsSchema = z.object({
	visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC"),
});
type Settings = z.infer<typeof settingsSchema>;

/**
 * LinkedIn "little text" treats these characters as markup; unescaped, a post
 * containing "(" or "#" is truncated or rejected. Escape them all.
 * https://learn.microsoft.com/linkedin/marketing/community-management/shares/little-text-format
 */
export const escapeLittleText = (text: string) =>
	text.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);

type TokenResponse = {
	access_token: string;
	expires_in: number;
	refresh_token?: string;
	refresh_token_expires_in?: number;
	scope?: string;
};

abstract class LinkedInBase implements SocialProvider<Settings> {
	abstract readonly id: "linkedin" | "linkedin_page";
	abstract readonly displayName: string;
	protected abstract readonly scopes: string[];
	readonly capabilities = capabilities;
	readonly settingsSchema = settingsSchema as z.ZodType<Settings>;
	// LinkedIn's app-level daily limits are generous; per-member limit is ~150 posts/day.
	readonly publishRateLimit = { max: 10, durationMs: 60_000 };

	constructor(protected readonly config: LinkedInConfig) {}

	isConfigured() {
		return Boolean(this.config.clientId && this.config.clientSecret);
	}

	protected headers(accessToken: string, json = true): Record<string, string> {
		return {
			Authorization: `Bearer ${accessToken}`,
			"LinkedIn-Version": this.config.apiVersion,
			"X-Restli-Protocol-Version": "2.0.0",
			...(json ? { "Content-Type": "application/json" } : {}),
		};
	}

	async getAuthorizationUrl({ redirectUri, state }: { redirectUri: string; state: string }) {
		const url = new URL(AUTH_URL);
		url.search = form({
			response_type: "code",
			client_id: this.config.clientId,
			redirect_uri: redirectUri,
			state,
			scope: this.scopes.join(" "),
		});
		return { url: url.toString() };
	}

	protected toTokens(t: TokenResponse): TokenSet {
		return {
			accessToken: t.access_token,
			refreshToken: t.refresh_token ?? null,
			expiresAt: expiresAtFrom(t.expires_in),
			scopes: t.scope?.split(/[ ,]/).filter(Boolean) ?? this.scopes,
		};
	}

	protected async requestToken(params: Record<string, string>) {
		return providerJson<TokenResponse>(this.id, TOKEN_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: form({
				...params,
				client_id: this.config.clientId,
				client_secret: this.config.clientSecret,
			}),
		});
	}

	async exchangeCode({
		code,
		redirectUri,
	}: {
		code: string;
		redirectUri: string;
	}): Promise<ConnectResult> {
		const tokens = this.toTokens(
			await this.requestToken({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
			}),
		);
		return { tokens, accounts: await this.discoverAccounts(tokens.accessToken) };
	}

	/**
	 * Only apps in LinkedIn's partner programme receive refresh tokens; everyone else
	 * gets a 60-day access token and the user reconnects. `exchangeCode` returns
	 * `refreshToken: null` in that case and the worker never schedules a refresh.
	 */
	async refreshTokens(refreshToken: string): Promise<TokenSet> {
		return this.toTokens(
			await this.requestToken({ grant_type: "refresh_token", refresh_token: refreshToken }),
		);
	}

	protected abstract discoverAccounts(accessToken: string): Promise<DiscoveredAccount[]>;
	protected abstract authorUrn(channel: ChannelContext): string;

	async publish(channel: ChannelContext, input: PublishInput<Settings>): Promise<PublishOutcome> {
		const owner = this.authorUrn(channel);
		const content = await this.uploadMedia(channel, owner, input.media);

		const res = await providerFetch(this.id, `${API}/rest/posts`, {
			method: "POST",
			mutating: true,
			headers: this.headers(channel.accessToken),
			body: JSON.stringify({
				author: owner,
				commentary: escapeLittleText(input.text),
				visibility: input.settings.visibility,
				distribution: {
					feedDistribution: "MAIN_FEED",
					targetEntities: [],
					thirdPartyDistributionChannels: [],
				},
				lifecycleState: "PUBLISHED",
				isReshareDisabledByAuthor: false,
				...(content ? { content } : {}),
			}),
		});

		// The post URN comes back in a header, not the body.
		const urn = res.headers.get("x-restli-id");
		if (!urn) {
			throw new ProviderError(
				"unknown_outcome",
				this.id,
				"LinkedIn accepted the post but returned no id",
			);
		}
		return {
			status: "published",
			externalId: urn,
			url: `https://www.linkedin.com/feed/update/${urn}/`,
		};
	}

	private async uploadMedia(channel: ChannelContext, owner: string, media: MediaItem[]) {
		if (media.length === 0) return undefined;
		const video = media.find((m) => m.kind === "video");
		if (video) {
			return { media: { id: await this.uploadVideo(channel, owner, video) } };
		}
		const ids: string[] = [];
		for (const image of media) ids.push(await this.uploadImage(channel, owner, image));
		const [first] = ids;
		return ids.length === 1 && first
			? { media: { id: first, altText: media[0]?.altText ?? undefined } }
			: {
					multiImage: {
						images: ids.map((id, i) => ({ id, altText: media[i]?.altText ?? undefined })),
					},
				};
	}

	private async uploadImage(
		channel: ChannelContext,
		owner: string,
		image: MediaItem,
	): Promise<string> {
		const init = await providerJson<{ value: { uploadUrl: string; image: string } }>(
			this.id,
			`${API}/rest/images?action=initializeUpload`,
			{
				method: "POST",
				headers: this.headers(channel.accessToken),
				body: JSON.stringify({ initializeUploadRequest: { owner } }),
			},
		);
		await providerFetch(this.id, init.value.uploadUrl, {
			method: "PUT",
			headers: { Authorization: `Bearer ${channel.accessToken}`, "Content-Type": image.mimeType },
			body: await fetchMediaBytes(this.id, image.url),
			timeoutMs: 120_000,
		});
		return init.value.image;
	}

	/** Multi-part upload: LinkedIn hands back byte ranges; each PUT returns an ETag we must echo on finalize. */
	private async uploadVideo(
		channel: ChannelContext,
		owner: string,
		video: MediaItem,
	): Promise<string> {
		const bytes = await fetchMediaBytes(this.id, video.url);
		const init = await providerJson<{
			value: {
				video: string;
				uploadToken: string;
				uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[];
			};
		}>(this.id, `${API}/rest/videos?action=initializeUpload`, {
			method: "POST",
			headers: this.headers(channel.accessToken),
			body: JSON.stringify({
				initializeUploadRequest: {
					owner,
					fileSizeBytes: bytes.byteLength,
					uploadCaptions: false,
					uploadThumbnail: false,
				},
			}),
		});

		const partIds: string[] = [];
		for (const part of init.value.uploadInstructions) {
			const res = await providerFetch(this.id, part.uploadUrl, {
				method: "PUT",
				headers: { "Content-Type": "application/octet-stream" },
				body: bytes.subarray(part.firstByte, part.lastByte + 1),
				timeoutMs: 300_000,
			});
			const etag = res.headers.get("etag");
			if (!etag)
				throw new ProviderError(
					"transient",
					this.id,
					"LinkedIn video part upload returned no ETag",
				);
			partIds.push(etag);
		}

		await providerFetch(this.id, `${API}/rest/videos?action=finalizeUpload`, {
			method: "POST",
			headers: this.headers(channel.accessToken),
			body: JSON.stringify({
				finalizeUploadRequest: {
					video: init.value.video,
					uploadToken: init.value.uploadToken,
					uploadedPartIds: partIds,
				},
			}),
		});
		return init.value.video;
	}
}

export class LinkedInProfileProvider extends LinkedInBase {
	readonly id = "linkedin" as const;
	readonly displayName = "LinkedIn";
	protected readonly scopes = ["openid", "profile", "email", "w_member_social"];

	protected async discoverAccounts(accessToken: string): Promise<DiscoveredAccount[]> {
		const me = await providerJson<{ sub: string; name: string; picture?: string }>(
			this.id,
			`${API}/v2/userinfo`,
			{ headers: { Authorization: `Bearer ${accessToken}` } },
		);
		return [{ externalId: me.sub, name: me.name, avatarUrl: me.picture ?? null }];
	}

	protected authorUrn(channel: ChannelContext) {
		return `urn:li:person:${channel.externalId}`;
	}
}

export class LinkedInPageProvider extends LinkedInBase {
	readonly id = "linkedin_page" as const;
	readonly displayName = "LinkedIn Page";
	protected readonly scopes = [
		"w_organization_social",
		"r_organization_social",
		"rw_organization_admin",
	];

	/** Every organization the member administers; the user picks which to connect. */
	protected async discoverAccounts(accessToken: string): Promise<DiscoveredAccount[]> {
		const acls = await providerJson<{ elements: { organization: string }[] }>(
			this.id,
			`${API}/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`,
			{ headers: this.headers(accessToken, false) },
		);
		return Promise.all(
			acls.elements.map(async ({ organization }) => {
				const id = organization.split(":").pop() ?? organization;
				const org = await providerJson<{ localizedName: string; vanityName?: string }>(
					this.id,
					`${API}/rest/organizations/${id}`,
					{ headers: this.headers(accessToken, false) },
				);
				return {
					externalId: id,
					name: org.localizedName,
					username: org.vanityName ?? null,
					profileUrl: org.vanityName ? `https://www.linkedin.com/company/${org.vanityName}` : null,
				};
			}),
		);
	}

	protected authorUrn(channel: ChannelContext) {
		return `urn:li:organization:${channel.externalId}`;
	}
}
