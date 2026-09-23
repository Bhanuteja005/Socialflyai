import { AppError, badRequest, notFound, validationFailed } from "@socialfly/core/errors";
import type { Redis } from "@socialfly/core/redis";
import { and, type Database, eq, isNull, max, type SQL, schema, sql } from "@socialfly/db";
import type { ProviderRegistry } from "@socialfly/integrations";
import type { JobProducer } from "@socialfly/queue";
import { publicUrl } from "../media/media.service";
import {
	type BestTimesQuery,
	DEFAULT_RANGE_DAYS,
	type OverviewQuery,
	type PostsQuery,
	rangeProblem,
	spanDays,
} from "./analytics.schemas.ts";
import {
	type Cell,
	dataRecommendations,
	defaultRecommendations,
	MIN_POSTS_FOR_DATA,
} from "./best-times.ts";

const { organizations, posts, postTargetMetrics } = schema;

/** One manual refresh per organization per this many seconds: each one spends platform budget. */
const REFRESH_COOLDOWN_SECONDS = 600;
const HISTORY_POINTS = 200;
const TOP_POSTS = 5;
const EXCERPT_CHARS = 140;

type Range = { from: string; to: string; timezone: string };

const METRICS = [
	"impressions",
	"reach",
	"likes",
	"comments",
	"shares",
	"saves",
	"clicks",
	"videoViews",
] as const;
type MetricKey = (typeof METRICS)[number];
type MetricValues = Record<MetricKey, number | null>;

/** A target joined with its LATEST snapshot, as the raw queries below return it. */
type TargetRow = {
	target_id: string;
	post_id: string;
	channel_id: string;
	published_at: string;
	external_url: string | null;
	content: string;
	captured_at: string | null;
	impressions: number | null;
	reach: number | null;
	likes: number | null;
	comments: number | null;
	shares: number | null;
	saves: number | null;
	clicks: number | null;
	video_views: number | null;
	engagements: number | null;
};

const DAY_MS = 24 * 3600_000;

const addDays = (day: string, n: number) =>
	new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Every calendar day from `from` to `to`, inclusive. */
const daysBetween = (from: string, to: string) =>
	Array.from({ length: spanDays(from, to) }, (_, i) => addDays(from, i));

