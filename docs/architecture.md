# Architecture

## System at a glance

```
  visitors ──▶ site  (Next :4701)    static marketing pages; "Log in" / "Get started" link to app
  users ─────▶ app   (Next :4700) ─┐
  staff ─────▶ admin (Next :4702) ─┤  cookies (sf_access, sf_csrf)  ┌──────────────┐
                        ┌──────────┴───────────────────────────────▶│ auth (Hono)  │── users, sessions
                        │                                           └──────────────┘
                        │ typed Hono RPC client (hc<AppType>)
                        ▼
                 ┌──────────────┐  enqueue (BullMQ, Redis)  ┌────────────────┐   platform APIs
                 │  api (Hono)  │──────────────────────────▶│ worker (BullMQ)│──────────────────▶ LinkedIn, Meta,
                 └──────┬───────┘                           └───────┬────────┘                    Threads, X, Reddit,
                        │                                           │                             YouTube
                        ▼                                           ▼
                 Postgres 17 (+pgvector) ◀──────────────────────────┘
                 S3-compatible storage (browser uploads directly via presigned URLs)
```

All services are TypeScript on Bun, except the Next.js frontends (site, app, admin),
which run on Node. Every service exports OpenTelemetry traces, metrics and logs;
`X-Trace-Id` on every API response links a user report to its trace.

## Services

| Service | Responsibility | Talks to | Local port |
|---|---|---|---|
| `apps/auth` | Identity only: register/login, 15-min access JWT + rotating refresh token (httpOnly cookies), CSRF, Google sign-in, email verification & recovery, service tokens (client credentials) | Postgres, SMTP | 4800 |
| `apps/api` | Everything tenant-scoped: organizations & roles, invitations, channel OAuth, media, posts & scheduling, AI text generation & brand voice, analytics reports, research / SEO / AI-visibility reports, engagement inbox, ads | Postgres, Redis, storage, SMTP, Anthropic, DataForSEO | 4400 |
| `apps/worker` | Publishing engine, async-media status polling, token refresh, AI media (images, carousels), analytics collection, website research, AI-visibility checks, SEO refresh, inbox sync / listening / triage and reply sending, ad campaign creation / activation / sync, maintenance (sweep, stuck recovery) | Postgres, Redis, storage, platform + AI APIs, websites, DataForSEO | 4500 |
| `apps/app` | The product UI: sign-in/sign-up, onboarding, dashboard, composer, calendar, channels, media, settings. `/` redirects to `/dashboard` | auth, api | 4700 |
| `apps/site` | Public marketing site: landing, features, solutions, comparisons, free tools, blog, legal. Statically rendered; no API client, no auth. "Log in"/"Get started" link to the app | — | 4701 |
| `apps/admin` | Internal admin console for staff (see `docs/admin-console.md`) | auth, api | 4702 |

## Frontends

Three Next.js apps share one design system and one Dockerfile.

```
apps/
  app/    @socialfly/app    product UI       (app) + (auth) route groups, TanStack Query, typed API client
  site/   @socialfly/site   marketing site   every route static; robots.ts + sitemap.ts (lists every page)
  admin/  @socialfly/admin  admin console
packages/
  ui/     @socialfly/ui     design system: primitives, cn(), theme provider, tokens CSS
```

- **`@socialfly/ui`** ships TypeScript source (no build), like every workspace package;
  each app lists it in `transpilePackages`. Imports are by subpath:
  `@socialfly/ui/components/button`, `@socialfly/ui/utils` (`cn`), `@socialfly/ui/theme`
  (`themeScript`), `@socialfly/ui/theme-provider`. Code inside the package uses relative
  imports only — an app's `@/` alias would not resolve from another app.
- **Tokens and theme.** `@socialfly/ui/theme.css` holds the design tokens (`:root` / `.dark`
  CSS variables), the Tailwind 4 `@theme` mapping, base styles and the `.dark` variant. Each
  app's `globals.css` is `@import "tailwindcss"; @import "@socialfly/ui/theme.css";` plus
  anything app-specific. The theme file carries an `@source` directive pointing at the
  package's components, so every consumer's Tailwind build generates their classes
  (automatic source detection skips `node_modules`, where the package is linked).
- **Light/dark.** The app and admin follow the user's choice (`ThemeProvider` +
  `themeScript` before paint). The site is always dark: `.dark` is fixed on `<html>`.
