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
| `apps/api` | Everything tenant-scoped: organizations & roles, invitations, channel OAuth, media, posts & scheduling, AI text generation & brand voice, analytics reports | Postgres, Redis, storage, SMTP, Anthropic | 4400 |
| `apps/worker` | Publishing engine, async-media status polling, token refresh, AI media (images, carousels), analytics collection, maintenance (sweep, stuck recovery) | Postgres, Redis, storage, platform + AI APIs | 4500 |
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
                                        └─ posts ─┬─ post_media
                                                  └─ post_targets ─┬─ post_target_events
                                                                   └─ post_target_metrics (engagement snapshots)
channels ── channel_metrics_daily (account numbers per UTC day)
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
| Posts per platform, rewrites, hashtags, carousel outlines | Anthropic Claude (`AI_TEXT_MODEL`, default `claude-opus-5`) | API, synchronously | 5–20 s; the user is waiting in the composer |
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

## Observability

- **Logs**: pino JSON to stdout, secrets/PII redacted, `trace_id` on every line, mirrored to OTel logs.
- **Traces**: one server span per request named by route; W3C context propagates app → api.
- **Metrics**: `http.server.request.duration`, `socialfly.publish.outcomes{provider,outcome}`, `socialfly.publish.duration`, `socialfly.analytics.snapshots{provider,kind}`.
- **Errors**: Sentry (optional, via `SENTRY_DSN`).
- **Probes**: `/health` (process alive, never touches dependencies) and `/ready` (checks Postgres/Redis/queue — used by the deploy smoke test).
- Local: Grafana LGTM. Production: services → OTel Collector (`infra/otel/collector.yaml`) → backend of choice.

## Security

- Access JWT 15 min; refresh token rotated on every use, stored hashed; replay of a rotated-out token revokes every session (30 s grace for concurrent tabs).
- Revocation checked per request (logout / password change take effect immediately).
- Double-submit CSRF on cookie-authenticated writes; allowed origins per first-party client.
- Platform tokens encrypted at rest (AES-256-GCM, key id in the ciphertext, rotation supported).
- OAuth `state` single-use in Redis; PKCE where supported; invitations bound to the invited email.
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
| 5 | Research + SEO/AEO + AI-visibility (pgvector, crawler, LLM citation tracking) | |
| 6 | Engagement inbox: listening, reply drafts, approval | |
| 7 | Ads: campaign drafts, Meta/Google/LinkedIn/TikTok/X/Pinterest sync | |