/** Today in `timezone`; an unknown zone (should not happen: it is validated on save) falls back to UTC. */
function todayIn(timezone: string) {
	try {
		return new Intl.DateTimeFormat("en-CA", {
			timeZone: timezone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).format(new Date());
	} catch {
		return new Date().toISOString().slice(0, 10);
	}
}

/** Postgres numbers can arrive as strings (bigint, numeric); null stays null. */
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * "Engagement rate" = engagements / impressions, only when both are known and there
 * were impressions. Rounded to 4 decimals (0.0123 = 1.23 %).
 */
const rate = (engagements: number | null, impressions: number | null) =>
	engagements !== null && impressions !== null && impressions > 0
		? Math.round((engagements / impressions) * 10_000) / 10_000
		: null;

/** Timestamps are formatted in SQL: raw queries bypass drizzle's date mapping. */
const isoTs = (column: string) =>
	sql.raw(`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

/**
 * engagements = likes + comments + shares + saves, where a metric the platform does
 * not report counts as 0 — unless it reports none of them, then it is unknown (null).
 */
const ENGAGEMENTS = sql.raw(`case
	when l.likes is null and l.comments is null and l.shares is null and l.saves is null then null
	else coalesce(l.likes, 0) + coalesce(l.comments, 0) + coalesce(l.shares, 0) + coalesce(l.saves, 0)
end`);

const excerpt = (text: string) => [...text].slice(0, EXCERPT_CHARS).join("");

const metricsOf = (r: Record<string, unknown>) => {
	const values = {
		impressions: num(r.impressions),
		reach: num(r.reach),
		likes: num(r.likes),
		comments: num(r.comments),
		shares: num(r.shares),
		saves: num(r.saves),
		clicks: num(r.clicks),
		videoViews: num(r.video_views),
	} satisfies MetricValues;
	const engagements = num(r.engagements);
	return { ...values, engagements, engagementRate: rate(engagements, values.impressions) };
};

/** Cursor for sort=publishedAt: the last row's exact (microsecond) publish time and id. */
const encodeCursor = (ts: string, id: string) => Buffer.from(`${ts}|${id}`).toString("base64url");
function decodeCursor(cursor: string) {
	const [ts, id] = Buffer.from(cursor, "base64url").toString().split("|");
	if (
		!ts ||
		!id ||
		!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/.test(ts) ||
		!/^[0-9a-f-]{36}$/i.test(id)
	)
		throw badRequest("Invalid cursor");
	return { ts, id };
}

/**
 * Read side of analytics. Every number is derived from the LATEST snapshot of each
 * published target (post_target_metrics is append-only history), and a metric no
 * snapshot reports stays null — "unknown" is never presented as zero.
 *
 * Queries are raw SQL with explicit table aliases on purpose: they are correlated
 * (latest snapshot per target) and drizzle renders columns unqualified in
 * single-table queries, which would silently compare a table with itself.
 */
export class AnalyticsService {
	constructor(
		private readonly db: Database,
		private readonly providers: ProviderRegistry,
		private readonly jobs: JobProducer,
		private readonly redis: Redis,
	) {}

	// ── overview ────────────────────────────────────────────────────────────────

	async overview(orgId: string, q: OverviewQuery) {
		const range = await this.range(orgId, q);
		const length = spanDays(range.from, range.to);
		const previous = { ...range, from: addDays(range.from, -length), to: addDays(range.from, -1) };

		const [totals, previousTotals, daily, byChannel, topPosts, lastCollected] = await Promise.all([
			this.totals(orgId, range, q.channelIds),
			this.totals(orgId, previous, q.channelIds),
			this.daily(orgId, range, q.channelIds),
			this.byChannel(orgId, range, q.channelIds),
			this.topPosts(orgId, range, q.channelIds),
			this.db
				.select({ at: max(postTargetMetrics.capturedAt) })
				.from(postTargetMetrics)
				.where(eq(postTargetMetrics.organizationId, orgId)),
		]);
		return {
			range,
			totals,
			previousTotals,
			daily,
			byChannel,
			topPosts,
			lastCollectedAt: lastCollected[0]?.at?.toISOString() ?? null,
		};
	}

	private async totals(orgId: string, range: Range, channelIds?: string[]) {
		const [r] = await this.rows<Record<string, unknown>>(sql`
			with x as (${this.targets(orgId, this.inRange(range), channelIds)})
			select
				count(*)::int as posts,
				${sql.raw(
					METRICS.map(
						(k) => `sum(x.${k === "videoViews" ? "video_views" : k})::float8 as "${k}"`,
					).join(", "),
				)},
				sum(x.engagements)::float8 as engagements,
				(sum(x.engagements) filter (where x.impressions is not null))::float8 as rated_engagements,
				(sum(x.impressions) filter (where x.engagements is not null))::float8 as rated_impressions
			from x
		`);
		const row = r ?? {};
		return {
			posts: num(row.posts) ?? 0,
			impressions: num(row.impressions),
			reach: num(row.reach),
			engagements: num(row.engagements),
			likes: num(row.likes),
			comments: num(row.comments),
			shares: num(row.shares),
			saves: num(row.saves),
			clicks: num(row.clicks),
			videoViews: num(row.videoViews),
			// Only targets reporting BOTH numbers: engagements from a platform that hides
			// impressions would otherwise inflate the rate.
			engagementRate: rate(num(row.rated_engagements), num(row.rated_impressions)),
		};
	}

	/** Per publish day in the org's timezone; every day present so charts need no gap logic. */
	private async daily(orgId: string, range: Range, channelIds?: string[]) {
		const rows = await this.rows<{
			date: string;
			posts: number;
			impressions: number;
			engagements: number;
		}>(sql`
			with x as (${this.targets(orgId, this.inRange(range), channelIds)})
			select
				to_char((x.published_at_raw at time zone ${range.timezone})::date, 'YYYY-MM-DD') as date,
				count(*)::int as posts,
				coalesce(sum(x.impressions), 0)::float8 as impressions,
				coalesce(sum(x.engagements), 0)::float8 as engagements
			from x
			group by 1
		`);
		const byDate = new Map(rows.map((r) => [r.date, r]));
		return daysBetween(range.from, range.to).map((date) => {
			const r = byDate.get(date);
			return {
				date,
				posts: num(r?.posts) ?? 0,
				impressions: num(r?.impressions) ?? 0,
				engagements: num(r?.engagements) ?? 0,
			};
		});
	}

	/**
	 * Every connected channel (plus disconnected ones that published in the range).
	 * Followers come from channel_metrics_daily, whose days are UTC: close enough for a
	 * follower count, and the platforms report account numbers per UTC day anyway.
	 */
	private async byChannel(orgId: string, range: Range, channelIds?: string[]) {
		const rows = await this.rows<{
			id: string;
			provider: string;
			name: string;
			posts: number;
			impressions: number | null;
			engagements: number | null;
			followers: number | null;
			first_followers: number | null;
			last_followers: number | null;
			follower_points: number;
		}>(sql`
			with x as (${this.targets(orgId, this.inRange(range), channelIds)})
			select c.id, c.provider, c.name,
				count(x.target_id)::int as posts,
				sum(x.impressions)::float8 as impressions,
				sum(x.engagements)::float8 as engagements,
				(select d.followers from channel_metrics_daily d
					where d.channel_id = c.id and d.followers is not null and d.day <= ${range.to}::date
					order by d.day desc limit 1) as followers,
				(select d.followers from channel_metrics_daily d
					where d.channel_id = c.id and d.followers is not null
						and d.day between ${range.from}::date - 1 and ${range.to}::date
					order by d.day asc limit 1) as first_followers,
				(select d.followers from channel_metrics_daily d
					where d.channel_id = c.id and d.followers is not null
						and d.day between ${range.from}::date - 1 and ${range.to}::date
					order by d.day desc limit 1) as last_followers,
				(select count(*) from channel_metrics_daily d
					where d.channel_id = c.id and d.followers is not null
						and d.day between ${range.from}::date - 1 and ${range.to}::date)::int as follower_points
			from channels c
			left join x on x.channel_id = c.id
			where c.organization_id = ${orgId}
				and (c.status <> 'disconnected' or x.target_id is not null)
				${channelIds?.length ? sql`and c.id in ${channelIds}` : sql``}
			group by c.id
			order by c.name, c.id
		`);
		return rows.map((r) => {
			const first = num(r.first_followers);
			const last = num(r.last_followers);
			return {
				channelId: r.id,
				provider: r.provider,
				name: r.name,
				analyticsSupported: this.supports(r.provider),
				posts: num(r.posts) ?? 0,
				impressions: num(r.impressions),
				engagements: num(r.engagements),
				followers: num(r.followers),
				// The day before the range is the baseline, so growth ON the first day counts.
				followersChange:
					(num(r.follower_points) ?? 0) >= 2 && first !== null && last !== null
						? last - first
						: null,
			};
		});
	}

	private async topPosts(orgId: string, range: Range, channelIds?: string[]) {
		const rows = await this.rows<TargetRow & { provider: string; name: string }>(sql`
			with x as (${this.targets(orgId, this.inRange(range), channelIds)})
			select x.*, c.provider, c.name
			from x join channels c on c.id = x.channel_id
			where x.engagements is not null
			order by x.engagements desc, x.impressions desc nulls last, x.published_at_raw desc, x.target_id desc
			limit ${TOP_POSTS}
		`);
		return rows.map((r) => {
			const impressions = num(r.impressions);
			const engagements = num(r.engagements);
			return {
				postId: r.post_id,
				targetId: r.target_id,
				channel: { id: r.channel_id, provider: r.provider, name: r.name },
				excerpt: excerpt(r.content),
				publishedAt: r.published_at,
				externalUrl: r.external_url,
				impressions,
				engagements,
				engagementRate: rate(engagements, impressions),
			};
		});
	}

	// ── posts ───────────────────────────────────────────────────────────────────

	/**
	 * Keyset pagination for sort=publishedAt only. Metric sorts return one page (the
	 * top `limit`) with no cursor: the sort key changes every time a snapshot lands, so
	 * a cursor over it would skip or repeat posts between pages — and "top N by
	 * engagements" is the question those sorts answer.
	 */
	async posts(orgId: string, q: PostsQuery) {
		const range = await this.range(orgId, q);
		const cursor = q.sort === "publishedAt" && q.before ? decodeCursor(q.before) : null;
		const order =
			q.sort === "engagements"
				? sql.raw("x.engagements desc nulls last, x.published_at_raw desc, x.target_id desc")
				: q.sort === "impressions"
					? sql.raw("x.impressions desc nulls last, x.published_at_raw desc, x.target_id desc")
					: sql.raw("x.published_at_raw desc, x.target_id desc");
		const rows = await this.rows<
			TargetRow & {
				provider: string;
				name: string;
				thumb_key: string | null;
				cursor_ts: string;
			}
		>(sql`
			with x as (${this.targets(orgId, this.inRange(range), q.channelIds)})
			select x.*, c.provider, c.name,
				(x.published_at_raw at time zone 'UTC')::text as cursor_ts,
				(select a.storage_key from post_media pm
					join media_assets a on a.id = pm.media_id
					where pm.post_id = x.post_id
					order by pm.position limit 1) as thumb_key
			from x join channels c on c.id = x.channel_id
			${
				cursor
					? sql`where (x.published_at_raw, x.target_id) < (${cursor.ts}::timestamp at time zone 'UTC', ${cursor.id}::uuid)`
					: sql``
			}
			order by ${order}
			limit ${q.limit + 1}
		`);
		const page = rows.slice(0, q.limit);
		const last = page.at(-1);
		return {
			items: page.map((r) => ({
				targetId: r.target_id,
				postId: r.post_id,
				channel: { id: r.channel_id, provider: r.provider, name: r.name },
				excerpt: excerpt(r.content),
				thumbnailUrl: r.thumb_key ? publicUrl(r.thumb_key) : null,
				publishedAt: r.published_at,
				externalUrl: r.external_url,
				metrics: metricsOf(r),
				collectedAt: r.captured_at,
			})),
			nextCursor:
				q.sort === "publishedAt" && rows.length > q.limit && last
					? encodeCursor(last.cursor_ts, last.target_id)
					: null,
		};
	}

	/** One post's published targets with their metric history (for growth curves). */
	async post(orgId: string, postId: string) {
		const [post] = await this.db
			.select({ id: posts.id })
			.from(posts)
			.where(and(eq(posts.id, postId), eq(posts.organizationId, orgId), isNull(posts.deletedAt)))
			.limit(1);
		if (!post) throw notFound("Post");

		const targets = await this.rows<{
			target_id: string;
			channel_id: string;
			provider: string;
			name: string;
			external_url: string | null;
			published_at: string;
		}>(sql`
			select t.id as target_id, t.channel_id, c.provider, c.name, t.external_url,
				${isoTs("t.published_at")} as published_at
			from post_targets t join channels c on c.id = t.channel_id
			where t.post_id = ${postId} and t.organization_id = ${orgId}
				and t.status = 'published' and t.published_at is not null
			order by t.published_at, t.id
		`);
		const history = targets.length
			? await this.rows<Record<string, unknown> & { target_id: string; captured_at: string }>(sql`
					select h.target_id, ${isoTs("h.captured_at")} as captured_at,
						h.impressions, h.reach, h.likes, h.comments, h.shares, h.saves, h.clicks,
						h.video_views, h.engagements
					from (
						select l.*, ${ENGAGEMENTS} as engagements,
							row_number() over (partition by l.target_id order by l.captured_at desc) as rn
						from post_target_metrics l
						where l.target_id in ${targets.map((t) => t.target_id)}
					) h
					where h.rn <= ${HISTORY_POINTS}
					order by h.target_id, h.captured_at asc
				`)
			: [];

		return {
			postId,
			targets: targets.map((t) => {
				const points = history
					.filter((h) => h.target_id === t.target_id)
					.map((h) => ({ capturedAt: h.captured_at, ...metricsOf(h) }));
				const newest = points.at(-1);
				return {
					targetId: t.target_id,
					channel: { id: t.channel_id, provider: t.provider, name: t.name },
					externalUrl: t.external_url,
					publishedAt: t.published_at,
					latest: newest ? withoutCapturedAt(newest) : null,
					history: points,
				};
			}),
		};
	}

	// ── channels ────────────────────────────────────────────────────────────────

	/**
	 * Account numbers per day. channel_metrics_daily days are UTC calendar days (what
	 * the platforms report), so from/to are matched against them as plain dates.
	 */
	async channel(orgId: string, channelId: string, q: { from?: string; to?: string }) {
		const [channel] = await this.rows<{ id: string; provider: string; name: string }>(sql`
			select c.id, c.provider, c.name from channels c
			where c.id = ${channelId} and c.organization_id = ${orgId}
		`);
		if (!channel) throw notFound("Channel");
		const range = await this.range(orgId, q);
		const rows = await this.rows<{
			day: string;
			followers: number | null;
			impressions: number | null;
			reach: number | null;
			profile_views: number | null;
		}>(sql`
			select to_char(d.day, 'YYYY-MM-DD') as day, d.followers, d.impressions, d.reach, d.profile_views
			from channel_metrics_daily d
			where d.channel_id = ${channelId}
				and d.day between ${range.from}::date and ${range.to}::date
		`);
		const byDay = new Map(rows.map((r) => [r.day, r]));
		return {
			channel: {
				id: channel.id,
				provider: channel.provider,
				name: channel.name,
				analyticsSupported: this.supports(channel.provider),
			},
			days: daysBetween(range.from, range.to).map((date) => {
				const r = byDay.get(date);
				return {
					date,
					followers: num(r?.followers),
					impressions: num(r?.impressions),
					reach: num(r?.reach),
					profileViews: num(r?.profile_views),
				};
			}),
		};
	}

	// ── best times ──────────────────────────────────────────────────────────────

	async bestTimes(orgId: string, q: BestTimesQuery) {
		const timezone = await this.timezone(orgId);
		const window = sql`t.published_at >= now() - make_interval(days => ${q.weeks * 7})`;
		const rows = await this.rows<{
			weekday: number;
			hour: number;
			posts: number;
			avg: number;
		}>(sql`
			with x as (${this.targets(orgId, window, q.channelIds)})
			select
				(extract(isodow from x.published_at_raw at time zone ${timezone})::int - 1) as weekday,
				extract(hour from x.published_at_raw at time zone ${timezone})::int as hour,
				count(*)::int as posts,
				avg(x.engagements)::float8 as avg
			from x
			where x.engagements is not null
			group by 1, 2
		`);
		const measured = new Map(rows.map((r) => [`${num(r.weekday)}:${num(r.hour)}`, r]));
		const cells: Cell[] = [];
		for (let weekday = 0; weekday < 7; weekday++) {
			for (let hour = 0; hour < 24; hour++) {
				const r = measured.get(`${weekday}:${hour}`);
				const avg = num(r?.avg);
				cells.push({
					weekday,
					hour,
					posts: num(r?.posts) ?? 0,
					avgEngagements: avg === null ? null : Math.round(avg * 100) / 100,
				});
			}
		}

		const measuredPosts = cells.reduce((sum, c) => sum + c.posts, 0);
		const fromData = measuredPosts >= MIN_POSTS_FOR_DATA ? dataRecommendations(cells) : [];
		if (fromData.length > 0) {
			return { timezone, source: "data" as const, cells, recommendations: fromData };
		}
		const providers = await this.rows<{ provider: string }>(sql`
			select distinct c.provider from channels c
			where c.organization_id = ${orgId} and c.status <> 'disconnected'
				${q.channelIds?.length ? sql`and c.id in ${q.channelIds}` : sql``}
		`);
		return {
			timezone,
			source: "defaults" as const,
			cells,
			recommendations: defaultRecommendations(providers.map((p) => p.provider)),
		};
	}

	// ── refresh ─────────────────────────────────────────────────────────────────

	/**
	 * Collect now instead of waiting for the planner. Rate limited per organization
	 * (SET NX with a TTL — exactly one refresh per window, whatever the replica count),
	 * because each refresh spends the platforms' API budget that publishing needs too.
	 */
	async refresh(orgId: string) {
		const key = `analytics:refresh:${orgId}`;
		const acquired = await this.redis.set(key, "1", "EX", REFRESH_COOLDOWN_SECONDS, "NX");
		if (acquired !== "OK") {
			const ttl = await this.redis.ttl(key);
			const retryAfterSeconds = ttl > 0 ? ttl : REFRESH_COOLDOWN_SECONDS;
			throw new AppError(
				429,
				"rate_limited",
				"Analytics were refreshed a few minutes ago — try again later",
				{ retryAfterSeconds },
			);
		}
		try {
			const channels = await this.rows<{ id: string; provider: string }>(sql`
				select c.id, c.provider from channels c
				join organizations o on o.id = c.organization_id
				where c.organization_id = ${orgId} and c.status = 'active' and o.deleted_at is null
			`);
			const supported = channels.filter((c) => this.supports(c.provider));
			const queued = await this.jobs.refreshAnalytics(
				supported.map((c) => ({
					channelId: c.id,
					account: Boolean(this.providers.get(c.provider)?.analytics?.getAccountMetrics),
				})),
			);
			return { queued };
		} catch (error) {
			// Nothing was queued: do not make the user wait out a cooldown for it.
			await this.redis.del(key);
			throw error;
		}
	}

	// ── internals ───────────────────────────────────────────────────────────────

	private async rows<T>(query: SQL): Promise<T[]> {
		return (await this.db.execute(query)) as unknown as T[];
	}

	private supports(provider: string) {
		const p = this.providers.get(provider);
		return Boolean(p?.isConfigured() && p.analytics);
	}

	private async timezone(orgId: string) {
		const [org] = await this.db
			.select({ timezone: organizations.timezone })
			.from(organizations)
			.where(eq(organizations.id, orgId))
			.limit(1);
		return org?.timezone ?? "UTC";
	}

	/** Defaults (last 28 days, today included, in the org's timezone) + the range rules. */
	private async range(orgId: string, q: { from?: string; to?: string }): Promise<Range> {
		const timezone = await this.timezone(orgId);
		const to = q.to ?? (q.from ? addDays(q.from, DEFAULT_RANGE_DAYS - 1) : todayIn(timezone));
		const from = q.from ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1));
		const problem = rangeProblem(from, to);
		if (problem) throw validationFailed({ fields: { from: problem } });
		return { from, to, timezone };
	}

	/** Published between the first instant of `from` and the first instant after `to`, in the org's timezone. */
	private inRange(range: Range): SQL {
		return sql`t.published_at >= (${range.from}::date)::timestamp at time zone ${range.timezone}
			and t.published_at < (${range.to}::date + 1)::timestamp at time zone ${range.timezone}`;
	}

	/**
	 * Published targets of the organization (posts not deleted) matching `when`, each
	 * with its latest snapshot (LATERAL … LIMIT 1 rides the (target_id, captured_at)
	 * index). `published_at_raw` keeps the timestamp for ordering and date maths;
	 * `published_at` is the ISO string the API returns.
	 */
	private targets(orgId: string, when: SQL, channelIds?: string[]): SQL {
		return sql`
			select t.id as target_id, t.post_id, t.channel_id, t.external_url,
				t.published_at as published_at_raw,
				${isoTs("t.published_at")} as published_at,
				coalesce(t.content_override, p.content) as content,
				${isoTs("l.captured_at")} as captured_at,
				l.impressions, l.reach, l.likes, l.comments, l.shares, l.saves, l.clicks, l.video_views,
				${ENGAGEMENTS} as engagements
			from post_targets t
			join posts p on p.id = t.post_id and p.deleted_at is null
			left join lateral (
				select m.* from post_target_metrics m
				where m.target_id = t.id
				order by m.captured_at desc
				limit 1
			) l on true
			where t.organization_id = ${orgId}
				and t.status = 'published'
				and ${when}
				${channelIds?.length ? sql`and t.channel_id in ${channelIds}` : sql``}
		`;
	}
}

const withoutCapturedAt = <T extends { capturedAt: string }>({ capturedAt: _, ...metrics }: T) =>
	metrics;