- **Cross-links.** The frontends are separate deployments, so every app knows all three
  public URLs (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ADMIN_URL` in
  `packages/config/src/web.ts`); cross-app links are absolute `<a>` links.
- **Images.** `docker build -f infra/docker/web.Dockerfile --build-arg APP=<site|app|admin> .`
  — Next standalone output, served by Node as a non-root user on container port 3000.
  `NEXT_PUBLIC_*` are build args (inlined at build time).

Auth is its own service (as in the reference monorepo) so identity can be scaled,
audited and hardened independently. It is deliberately identity-only: tokens carry
no organization or role, and the API checks membership on every request from the
`X-Organization-Id` header, so removing a member takes effect immediately.

## Code conventions

- **Layering per module** (`apps/api/src/modules/<name>/`): `*.routes.ts` (HTTP only: validate, call service, shape response) → `*.service.ts` (business rules, transactions) → Drizzle. Schemas in `*.schemas.ts` are used for both validation and the OpenAPI spec.
- **Errors**: services throw `AppError(status, code, message)` (`@socialfly/core/errors`). One handler turns it into `{ error: { code, message, details } }`. Anything else is a 500 with no internals leaked. Never choose a status by matching error text.
- **Validation once**: `validate(target, schema)` middleware; handlers read `ctx.req.valid(...)`.
- **Config**: each service imports only its own env (`apiEnv`, `authEnv`, `workerEnv`). Secrets have no production default.
- **Imports**: `#src/...` subpath imports inside a Bun service (they resolve across packages, which the product app's typed client needs); `@socialfly/*` between workspaces. The Next apps use an `@/` alias internally (nothing imports them); shared UI code in `packages/ui` uses relative imports.
- **Comments explain why**, not what.

## Data model

```
users ─┬─ auth_sessions (refresh hash + previous hash for reuse detection)
       ├─ auth_oauth_accounts, auth_email_tokens, auth_audit_events
       └─ memberships ── organizations ─┬─ invitations
                                        ├─ channels (tokens AES-256-GCM encrypted)
                                        ├─ media_assets (source: upload | ai)
                                        ├─ brand_profiles, ai_generations
                                        ├─ research_runs ── research_pages
                                        ├─ competitors, keywords ── keyword_rankings (per UTC day)
                                        ├─ visibility_prompts ── visibility_checks (one engine answer)
                                        ├─ engagement_items ── engagement_replies, listening_queries
                                        ├─ ad_accounts ── ad_campaigns ── ad_campaign_metrics_daily
                                        └─ posts ─┬─ post_media
                                                  └─ post_targets ─┬─ post_target_events
                                                                   └─ post_target_metrics (engagement snapshots)
channels ─┬─ channel_metrics_daily (account numbers per UTC day)
          └─ engagement_cursors (inbox sync position)
```

- **Post vs target.** A post is written once; a target is that post on one channel,
  with its own status, schedule, retries and platform result. Post status is derived
  from its targets (`derivePostStatus`, unit-tested) inside the same transaction.
- **Ids** are UUIDv7 (time-ordered): append-only B-tree inserts and keyset pagination.
- **Migrations** are SQL generated by drizzle-kit, reviewed, committed, and applied
  by a deploy step (never on boot). They must be backward compatible
  (expand → deploy → contract) because a rollback runs old code on the new schema.

## Publishing engine

The part of the system where mistakes are visible to our users' followers.

```
draft ─▶ scheduled ─▶ publishing ─┬─▶ published
   ▲         ▲  (claim)           ├─▶ processing ─(poll)─▶ published
   │         │                    ├─▶ failed        (platform said no — user can fix & retry)
   │         └── retry (new       └─▶ unconfirmed   (outcome unknown — never auto-retried)
   └── unschedule   schedule_version)
```

1. **One job per target**, delayed until `scheduledAt`, on a per-platform queue
   (`publish-linkedin`, `publish-x`, …) rate-limited to that platform's budget.
2. **Deterministic job ids** `publish.<target>.<schedule_version>`: enqueueing twice is a no-op; rescheduling bumps the version so old jobs become stale.
3. **Claim**: a conditional `UPDATE … WHERE schedule_version = $v AND status IN (scheduled, queued)`. Duplicate or stale jobs find no row and exit — exactly one attempt runs.
4. **Current state**: content, media and settings are re-read and re-validated at publish time.
5. **Failure taxonomy** (`ProviderError.kind`) drives the decision (`retry-policy.ts`, unit-tested):
   `auth` → refresh token once and resend (the request was refused); `rate_limited`/`transient` → retry with backoff (≥ Retry-After) up to 5 attempts; `invalid_request` → failed with the platform's reason; `unknown_outcome` → **unconfirmed**, never retried — the user checks the platform and confirms before a manual retry.
6. **Tokens** are refreshed before expiry under a row lock (platforms that rotate refresh tokens would otherwise race).
7. **Self-healing** (maintenance queue): every minute re-enqueue due targets with no live job; every 5 minutes mark targets stuck in `publishing` (worker died) as `unconfirmed`; hourly schedule token refreshes.

Design ideas (per-platform adapters, the pending→processing state, no-retry for
ambiguous publishes) were informed by studying the open-source Postiz project;
no Postiz code is used (it is AGPL-3.0).

## Integrations

`packages/integrations` — one adapter per platform behind `SocialProvider`
(`src/types.ts`). Adapters are stateless: tokens and media URLs in, results or a
typed `ProviderError` out. Limits are declared as data (`capabilities`), so the
composer validates before scheduling. A platform with missing credentials is
hidden, not broken.

| Provider | Connect | Publish | Notes |
|---|---|---|---|
| `linkedin`, `linkedin_page` | OAuth 2 | text, images, video | versioned REST API; pages need Community Management API approval |
| `facebook` | Facebook Login | text, photos, multi-photo, video | page tokens, no expiry |
| `instagram` | Facebook Login | feed, carousel, reel, story | containers → async processing → publish |
| `threads` | Threads OAuth | text, image/video, carousel | long-lived token refresh |
| `x` | OAuth 2 + PKCE | text, 4 images or 1 video | chunked media upload; rotating refresh tokens |
| `reddit` | OAuth 2 | self and link posts | media upload intentionally out of scope |
| `youtube` | Google OAuth | video | resumable upload; default API quota ≈ 6 uploads/day |

## AI content

`packages/ai` — the provider layer, stateless like the platform adapters: request in,
content + what it cost out. Persistence, budgets and retries live in the callers.

| Capability | Provider (official SDK) | Where it runs | Why there |
|---|---|---|---|
| Posts per platform, rewrites, hashtags, carousel outlines | Anthropic Claude (`AI_TEXT_MODEL`, default `claude-opus-5-5`) | API, synchronously | 5–20 s; the user is waiting in the composer |
| Images | OpenAI `gpt-image-1`, then Gemini (fallback chain) | worker, `ai-media` queue | 10–60 s, paid per call — never on the request path |
| Carousel slides (PNG, 1080×1350) | Satori → resvg (WebAssembly) | worker, `ai-media` queue | CPU work; no browser, no native binaries |
| Video scripts (scenes, caption, hashtags) | Anthropic Claude | API, synchronously | same as posts |
| Short videos (MP4, 1080×1920) | scene backgrounds (own library image, AI image at 9:16, or theme gradient) + OpenAI TTS voiceover (`OPENAI_TTS_MODEL`) → Satori captions → ffmpeg (zoompan, crossfades, AAC) | worker, `ai-media` queue | 1–4 min; the worker image ships Alpine's `ffmpeg` |

- **Structured output, not parsing.** Every text task is one call constrained to a Zod
  schema (`output_config.format`), then post-processed for hard limits the model might
  miss: per-platform character limits (`fitText`) and hashtag counts/format.
- **Brand voice** (`brand_profiles`) is injected into every prompt; user text is wrapped
  in tags and the system prompt says it is data, never instructions.
- **Refusals.** Claude calls send `fallbacks: "default"` so a benign request declined by a
  safety classifier is re-run server-side on the recommended fallback model. A final
  refusal is `AiError("refused")` → 422, never retried. Image providers: a refusal stops
  the chain (the next provider would refuse too); an outage falls through to the next.
- **Metering.** `ai_generations` records every call — succeeded or failed — with tokens
  and `cost_micros` (integer micro-dollars, list prices in `pricing.ts`; unknown models
  are priced at the highest rate so they can never look free). The API refuses new
  generations once an organization's month-to-date cost reaches
  `AI_ORG_MONTHLY_BUDGET_USD` (`0` = unlimited).
- **Media jobs** are idempotent: the worker skips a generation already `succeeded` or
  `failed`, adds (never overwrites) cost across attempts, and at most 2 attempts run.
  Output lands in `media_assets` with `source = 'ai'`, so it flows into the composer and
  publishing like any upload. Generations stuck for 30 minutes are failed by maintenance.
- **Videos** are one generation of kind `video` → one `media_assets` row (`kind = video`).
  AI backgrounds and voiceover are the only paid steps: the API requires their provider
  (503 otherwise) and checks the budget only when one is used. Per-scene paid calls run
  2 at a time; the cost of calls that succeeded is billed even when a later one or the
  render fails. The `ai-media` queue holds a 10-minute BullMQ lock so a long render is
  never declared stalled.
- **Missing keys hide features** (`GET /ai/capabilities`), exactly like platform credentials.

## Analytics

Read-only engagement numbers from the platforms, collected by the worker and reported
by the API. Adapters expose them through the optional `SocialProvider.analytics`
(`getPostMetrics`, `maxPostsPerCall`, optional `getAccountMetrics`); a platform without
it is simply skipped.

```
job scheduler (15 min) ─▶ plan ─┬─▶ collect-posts   <channel>  ─▶ post_target_metrics (append a snapshot)
   (analytics queue)            └─▶ collect-account <channel>  ─▶ channel_metrics_daily (upsert per day)
```

- **Due by age.** A published target is collected hourly while < 48 h old, every 6 h
  until 7 days, daily until 30 days, then never again (its last numbers are final).
  "Last collected" is the target's newest `captured_at`. Account numbers: once a day
  per channel, re-reading the last 3 UTC days because platforms revise them late.
- **One job per channel**, not per post: platforms answer several posts per call
  (`maxPostsPerCall`). Job ids carry a time bucket (`analytics.posts.<channel>.<hour>`,
  `analytics.account.<channel>.<utc-day>`), so planner runs on any number of replicas
  collapse onto one job per bucket.
- **Never starve publishing.** Its own queue (concurrency 2) plus a per-provider call
  budget in Redis (30 calls/min by default, shared by all replicas). A spent budget
  delays the job without using a retry. Platforms meter the app, and late numbers cost
  nothing while a throttled app cannot publish.
- **Failures.** Reads are safe to retry: `rate_limited`/`transient` → BullMQ retries
  (3 attempts, backoff), and batches already stored are no longer due, so a retry
  resumes. `auth` → one token refresh through `ChannelTokens` (same locked path as
  publishing), then give up for this run *without* flagging the channel (usually a
  missing analytics scope, and publishing still works). `invalid_request` → skip that
  batch. A post the platform no longer returns (deleted there) gets no row.
- **Unknown ≠ zero.** Metrics are nullable columns; a metric a platform does not report
  stays null all the way to the API.
- **Channels** that need reauth, are disconnected, or belong to a deleted organization
  are skipped (checked again when the job runs).

API (`/analytics`, every member can read; refresh needs editor):

| Route | Returns |
|---|---|
| `GET /overview?from&to&channelIds` | totals, previous-period totals, daily series, per-channel numbers (+ followers), top 5 posts, last collection time |
| `GET /posts?from&to&channelIds&sort&before&limit` | published targets with latest metrics; keyset cursor for `sort=publishedAt`, top-N (no cursor) for metric sorts, whose values move between pages |
| `GET /posts/:postId` | per target: latest metrics + up to 200 snapshots (oldest first) |
| `GET /channels/:channelId?from&to` | account numbers per day |
| `GET /best-times?channelIds&weeks` | weekday×hour heatmap; recommendations from the org's own data (≥ 20 measured posts) or from general per-platform guidance |
| `POST /refresh` | 202 `{ queued }`; one per organization per 10 minutes (Redis `SET NX EX`), else 429 with `retryAfterSeconds` |

- **Semantics.** Each target counts with its LATEST snapshot. `engagements` = likes +
  comments + shares + saves (a missing one counts 0; all missing → null).
  `engagementRate` = engagements / impressions over targets reporting both (a platform
  that hides impressions would otherwise inflate it). "posts" counts publications
  (targets), so one post on three channels is 3. Deleted posts are left out.
- **Dates** are calendar days in the organization's timezone (`organizations.timezone`);
  ranges default to the last 28 days and may span at most 366. Account numbers are
  stored per UTC day, as the platforms report them.
- **Queries** are raw SQL with explicit table aliases (latest snapshot via `LATERAL …
  LIMIT 1` on the `(target_id, captured_at)` index): drizzle leaves columns unqualified
  in single-table queries, which silently breaks correlated subqueries.

## Research, SEO & AI visibility

`packages/research` — stateless like `packages/ai`: a polite crawler, the brand-analysis
text task, AI-visibility engines (Claude, ChatGPT, Gemini, Perplexity), deterministic
mention scoring, sentiment, and a DataForSEO client. Each paid call reports its cost in
micro-USD. Persistence, budgets, schedules and retries live in the worker and the API.

```
POST /research/runs ─▶ research_runs (pending) ─▶ research queue: crawl <run>
                         crawling  ─▶ research_pages (upsert + progress per page)
                         analyzing ─▶ analyzeBrand (text model) ─▶ insights ─▶ succeeded
job scheduler (7 d) ─▶ visibility-plan ─▶ visibility-org <org> ─▶ visibility_checks
job scheduler (7 d) ─▶ seo-plan        ─▶ seo-refresh <org>    ─▶ keyword metrics, keyword_rankings
```

- **One queue** (`research`, concurrency 2, 10-minute BullMQ lock: a crawl or a round of
  engine calls is minutes of network waits). Job ids: `research.crawl.<run>`; per-org
  jobs carry the week number (`research.visibility.<org>.w<week>`) so planner runs and
  replicas collapse onto one job per week; a user's "run now" gets its own 10-minute
  bucket (`…f<bucket>`). Two attempts: every processor resumes rather than repeats.
- **Research runs.** The worker is the only writer of `research_runs.status` after the
  API inserts `pending` (plus the maintenance sweep) — the same ownership rule as AI
  media. One active run per organization (advisory lock + check in the API → 409). The
  crawl obeys robots.txt; a site that disallows us fails as `robots_disallowed` with a
  message telling the user how to allow SocialFlyBot. A retry whose crawl finished
  (status `analyzing`) re-uses the stored pages. Failure semantics mirror AI media: a
  non-retryable `AiError` fails the run without a throw; anything else is retried and
  fails on the last attempt with a user-safe message. Runs still active after 30 minutes
  are failed as `timeout` by the `recover-stuck-targets` maintenance task.
- **Metering.** Every paid run writes ONE `ai_generations` row (`kind` = `research`,
  `visibility` or `seo`) with its total cost, so these features draw on the same monthly
  AI budget as posts and images. The API refuses research, keyword ideas and "run now"
  with 429 `ai_budget_exceeded`; scheduled visibility and SEO jobs skip an organization
  over budget (the worker replicates the API's effective-budget rule in
  `apps/worker/src/research/budget.ts`). Spend already paid is billed even when a run
  ends in an error.
- **AI visibility.** Every active prompt (at most 25 per org) × every configured engine,
  2 calls in flight. Each answer is scored by `analyzeMention` (brand = brand profile
  name, else the organization name; domain = brand profile website; competitors with
  their aliases and domains) and, only when the brand is mentioned, classified for
  sentiment by the text model. An engine that errors is stored as a check with its
  `errorCode` and an empty answer — the run carries on. Pairs answered successfully in
  the last 6 days (scheduled) or 30 minutes (forced) are skipped, which makes replans
  and retries free. Answers are capped at 8,000 characters.
- **SEO** (only with DataForSEO credentials). Keyword metrics are refreshed when never
  measured or older than 30 days (batches of 100 per location/language; a keyword the
  provider knows nothing about stays null but is marked measured). Tracked keywords get
  the Google position of the brand's domain once per UTC day (`keyword_rankings`,
  upsert). Adding or tracking keywords enqueues a forced refresh right away.
