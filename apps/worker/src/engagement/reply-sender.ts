import type { Logger } from "@socialfly/core/logger";
import { getMeter } from "@socialfly/core/telemetry";
import { type Database, eq, schema } from "@socialfly/db";
import type { ChannelContext, EngagementItem, ProviderRegistry } from "@socialfly/integrations";
import type { EngagementReplyJob, JobProducer } from "@socialfly/queue";
import { ChannelNeedsReauthError, type ChannelTokens } from "#src/channels/channel-tokens.ts";
import { decide } from "#src/publishing/retry-policy.ts";
import type { ReplyRow, ReplyState } from "./reply-state.ts";
import { missingScopes } from "./scopes.ts";

const { engagementItems, channels, organizations } = schema;

export type ReplySenderDeps = {
	db: Database;
	providers: ProviderRegistry;
	tokens: ChannelTokens;
	state: ReplyState;
	jobs: JobProducer;
	logger: Logger;
};

const meter = getMeter("engagement");
const outcomes = meter.createCounter("socialfly.engagement.replies", {
	description: "Reply send attempts by provider and outcome",
});

/**
 * A discussion found by listening is a public post, not addressed to us: answering it
 * is a top-level reply to that post, which is what adapters do for a mention.
 */
const replyKind = (kind: string): EngagementItem["kind"] =>
	kind === "comment" || kind === "reply" ? kind : "mention";

/**
 * Sends approved replies, exactly once. A reply is a public post in the brand's name,
 * so the publishing engine's invariants apply unchanged:
 *  1. Never send twice. Ownership is a conditional claim (ReplyState.claim), BullMQ
 *     gives each job one attempt, and a call whose outcome is unknown becomes
 *     `unconfirmed` — never retried automatically.
 *  2. Never lose one. Every path ends sent, failed, unconfirmed or requeued.
 *  3. Send what is current: text, item and channel are re-read and re-checked here.
 */
export class ReplySender {
	constructor(private readonly deps: ReplySenderDeps) {}

	async send(job: EngagementReplyJob): Promise<void> {
		const { state, logger } = this.deps;
		const reply = await state.claim(job.replyId, job.version);
		if (!reply) {
			// Edited back to draft, retried under a newer version, or another job already won.
			logger.debug({ replyId: job.replyId, version: job.version }, "stale reply job skipped");
			return;
		}
		const log = logger.child({ replyId: reply.id, itemId: reply.itemId, attempt: reply.attempts });

		const [row] = await this.deps.db
			.select({ item: engagementItems, channel: channels, orgDeletedAt: organizations.deletedAt })
			.from(engagementItems)
			.innerJoin(channels, eq(channels.id, engagementItems.channelId))
			.innerJoin(organizations, eq(organizations.id, engagementItems.organizationId))
			.where(eq(engagementItems.id, reply.itemId))
			.limit(1);
		if (!row || row.orgDeletedAt)
			return state.failed(reply, "item_missing", "The item was deleted");
		const { item, channel } = row;
		if (channel.status !== "active") {
			return state.failed(
				reply,
				"channel_unavailable",
				channel.status === "needs_reauth"
					? "The channel needs to be reconnected"
					: "The channel was disconnected",
			);
		}
		const provider = this.deps.providers.get(channel.provider);
		const engagement = provider?.isConfigured() ? provider.engagement : undefined;
		if (!provider || !engagement) {
			return state.failed(
				reply,
				"provider_unsupported",
				`Replying on ${channel.provider} is not supported`,
			);
		}
		const missing = missingScopes(channel.scopes, engagement.requiredScopes.reply);
		if (missing.length > 0) {
			return state.failed(
				reply,
				"missing_scopes",
				"Reconnect the channel to allow SocialFly to reply on your behalf",
			);
		}
		if ([...reply.text].length > engagement.maxReplyLength) {
			return state.failed(
				reply,
				"text_too_long",
				`Replies on ${provider.displayName} can be at most ${engagement.maxReplyLength} characters`,
			);
		}

		let sent = false;
		let alreadyRefreshed = false;
		for (;;) {
			try {
				const ctx = await this.channelContext(channel, { forceRefresh: alreadyRefreshed });
				sent = true;
				const result = await engagement.reply(ctx, {
					toExternalId: item.externalId,
					kind: replyKind(item.kind),
					postExternalId: item.postExternalId,
					text: reply.text,
				});
				outcomes.add(1, { provider: provider.id, outcome: "sent" });
				log.info({ provider: provider.id, url: result.url }, "reply sent");
				return await state.sent(reply, result, {
					organizationId: item.organizationId,
					channelId: channel.id,
					provider: provider.id,
					postExternalId: item.postExternalId,
					parentExternalId: item.externalId,
					postTargetId: item.postTargetId,
					author: {
						externalId: channel.externalId,
						name: channel.name,
						handle: channel.username,
						avatarUrl: channel.avatarUrl,
						profileUrl: channel.profileUrl,
					},
				});
			} catch (error) {
				if (error instanceof ChannelNeedsReauthError) {
					outcomes.add(1, { provider: provider.id, outcome: "needs_reauth" });
					return state.failed(reply, "channel_needs_reauth", error.message);
				}
				// The publishing engine's policy, reused so the two can never disagree about
				// what is safe to resend.
				const decision = decide(error, { attempt: reply.attempts, sent, alreadyRefreshed });
				log.warn({ err: error, decision: decision.action }, "reply attempt failed");
				switch (decision.action) {
					case "refresh_token":
						// A 401/403 means the platform refused the request: resending after a refresh is safe.
						alreadyRefreshed = true;
						sent = false;
						continue;
					case "retry":
						outcomes.add(1, { provider: provider.id, outcome: "retry" });
						return this.requeue(reply, provider.id, decision.delayMs, decision.reason);
					case "fail":
						outcomes.add(1, { provider: provider.id, outcome: "failed" });
						// Still refused after a refresh. The channel is NOT flagged for reauth: the
						// usual cause is a missing reply permission while publishing works fine.
						return decision.code === "channel_needs_reauth"
							? state.failed(
									reply,
									"reply_not_authorized",
									"The platform refused the reply — reconnect the channel to grant reply access",
								)
							: state.failed(reply, decision.code, decision.message);
					case "unconfirmed":
						outcomes.add(1, { provider: provider.id, outcome: "unconfirmed" });
						return state.unconfirmed(reply, decision.message);
				}
			}
		}
	}

	private async requeue(reply: ReplyRow, provider: string, delayMs: number, reason: string) {
		const version = await this.deps.state.requeue(reply, reason);
		if (version === null) return;
		await this.deps.jobs.enqueueReply(
			provider,
			{ replyId: reply.id, organizationId: reply.organizationId, version },
			delayMs,
		);
	}

	private async channelContext(
		channel: { id: string; externalId: string; metadata: Record<string, unknown> },
		opts: { forceRefresh?: boolean },
	): Promise<ChannelContext> {
		return {
			externalId: channel.externalId,
			metadata: channel.metadata,
			accessToken: await this.deps.tokens.getAccessToken(channel.id, opts),
			logger: this.deps.logger.child({ channelId: channel.id }),
		};
	}
}
