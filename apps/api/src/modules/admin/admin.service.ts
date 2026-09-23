import { microsToUsd } from "@socialfly/ai";
import { conflict, notFound } from "@socialfly/core/errors";
import {
	and,
	asc,
	type Database,
	desc,
	eq,
	ilike,
	inArray,
	isNull,
	lt,
	or,
	type SQL,
	schema,
	sql,
	type Tx,
} from "@socialfly/db";
import type { QueueStats } from "#src/infrastructure/queue-stats.ts";
import { budgetPeriodStart, effectiveBudgetUsd } from "#src/modules/ai/ai.budget.ts";
import type { GENERATION_KINDS } from "#src/modules/ai/ai.schemas.ts";
import type { ADMIN_TARGET_STATUSES } from "./admin.schemas.ts";

const {
	adminAuditEvents,
	aiGenerations,
	authSessions,
	channels,
	memberships,
	organizations,
	posts,
	postTargets,
	users,
} = schema;

type OrgRow = typeof organizations.$inferSelect;
type Page = { before?: string; limit: number };

const DAY_MS = 24 * 3600_000;
const iso = (d: Date | null) => d?.toISOString() ?? null;

/** Escapes LIKE wildcards so a search for "50%" matches that text, not everything. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Fetches one row more than asked: its presence is how we know there is a next page. */
const paginate = <T extends { id: string }>(rows: T[], limit: number) => {
	const items = rows.slice(0, limit);
	return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
};

/** `count(*)` as a JS number (Postgres returns bigint counts as strings). */
const countWhere = (condition?: SQL) =>
	(condition ? sql<number>`count(*) filter (where ${condition})` : sql<number>`count(*)`).mapWith(
		Number,
	);

/** Group-by rows → `{ status: count }`, with every known status present (0 when absent). */
const byStatus = <S extends string>(known: readonly S[], rows: { status: S; n: number }[]) =>
	Object.fromEntries(known.map((s) => [s, rows.find((r) => r.status === s)?.n ?? 0])) as Record<
		S,
		number
	>;

export type AuditInput = {
	actorUserId: string;
	action: string;
	targetType: string;
	targetId: string;
	data: Record<string, unknown>;
};

/**
 * Cross-tenant reads and the few writes staff can make. Everything here bypasses the
 * per-organization scoping the rest of the API enforces, which is exactly why the
 * routes sit behind `requirePlatformAdmin` and every write leaves an audit row.
 */
export class AdminService {
	constructor(
		private readonly db: Database,
		private readonly queues: QueueStats,
	) {}

	// ── identity ────────────────────────────────────────────────────────────────