- **Missing keys hide features** (`GET /research/capabilities`): research needs the text
  model, SEO needs DataForSEO, each visibility engine needs its provider key.

API (`/research`; every member can read, writes and paid calls need editor):

| Route | Returns |
|---|---|
| `GET /capabilities` | `{ research, seo, visibilityEngines: {id, model}[] }` |
| `POST /runs { url? }` | 202 run. `url` defaults to the brand website (422 `no_website`); https assumed; IPs and intranet hosts refused (422 `invalid_url`); 409 `research_in_progress`; 503 without a text model; 429 over budget |
| `GET /runs?limit`, `/runs/latest`, `/runs/:id`, `/runs/:id/pages?before&limit` | runs newest first; latest = latest succeeded, else latest, else null; pages keyset-paginated |
| `POST /insights/apply` | adds picked buyer questions (→ prompts, up to the 25-active cap), competitors (source `ai`) and keywords; duplicates skipped case-insensitively |
| `GET/POST /competitors`, `PATCH/DELETE /competitors/:id` | names unique per org regardless of case (409 `competitor_exists`); domains stored bare (`acme.com`) |
| `GET/POST /keywords`, `PATCH/DELETE /keywords/:id`, `GET /keywords/:id/rankings?days` | keywords (≤ 500 per org) with metrics and latest + previous position; ranking history per day |
| `POST /keywords/ideas` | related keywords with metrics, synchronously; billed (`kind = seo`); 503 without DataForSEO |
| `GET/POST /visibility/prompts`, `PATCH/DELETE /visibility/prompts/:id` | prompts with last check and 30-day mention rate; at most 25 active (409 `prompt_limit`) |
| `POST /visibility/run` | 202; one per organization per hour (Redis `SET NX EX`), else 429 with `retryAfterSeconds` |
| `GET /visibility/summary?days` | mention rate, average rank, sentiment, own-citation rate, per engine, share of voice, weekly trend |
| `GET /visibility/prompts/:id/checks?limit`, `GET /visibility/checks/:id` | answers (400-character excerpt in lists, full answer by id) with citations and the competitors named |

- **Report semantics.** Errored checks are excluded from every rate — an engine outage
  says nothing about visibility. Rates are 0–1 fractions, or null when there is no
  successful check. Share of voice = mentions of the brand (or of one competitor) over
  all brand + competitor mentions. Weeks start on Monday, in UTC. Competitors deleted
  since a check are dropped from it.

## Engagement inbox

Comments on our posts, replies under them, public mentions and keyword-listening
discussions in one inbox, scored by AI and answered from SocialFly. Adapters expose it
through the optional `SocialProvider.engagement` (`listComments`, optional
`listMentions` / `searchDiscussions`, `reply`, `requiredScopes`, `maxReplyLength`); a
platform without it is skipped, like analytics.

```
job scheduler (10 min) ─▶ plan ─┬─▶ sync-channel <channel> ─▶ engagement_items (insert-only) + engagement_cursors
   (engagement queue)           ├─▶ listen <query>         ─▶ engagement_items kind=discussion (≤ 25 new per run)
                                └─▶ triage <org>           ─▶ relevance / reason / sentiment + ai_generations (triage)

user ─▶ POST /inbox/items/:id/draft   ─▶ draftReply (text model; ai_generations reply_draft) ─▶ text, not saved
     ─▶ POST /inbox/items/:id/replies ─▶ engagement_replies ─▶ engagement-reply-<provider> queue ─▶ platform
```