	async me(userId: string) {
		const [row] = await this.db
			.select({
				id: users.id,
				email: users.email,
				name: users.name,
				platformRole: users.platformRole,
			})
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);
		if (!row) throw notFound("User");
		return row;
	}

	// ── overview ────────────────────────────────────────────────────────────────

	async overview() {
		const now = Date.now();
		const since7d = new Date(now - 7 * DAY_MS).toISOString();
		const since24h = new Date(now - DAY_MS).toISOString();
		const monthStart = budgetPeriodStart();

		const [
			userCounts,
			orgCounts,
			channelCounts,
			postRows,
			targetCounts,
			aiSpend,
			aiRows,
			analyticsCounts,
		] = await Promise.all([
			this.db
				.select({
					total: countWhere(),
					new7d: countWhere(sql`${users.createdAt} >= ${since7d}`),
					disabled: countWhere(sql`${users.status} = 'disabled'`),
				})
				.from(users),
			this.db
				.select({
					total: countWhere(sql`${organizations.deletedAt} is null`),
					new7d: countWhere(
						sql`${organizations.deletedAt} is null and ${organizations.createdAt} >= ${since7d}`,
					),
					deleted: countWhere(sql`${organizations.deletedAt} is not null`),
				})
				.from(organizations),
			this.db
				.select({
					// Disconnected channels are history, not something anyone can publish to.
					total: countWhere(sql`${channels.status} <> 'disconnected'`),
					active: countWhere(sql`${channels.status} = 'active'`),
					needsReauth: countWhere(sql`${channels.status} = 'needs_reauth'`),
				})
				.from(channels),
			this.db
				.select({ status: posts.status, n: countWhere() })
				.from(posts)
				.where(isNull(posts.deletedAt))
				.groupBy(posts.status),
			this.db
				.select({
					failed24h: countWhere(
						sql`${postTargets.status} = 'failed' and ${postTargets.updatedAt} >= ${since24h}`,
					),
					unconfirmed24h: countWhere(
						sql`${postTargets.status} = 'unconfirmed' and ${postTargets.updatedAt} >= ${since24h}`,
					),
					published24h: countWhere(
						sql`${postTargets.status} = 'published' and ${postTargets.publishedAt} >= ${since24h}`,
					),
				})
				.from(postTargets),
			this.db
				.select({
					micros: sql<number>`coalesce(sum(${aiGenerations.costMicros}), 0)`.mapWith(Number),
				})
				.from(aiGenerations)
				.where(sql`${aiGenerations.createdAt} >= ${monthStart.toISOString()}`),
			this.db
				.select({ status: aiGenerations.status, n: countWhere() })
				.from(aiGenerations)
				.where(sql`${aiGenerations.createdAt} >= ${monthStart.toISOString()}`)
				.groupBy(aiGenerations.status),
			// Is the analytics collector alive? Raw SQL: the channel count spans two tables.
			this.db.execute(sql`
					select
						(select count(*) from post_target_metrics m where m.captured_at >= ${since24h})::int
							as "snapshots24h",
						(select count(distinct x.channel_id) from (
							select t.channel_id from post_target_metrics m
							join post_targets t on t.id = m.target_id
							where m.captured_at >= ${since24h}
							union
							select d.channel_id from channel_metrics_daily d where d.updated_at >= ${since24h}
						) x)::int as "channelsCollected24h"
				`) as unknown as Promise<{ snapshots24h: number; channelsCollected24h: number }[]>,
		]);

		const zero = { total: 0, new7d: 0 };
		return {
			generatedAt: new Date(now).toISOString(),
			users: userCounts[0] ?? { ...zero, disabled: 0 },
			organizations: orgCounts[0] ?? { ...zero, deleted: 0 },
			channels: channelCounts[0] ?? { total: 0, active: 0, needsReauth: 0 },
			posts: {
				total: postRows.reduce((sum, r) => sum + r.n, 0),
				byStatus: byStatus(schema.postStatus.enumValues, postRows),
			},
			publishing: targetCounts[0] ?? { failed24h: 0, unconfirmed24h: 0, published24h: 0 },
			ai: {
				periodStart: monthStart.toISOString(),
				spendUsd: microsToUsd(aiSpend[0]?.micros ?? 0),
				generations: {
					total: aiRows.reduce((sum, r) => sum + r.n, 0),
					byStatus: byStatus(schema.aiGenerationStatus.enumValues, aiRows),
				},
			},
			analytics: {
				snapshots24h: Number(analyticsCounts[0]?.snapshots24h ?? 0),
				channelsCollected24h: Number(analyticsCounts[0]?.channelsCollected24h ?? 0),
			},
		};
	}

	// ── organizations ───────────────────────────────────────────────────────────

	/**
	 * The list columns plus per-org aggregates, as correlated subqueries (one round trip).
	 * The subqueries are written out with explicit aliases on purpose: drizzle renders
	 * columns unqualified in single-table queries, so `${memberships.organizationId} =
	 * ${organizations.id}` would silently compare memberships.organization_id to
	 * memberships.id.
	 */
	private orgSummaryColumns() {
		const monthStart = budgetPeriodStart().toISOString();
		return {
			org: organizations,
			memberCount:
				sql<number>`(select count(*) from memberships m where m.organization_id = organizations.id)`.mapWith(
					Number,
				),
			channelCount:
				sql<number>`(select count(*) from channels c where c.organization_id = organizations.id and c.status <> 'disconnected')`.mapWith(
					Number,
				),
			postCount:
				sql<number>`(select count(*) from posts p where p.organization_id = organizations.id and p.deleted_at is null)`.mapWith(
					Number,
				),
			aiSpendMicros:
				sql<number>`(select coalesce(sum(g.cost_micros), 0) from ai_generations g where g.organization_id = organizations.id and g.created_at >= ${monthStart})`.mapWith(
					Number,
				),
		};
	}

	private toOrgSummary(r: {
		org: OrgRow;
		memberCount: number;
		channelCount: number;
		postCount: number;
		aiSpendMicros: number;
	}) {
		return {
			id: r.org.id,
			name: r.org.name,
			slug: r.org.slug,
			timezone: r.org.timezone,
			memberCount: r.memberCount,
			channelCount: r.channelCount,
			postCount: r.postCount,
			aiSpendMonthUsd: microsToUsd(r.aiSpendMicros),
			/** The override as stored: null = server default, 0 = unlimited. */
			aiMonthlyBudgetUsd: r.org.aiMonthlyBudgetUsd,
			/** What is actually enforced: null = unlimited. */
			aiEffectiveBudgetUsd: effectiveBudgetUsd(r.org.aiMonthlyBudgetUsd),
			createdAt: r.org.createdAt.toISOString(),
			deletedAt: iso(r.org.deletedAt),
		};
	}

	/** Includes soft-deleted organizations: support needs to find those too. */
	async listOrganizations(opts: Page & { q?: string }) {
		const rows = await this.db
			.select(this.orgSummaryColumns())
			.from(organizations)
			.where(
				and(
					opts.q
						? or(
								ilike(organizations.name, likePattern(opts.q)),
								ilike(organizations.slug, likePattern(opts.q)),
							)
						: undefined,
					opts.before ? lt(organizations.id, opts.before) : undefined,
				),
			)
			.orderBy(desc(organizations.id))
			.limit(opts.limit + 1);
		const { items, nextCursor } = paginate(
			rows.map((r) => ({ ...r, id: r.org.id })),
			opts.limit,
		);
		return { items: items.map((r) => this.toOrgSummary(r)), nextCursor };
	}

	private async orgSummary(id: string) {
		const [row] = await this.db
			.select(this.orgSummaryColumns())
			.from(organizations)
			.where(eq(organizations.id, id))
			.limit(1);
		if (!row) throw notFound("Organization");
		return this.toOrgSummary(row);
	}

	async getOrganization(id: string) {
		const summary = await this.orgSummary(id);
		const [members, channelRows, postRows] = await Promise.all([
			this.db
				.select({
					userId: users.id,
					email: users.email,
					name: users.name,
					role: memberships.role,
					joinedAt: memberships.createdAt,
				})
				.from(memberships)
				.innerJoin(users, eq(users.id, memberships.userId))
				.where(eq(memberships.organizationId, id))
				.orderBy(asc(memberships.createdAt)),
			// Explicit columns: the token columns must never be selected into a response.
			this.db
				.select({
					id: channels.id,
					provider: channels.provider,
					name: channels.name,
					username: channels.username,
					status: channels.status,
					lastError: channels.lastError,
					tokenExpiresAt: channels.tokenExpiresAt,
					createdAt: channels.createdAt,
				})
				.from(channels)
				.where(eq(channels.organizationId, id))
				.orderBy(asc(channels.createdAt)),
			this.db
				.select({ status: posts.status, n: countWhere() })
				.from(posts)
				.where(and(eq(posts.organizationId, id), isNull(posts.deletedAt)))
				.groupBy(posts.status),
		]);
		return {
			...summary,
			members: members.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() })),
			channels: channelRows.map((c) => ({
				...c,
				tokenExpiresAt: iso(c.tokenExpiresAt),
				createdAt: c.createdAt.toISOString(),
			})),
			postsByStatus: byStatus(schema.postStatus.enumValues, postRows),
			aiBudget: {
				periodStart: budgetPeriodStart().toISOString(),
				usedUsd: summary.aiSpendMonthUsd,
				overrideUsd: summary.aiMonthlyBudgetUsd,
				limitUsd: summary.aiEffectiveBudgetUsd,
			},
		};
	}

	async updateOrganization(
		actorUserId: string,
		id: string,
		input: { aiMonthlyBudgetUsd: number | null },
	) {
		// Stored as numeric(10,2); round here so the audit row records what was saved.
		const next =
			input.aiMonthlyBudgetUsd === null ? null : Math.round(input.aiMonthlyBudgetUsd * 100) / 100;
		await this.db.transaction(async (tx) => {
			const [before] = await tx
				.select({ budget: organizations.aiMonthlyBudgetUsd })
				.from(organizations)
				.where(eq(organizations.id, id))
				.for("update")
				.limit(1);
			if (!before) throw notFound("Organization");
			await tx
				.update(organizations)
				.set({ aiMonthlyBudgetUsd: next })
				.where(eq(organizations.id, id));
			await this.audit(tx, {
				actorUserId,
				action: "organization.ai_budget.update",
				targetType: "organization",
				targetId: id,
				data: { before: before.budget, after: next },
			});
		});
		return this.orgSummary(id);
	}

	// ── users ───────────────────────────────────────────────────────────────────

	private userColumns() {
		return {
			id: users.id,
			email: users.email,
			name: users.name,
			status: users.status,
			platformRole: users.platformRole,
			emailVerifiedAt: users.emailVerifiedAt,
			lastLoginAt: users.lastLoginAt,
			createdAt: users.createdAt,
			// Explicit aliases: see orgSummaryColumns.
			orgCount:
				sql<number>`(select count(*) from memberships m inner join organizations o on o.id = m.organization_id where m.user_id = users.id and o.deleted_at is null)`.mapWith(
					Number,
				),
		};
	}

	private toUserDto(u: {
		id: string;
		email: string;
		name: string | null;
		status: "active" | "disabled";
		platformRole: "user" | "admin";
		emailVerifiedAt: Date | null;
		lastLoginAt: Date | null;
		createdAt: Date;
		orgCount: number;
	}) {
		return {
			...u,
			emailVerifiedAt: iso(u.emailVerifiedAt),
			lastLoginAt: iso(u.lastLoginAt),
			createdAt: u.createdAt.toISOString(),
		};
	}

	async listUsers(opts: Page & { q?: string }) {
		const rows = await this.db
			.select(this.userColumns())
			.from(users)
			.where(
				and(
					opts.q
						? or(ilike(users.email, likePattern(opts.q)), ilike(users.name, likePattern(opts.q)))
						: undefined,
					opts.before ? lt(users.id, opts.before) : undefined,
				),
			)
			.orderBy(desc(users.id))
			.limit(opts.limit + 1);
		const { items, nextCursor } = paginate(rows, opts.limit);
		return { items: items.map((u) => this.toUserDto(u)), nextCursor };
	}

	private async userDto(id: string) {
		const [row] = await this.db.select(this.userColumns()).from(users).where(eq(users.id, id));
		if (!row) throw notFound("User");
		return this.toUserDto(row);
	}

	/**
	 * Disabling must cut access NOW, not when the 15-minute access token expires:
	 * bumping token_version invalidates every outstanding access token (isAccessRevoked
	 * compares it on each request) and revoking the sessions kills the refresh tokens.
	 * Re-enabling does neither — the user simply signs in again.
	 */
	async updateUser(actorUserId: string, id: string, input: { status: "active" | "disabled" }) {
		// Locking yourself out of the console is never what an admin meant to do.
		if (id === actorUserId && input.status === "disabled") {
			throw conflict("You cannot disable your own account", "cannot_disable_self");
		}
		await this.db.transaction(async (tx) => {
			const [before] = await tx
				.select({ status: users.status })
				.from(users)
				.where(eq(users.id, id))
				.for("update")
				.limit(1);
			if (!before) throw notFound("User");
			if (before.status === input.status) return;

			const disabling = input.status === "disabled";
			await tx
				.update(users)
				.set({
					status: input.status,
					...(disabling ? { tokenVersion: sql`${users.tokenVersion} + 1` } : {}),
				})
				.where(eq(users.id, id));
			let revokedSessions = 0;
			if (disabling) {
				const revoked = await tx
					.update(authSessions)
					.set({ revokedAt: new Date(), revokedReason: "admin_disabled" })
					.where(and(eq(authSessions.userId, id), isNull(authSessions.revokedAt)))
					.returning({ id: authSessions.id });
				revokedSessions = revoked.length;
			}
			await this.audit(tx, {
				actorUserId,
				action: disabling ? "user.disable" : "user.enable",
				targetType: "user",
				targetId: id,
				data: { before: before.status, after: input.status, revokedSessions },
			});
		});
		return this.userDto(id);
	}

	// ── publishing & AI (cross-tenant) ──────────────────────────────────────────

	async listTargets(opts: Page & { status?: (typeof ADMIN_TARGET_STATUSES)[number] }) {
		const rows = await this.db
			.select({
				id: postTargets.id,
				postId: postTargets.postId,
				organization: { id: organizations.id, name: organizations.name },
				channel: { id: channels.id, provider: channels.provider, name: channels.name },
				status: postTargets.status,
				errorCode: postTargets.errorCode,
				errorMessage: postTargets.errorMessage,
				attempts: postTargets.attempts,
				scheduledAt: postTargets.scheduledAt,
				updatedAt: postTargets.updatedAt,
			})
			.from(postTargets)
			.innerJoin(organizations, eq(organizations.id, postTargets.organizationId))
			.innerJoin(channels, eq(channels.id, postTargets.channelId))
			.where(
				and(
					opts.status
						? eq(postTargets.status, opts.status)
						: inArray(postTargets.status, ["failed", "unconfirmed"]),
					opts.before ? lt(postTargets.id, opts.before) : undefined,
				),
			)
			.orderBy(desc(postTargets.id))
			.limit(opts.limit + 1);
		const { items, nextCursor } = paginate(rows, opts.limit);
		return {
			items: items.map((t) => ({
				...t,
				scheduledAt: iso(t.scheduledAt),
				updatedAt: t.updatedAt.toISOString(),
			})),
			nextCursor,
		};
	}

	async listGenerations(
		opts: Page & {
			status?: (typeof schema.aiGenerationStatus.enumValues)[number];
			kind?: (typeof GENERATION_KINDS)[number];
		},
	) {
		const rows = await this.db
			.select({
				id: aiGenerations.id,
				organization: { id: organizations.id, name: organizations.name },
				userId: aiGenerations.userId,
				userEmail: users.email,
				kind: aiGenerations.kind,
				status: aiGenerations.status,
				model: aiGenerations.model,
				costMicros: aiGenerations.costMicros,
				errorCode: aiGenerations.errorCode,
				createdAt: aiGenerations.createdAt,
			})
			.from(aiGenerations)
			.innerJoin(organizations, eq(organizations.id, aiGenerations.organizationId))
			// Left join: the user may have been deleted since (user_id is set null).
			.leftJoin(users, eq(users.id, aiGenerations.userId))
			.where(
				and(
					opts.status ? eq(aiGenerations.status, opts.status) : undefined,
					opts.kind ? eq(aiGenerations.kind, opts.kind) : undefined,
					opts.before ? lt(aiGenerations.id, opts.before) : undefined,
				),
			)
			.orderBy(desc(aiGenerations.id))
			.limit(opts.limit + 1);
		const { items, nextCursor } = paginate(rows, opts.limit);
		return {
			items: items.map(({ costMicros, ...g }) => ({
				...g,
				costUsd: microsToUsd(costMicros),
				createdAt: g.createdAt.toISOString(),
			})),
			nextCursor,
		};
	}

	async queueCounts() {
		return { queues: await this.queues.counts() };
	}

	// ── audit ───────────────────────────────────────────────────────────────────

	/** Takes the transaction of the change it records: both commit, or neither does. */
	private async audit(tx: Tx, event: AuditInput) {
		await tx.insert(adminAuditEvents).values(event);
	}

	async listAudit(opts: Page) {
		const rows = await this.db
			.select({
				id: adminAuditEvents.id,
				actorUserId: adminAuditEvents.actorUserId,
				actorEmail: users.email,
				action: adminAuditEvents.action,
				targetType: adminAuditEvents.targetType,
				targetId: adminAuditEvents.targetId,
				data: adminAuditEvents.data,
				createdAt: adminAuditEvents.createdAt,
			})
			.from(adminAuditEvents)
			.leftJoin(users, eq(users.id, adminAuditEvents.actorUserId))
			.where(opts.before ? lt(adminAuditEvents.id, opts.before) : undefined)
			.orderBy(desc(adminAuditEvents.id))
			.limit(opts.limit + 1);
		const { items, nextCursor } = paginate(rows, opts.limit);
		return {
			items: items.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
			nextCursor,
		};
	}
}