- **Reads** follow analytics: one job per channel with 10-minute bucketed ids
  (`engagement.sync.<channel>.<bucket>`; "sync now" gets `engagement.sync-now.…`), its own
  queue (concurrency 2), and a per-provider call budget in Redis separate from analytics
  (20 calls/min, `sf:engagement:budget:*`). `auth` → one token refresh, then give up for
  this run without flagging the channel (usually a missing inbox scope while publishing
  works); `invalid_request` → skip the batch; `rate_limited`/`transient` → BullMQ retry.
- **Scopes gate everything.** A channel is synced only when `channels.scopes` holds
  `requiredScopes.read`, and can be answered only with `requiredScopes.reply`. Channels
  connected before the inbox existed keep publishing; `GET /inbox/settings` lists the
  missing scopes a reconnect would grant.
- **Sync.** Comments are read for the channel's published targets of the last 14 days
  (batched by `maxPostsPerCall`), plus mentions. Each run asks from the cursor minus a
  10-minute overlap (platforms index late) and moves the cursor to when the run started.
  Items are inserted with `ON CONFLICT (channel_id, external_id) DO NOTHING`: a re-read
  never overwrites triage, a status the user set, or an answered item. Comments link to
  their `post_target` by the post's platform id. Our own messages (`fromSelf`) are stored
  as `read` — thread context, never something to answer.
- **Listening.** Each active query (≤ 10 per org) runs at most hourly, per provider with
  `searchDiscussions`, signed in as any active channel of the org on that platform that
  holds the read scopes.
- **Triage.** Untriaged, non-self items, 100 per job in calls of 25 (`triageItems`): 0–100
  relevance (questions, complaints, leads, high-intent discussions high; spam and generic
  praise low), a one-line reason, and sentiment. Skipped when there is no text model or the
  organization's monthly AI budget is spent (the worker's copy of the API rule). Items the
  model skips, and batches it refuses, are marked triaged without a score so they are not
  paid for again every 10 minutes. One `ai_generations` row (kind `triage`) per call.
- **Drafts** (`draftReply`) get the brand profile, our post, the last 10 messages of the
  thread, an optional tone and instruction, and the platform's reply limit (enforced with
  `fitText`). Stranger-written text is wrapped as data; the model is told never to invent
  prices, offers or facts, and replies carry no hashtags except where they are native.

### Reply state machine

```
draft ⇄ pending_approval ──approve──▶ queued ──(claim)──▶ sending ─┬─▶ sent         (item → replied; our reply joins the thread)
  ▲       │  (an edit keeps it pending)  ▲                          ├─▶ failed       (platform said no — fix & retry)
  │       └──reject──▶ rejected ─resubmit┘                          └─▶ unconfirmed  (outcome unknown — never auto-retried)
  └── submit=false                       ▲
                                         ├── retry (failed; unconfirmed only with confirmNotSent)
                                         └── rate_limited / transient before sending (delayed job, new version)
```

- **Ownership.** The API's inbox service writes draft, pending_approval, rejected and
  queued (including manual retries); the worker's reply sender
  (`apps/worker/src/engagement/`) writes sending, sent, failed, unconfirmed and automatic
  requeues. Nobody else writes `engagement_replies.status`. Every transition is a
  conditional UPDATE on the expected status, and an item has at most one reply in flight
  (pending, queued or sending). `approved` exists in the enum but is not a resting state:
  approving records who and when, and queues in the same write.
- **Approval.** `organizations.reply_approval_required` (default on): an editor's submit
  waits for an admin/owner; an admin's or owner's submit — or anyone's when approval is
  off — is approved by the submitter and queued at once. Viewers read only.
- **Sending is publishing.** A reply is a visible public post in the brand's name, so it
  reuses the publishing rules: one queue per platform (`engagement-reply-<provider>`,
  rate-limited with the provider's `publishRateLimit`), one BullMQ attempt, a job id
  `engagement-reply.<reply>.<version>` where the version is `engagement_replies.attempts`,
  and a claim (`queued → sending` only while the attempts still match, which bumps them)
  so duplicate or stale jobs exit. Text, item, channel status, reply scopes and length are
  re-checked at send time. Failures go through the publishing engine's own `decide()`:
  `auth` → refresh once and resend (a 401/403 is a refusal); `rate_limited`/`transient` →
  back to `queued` with a delayed job (up to 5 attempts); `invalid_request` → `failed`
  with the platform's reason; `unknown_outcome` (or any error after the call went out) →
  **`unconfirmed`**. Still refused after a refresh → `failed` (`reply_not_authorized`),
  without flagging the channel: publishing may work fine without the reply scope.
- **Why replies are never retried automatically.** Platforms have no idempotency keys for
  comments. After a timeout or a dropped connection the reply may already be live, and a
  blind retry posts it twice under the brand's name, in public, under a customer's
  question. Only a person who has looked at the thread can say it is not there
  (`POST /inbox/replies/:id/retry { confirmNotSent: true }`).
- **Self-healing** (maintenance): replies `queued` for 2 minutes with no live job are
  re-enqueued (with the due-target sweep, every minute); replies stuck in `sending` for 10
  minutes become `unconfirmed` (with `recover-stuck-targets`).

API (`/inbox`; every member reads, editors triage, draft and reply, admins approve):

| Route | Returns |
|---|---|
| `GET /items?status&channelIds&kinds&minRelevance&sentiment&q&sort&before&limit` | items (text ≤ 2,000 chars) with `canReply` / `replyBlockedReason` and the latest reply, keyset `nextCursor`, and `counts { new, open, needsApproval }`; `status=open` (default) = new + read; our own messages are never listed |
| `GET /items/:id` | the item (full text) + `thread` (same post, parent and answers on that channel, oldest first, ours included) + `replies` |
| `PATCH /items`, `PATCH /items/:id` | bulk status (≤ 100 ids) → `{ updated }`; one item's status / assignee (must be a member) |
| `POST /items/:id/draft` | `{ text, generationId }`; 503 without a text model, 429 over budget |
| `POST /items/:id/replies { text, source, submit }` | 201 reply; 422 `reply_too_long` (`details.limit`), 409 `reply_not_possible` (`details.reason`), 409 `reply_in_progress` |
| `PATCH /replies/:id`, `POST /replies/:id/approve` · `/reject` · `/retry`, `DELETE /replies/:id` | the workflow above; 409 `confirm_required` for an unconfirmed retry without `confirmNotSent` |
| `GET /approvals` | pending replies with their items (admin) |
| `GET/POST /listening`, `PATCH/DELETE /listening/:id` | queries with `newCount`, plus `availableProviders`; 409 `query_limit` past 10 active; 422 `provider_unavailable` |
| `GET/PATCH /settings` | `replyApprovalRequired` and per channel `supportsInbox`, `canRead`, `canReply`, `missingScopes` |
| `POST /sync` | 202 `{ queued }`; one per organization per 5 minutes, else 429 with `retryAfterSeconds` |

## Ads

Paid campaigns on Meta (Facebook + Instagram), Google, LinkedIn, TikTok, Pinterest and X,
drafted (optionally with AI copy), approved, created and started from SocialFly, with
spend synced back. Ad platforms are separate adapters (`AdsProvider`,
`packages/integrations/src/ads/`) and separate connections (`ad_accounts`): different
OAuth permissions, often a different app approval, and one login can manage many ad
accounts. A platform without credentials is hidden (`GET /ads/providers` → `configured`).

```
connect (admin) ─▶ OAuth ─▶ pending selection (Redis, sealed) ─▶ ad_accounts (tokens AES-256-GCM)
                                                                   └─ identity: page / org / board / funding instrument
draft (editor, AI copy optional) ─▶ submit ─▶ approve (admin) ─▶ ads-write-<provider>: create ─▶ PAUSED on the platform
                                              activate (admin, budget typed back) ─▶ ads-write-<provider>: activate ─▶ spending
job scheduler (30 min) ─▶ ads: sync-plan ─▶ sync-account <account> ─▶ status reconcile + ad_campaign_metrics_daily
```

### Money-safety model

Mistakes here cost the customer money, so every layer assumes the others can fail:

1. **Nothing spends without a person.** Every adapter creates campaigns (and their ad
   sets, creatives, ads) **PAUSED** — that is the `createCampaign` contract. The only call
   that starts spending is `setStatus(…, "active")`, and the only job that makes it is
   `activate`, which the API enqueues only when an admin or owner asks for it on a paused
   campaign **and types the budget back exactly** (`POST /ads/campaigns/:id/activate
   { confirmBudget }`, 422 `confirm_mismatch` otherwise — "I thought it was 50, not 500").
2. **Hard ceilings.** `ADS_MAX_DAILY_BUDGET` (server, default 500, `0` = none) and
   `organizations.ads_max_daily_budget` (an organization may only lower it) cap the daily
   budget of any campaign, in the account's currency; a lifetime budget is checked as
   budget ÷ days. Checked at submit, approval, retry and activation (API), and once more by
   the worker right before it calls `setStatus("active")` — a ceiling lowered after
   approval still wins.
3. **Validation before anything is sent.** Submit/approve run zod, the budget rules, the
   account's status and identity (`identityRequired`), the provider's capabilities, media
   (the organization's `ready` media only), the "not political / not a special category"
   declaration, and the adapter's pure `validate(draft, { currency, metadata })`; all
   problems come back at once as 422 `ads_invalid` (`details.problems[]`). The worker
   re-runs `validate` on current state before creating.
4. **Never twice, never blind.** Mutations follow the publishing engine: one queue per
   platform (`ads-write-<provider>`, rate limited with the adapter's `writeRateLimit`), one
   BullMQ attempt, deterministic job ids `ads.<campaign>.<version>`, a conditional claim on
   `(version, status)` that bumps the version, and the publishing `decide()` policy. An
   unknown outcome is never retried automatically.
5. **Declarations.** Adapters tell the platforms the ad is not political and not in a
   special category (Meta `special_ad_categories: []`, Google's EU political flag,
   LinkedIn `politicalIntent`), so submitting requires the user to confirm it
   (`declarations.notPoliticalOrSpecialCategory: true`); who confirmed and when is stored
   in the draft and shown on the campaign.

### Campaign state machine

```
draft ⇄ pending_approval ──approve──▶ approved ──(claim)──▶ creating ─┬─▶ paused ⇄ active ─▶ completed
  ▲       │ (an edit keeps it pending)   ▲                            ├─▶ failed       (platform said no; orphans recorded)
  │       └──reject──▶ rejected ─resubmit┘                            └─▶ unconfirmed  (may exist — never auto-retried)
  └── submit=false                       ├── retry (failed; unconfirmed only with confirmNotCreated; never once created)
                                         └── rate_limited / transient before creating (delayed job, bounded)
paused / active / completed / failed-or-unconfirmed with a platform id ──archive──▶ archived
```

- **Ownership.** The API's ads service writes draft, pending_approval, approved, rejected
  (and `archived` for a campaign that never reached the platform); the worker
  (`apps/worker/src/ads/`: `AdCampaignState`, the writer and the sync) writes creating,
  paused, active, completed, failed, unconfirmed and platform archiving. Nobody else writes
  `ad_campaigns.status`. A request (approve, activate, pause, archive, retry) bumps
  `version` and enqueues under it; every worker write is conditional on the version it
  claimed, so a newer request makes older jobs stale instead of racing them.
- **Approval.** An editor's submit waits for an admin/owner; an admin's or owner's submit
  is approved at once. Approval only creates the campaign — paused. Viewers read.
- **Create failures.** `auth` → one token refresh and resend (a 401/403 is a refusal);
  `rate_limited`/`transient` → back to `approved` with a delayed job (bounded by the
  publishing `MAX_ATTEMPTS`); `invalid_request` → `failed` with the platform's message, and
  objects the adapter could not clean up (`details.orphanedExternalIds`) are named in the
  message and kept in `externalObjects` (`type: "orphan"`) so a person can remove them;
  `unknown_outcome` (or an error after the call went out) → `unconfirmed`: the user checks
  the ads manager, then `POST /retry { confirmNotCreated: true }`.
- **Status failures** (activate/pause/archive) keep the status and set `errorCode`
  (`activate_failed`, `pause_failed`, …). An unknown outcome sets `status_unconfirmed` and
  immediately makes a **read** (`getCampaignStatus`, safe to repeat) to reconcile. A failed
  or refused activation also clears `activatedBy/At`. Where a platform cannot archive,
  archiving pauses it there. Activate/pause/archive leave no status marker while queued,
  so an enqueue failure is a 503 the user retries rather than a silent loss.
- **Self-healing** (maintenance): campaigns `approved` for 2 minutes with no live job are
  re-enqueued (with the due-target sweep); campaigns stuck in `creating` for 15 minutes
  become `unconfirmed` (with `recover-stuck-targets`).

### Sync

A job scheduler runs `sync-plan` every 30 minutes on the `ads` queue (concurrency 2): one
`sync-account` per active ad account that has created campaigns, with 30-minute bucketed
ids (`ads.sync.<account>.<bucket>`). For each paused/active campaign it reads the platform
status — a campaign paused, resumed or deleted in the ads manager is reconciled
(`paused`/`active`/`archived`), a platform rejection becomes `failed`
(`rejected_by_platform`), a campaign past its end date `completed`, `in_review` only
updates `platformStatus` — then reads the last 3 days of insights (in the account's
timezone; platforms revise spend late) into `ad_campaign_metrics_daily` (upsert; spend is
always overwritten, a metric missing from an answer keeps its stored value). Reads have
their own per-provider call budget in Redis (20 calls/min, `sf:ads:budget:*`): a spent
budget delays the job without a retry; `auth` → one refresh, then skip the run;
`invalid_request` → skip that call. Status writes are conditional on the version and
status read, so a sync never overwrites a request made meanwhile.

### Tokens and identity

`AdTokens` (worker) mirrors `ChannelTokens`: decrypt, refresh before expiry under a row
lock, `needs_reauth` when the platform revokes the refresh; tokens are refreshed when used
(the 30-minute sync keeps them fresh). The API refreshes the same way for the one read it
makes itself, targeting search. X Ads is OAuth 1.0a: the request token travels as the
PKCE-style verifier, `oauth_verifier` is the code, and the user's token secret is sealed in
`token_secret_enc`. Each account's ads run as an identity the admin picks after connecting
(`PATCH /ads/accounts/:id { metadata }`, only the keys that platform uses): Meta `pageId`
(+ optional `instagramUserId`, and `pixelId`, required for leads/sales), LinkedIn
`organizationUrn`, TikTok `identityId` (+ `identityType`), Pinterest `boardId`, X
`fundingInstrumentId`. `GET /accounts/:id/identities` offers Meta pages from connect time
plus the organization's Facebook/Instagram channels, and LinkedIn company pages from its
`linkedin_page` channels; other fields are typed in (the ads contract has no identity
listing call). Disconnecting is refused (409 `ad_account_in_use`) while a campaign on the
account exists or may exist on the platform — SocialFly could no longer pause it.

### AI ad copy

`writeAdCopy` (`packages/ai/src/ads.ts`) writes 1–3 variants for the account's platform and
format plus targeting ideas, with the brand profile and the latest research brief (value
proposition, audience, buyer questions) as context. Documented per-platform limits are
enforced after the call (Meta primary text 125 / headline 40; Google RSA headlines 30 ×
3–15 and descriptions 90 × 2–4; LinkedIn 150 / 70; TikTok 100; Pinterest 500 / 100; X 280).
Every sentence that makes a price, percentage, discount, "free" offer, guarantee or ranking
claim not present in the input — or addresses a personal attribute of the reader ("Are you
depressed?", which the platforms' policies forbid) — is removed deterministically; a
variant with nothing safe left is dropped. Budgeted and metered like every text task
(`ai_generations` kind `ad_copy`).

API (`/ads`; every member reads; editors draft, submit, pause, retry and use AI copy and
targeting search; admins/owners connect accounts, approve, activate, archive and set the
ceiling):

| Route | Returns |
|---|---|
| `GET /providers` | `[{ id, displayName, configured, objectives, formats, textLimits, minDailyBudgetUsd }]` |
| `POST /connect/:provider` → `GET /callback/:provider` (browser) | `{ url }`; the callback redirects to `WEB_URL/ads/connect?pending=<key>` (or `?error=`) |
| `GET /pending/:key`, `POST /accounts { pendingKey, externalIds }` | accounts to choose (`alreadyConnected`); 201 `AccountDto[]`; 410 `connect_expired` |
| `GET /accounts`, `PATCH /accounts/:id { metadata }`, `DELETE /accounts/:id` | `AccountDto { id, provider, name, currency, timezone, status, metadata (identity only), lastError, identityRequired, createdAt }`; 422 `invalid_metadata`; 409 `ad_account_in_use` |
| `GET /accounts/:id/identities` | `{ fields: [{ key, label, required, hint, value, options }] }` (`options: null` = typed in) |
| `GET /accounts/:id/targeting?type&q` | `TargetingOption[]`; 30/min per organization (429 with `retryAfterSeconds`) |
| `POST /copy` | `{ variants, targetingSuggestions, generationId }`; 503 without a text model, 429 over budget |
| `GET /campaigns?status&adAccountId&before&limit`, `GET /campaigns/:id` | `{ items: CampaignDto[], nextCursor }`; the detail adds `draft`, `declarations` and `metrics { totals { spend, impressions, clicks, conversions, ctr, cpc, cpm }, daily[] }` |
| `POST /campaigns`, `PATCH /campaigns/:id`, `DELETE /campaigns/:id` | the workflow above; 422 `ads_invalid`; 409 `campaign_not_editable` / `campaign_not_deletable` / `campaign_changed` |
| `POST /campaigns/:id/approve` · `/reject` · `/activate { confirmBudget }` · `/pause` · `/archive` · `/retry { confirmNotCreated }` | the campaign; 409 `not_pending` / `not_paused` / `not_active` / `not_archivable` / `confirm_required` / `already_created`; 422 `confirm_mismatch`; 503 `queue_unavailable` |
| `GET/PATCH /settings` | `{ maxDailyBudget (effective), serverCeiling, orgCeiling }`; 422 `ceiling_too_high` |
| `GET /overview?from&to` | `{ from, to, totals[] (per currency, each with a zero-filled daily[] for every day of the range), byCampaign[], byProvider[], currencyNote }` — money never summed across currencies |

## Observability

- **Logs**: pino JSON to stdout, secrets/PII redacted, `trace_id` on every line, mirrored to OTel logs.
- **Traces**: one server span per request named by route; W3C context propagates app → api.
- **Metrics**: `http.server.request.duration`, `socialfly.publish.outcomes{provider,outcome}`, `socialfly.publish.duration`, `socialfly.analytics.snapshots{provider,kind}`, `socialfly.engagement.items{provider,kind}`, `socialfly.engagement.replies{provider,outcome}`, `socialfly.ads.writes{provider,action,outcome}`.
- **Errors**: Sentry (optional, via `SENTRY_DSN`).
- **Probes**: `/health` (process alive, never touches dependencies) and `/ready` (checks Postgres/Redis/queue — used by the deploy smoke test).
- Local: Grafana LGTM. Production: services → OTel Collector (`infra/otel/collector.yaml`) → backend of choice.

## Security

- Access JWT 15 min; refresh token rotated on every use, stored hashed; replay of a rotated-out token revokes every session (30 s grace for concurrent tabs).
- Revocation checked per request (logout / password change take effect immediately).
- Double-submit CSRF on cookie-authenticated writes; allowed origins per first-party client.
- Platform tokens encrypted at rest (AES-256-GCM, key id in the ciphertext, rotation supported).
- OAuth `state` single-use in Redis; PKCE where supported; invitations bound to the invited email.
- Website research is SSRF-guarded: every crawl request (start URL and each redirect hop) must resolve to public addresses only — no loopback, private, link-local/metadata (169.254.169.254) or CGNAT ranges (`packages/research/src/net-guard.ts`). Production should additionally deny the worker egress to metadata endpoints (DNS rebinding is only partly mitigated in-process).
- gitleaks in pre-commit and CI; `bun audit` weekly; containers run as non-root.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Monorepo, tooling, infra, CI/CD, observability | ✅ |
| 1 | Auth, organizations, roles, invitations, channel connections | ✅ |
| 2 | Media, composer, scheduling, publishing engine (8 platforms) | ✅ (platform calls not yet exercised against live accounts) |
| 3 | AI content: posts, rewrites, hashtags, images, carousels, brand voice, budgets | ✅ |
| 3b | AI short videos: scripts, AI/library/theme backgrounds, voiceover, ffmpeg render | ✅ (backend; not yet rendered against live OpenAI TTS) |
| 4 | Analytics: platform adapters, collector, reports API, dashboards, best times | ✅ (adapters not yet verified against live accounts) |
| 5 | Research + SEO/AEO + AI-visibility: crawler, brand briefs, competitors, keywords & rankings, AI-engine citation tracking | ✅ (backend; engines and DataForSEO not yet exercised against live accounts) |
| 6 | Engagement inbox: comments, mentions, listening, AI triage & reply drafts, approval, reply sending | ✅ (backend; adapters not yet exercised against live accounts) |
| 7 | Ads: ad-account connections, AI ad copy, campaign drafts with approval, paused creation, typed-budget activation, status & spend sync (Meta/Google/LinkedIn/TikTok/Pinterest/X) | ✅ (backend; adapters not yet exercised against live ad accounts) |
