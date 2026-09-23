<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg">
    <img alt="SocialFly" src=".github/assets/logo-light.svg" width="320">
  </picture>
</p>

<p align="center">
  <b>AI marketing automation for social media.</b><br>
  Research your brand, create content, schedule and publish it everywhere, engage with
  conversations, run ads, and measure what works — in one product.
</p>

<p align="center">
  <a href="docs/ci-jenkins.md"><img alt="CI: Jenkins" src="https://img.shields.io/badge/CI-Jenkins-D24939?logo=jenkins&logoColor=white"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="Bun" src="https://img.shields.io/badge/Bun-1.3-000?logo=bun">
</p>

<p align="center">
  <a href="#-quick-start">Quick start</a> ·
  <a href="docs/architecture.md">Architecture</a> ·
  <a href="docs/platforms.md">Platform setup</a> ·
  <a href="CONTRIBUTING.md">Working on the code</a>
</p>

<p align="center">
  <img src="apps/site/public/assets/applogos/linkedin.svg" width="32" alt="LinkedIn">&nbsp;
  <img src="apps/site/public/assets/applogos/facebook.svg" width="32" alt="Facebook">&nbsp;
  <img src="apps/site/public/assets/applogos/instagram.svg" width="32" alt="Instagram">&nbsp;
  <img src="apps/site/public/assets/applogos/threads.svg" width="32" alt="Threads">&nbsp;
  <img src="apps/site/public/assets/applogos/x.svg" width="32" alt="X">&nbsp;
  <img src="apps/site/public/assets/applogos/youtube.svg" width="32" alt="YouTube">
</p>

---

## ✨ Why SocialFly

Most social tools stop at the calendar. SocialFly covers the whole loop a marketing
team runs every week:

1. **Research** your brand and market — topics, buyer questions, competitors, content gaps.
2. **Get found** — SEO, AEO and AI visibility: is your brand mentioned by ChatGPT, Perplexity and friends?
3. **Create** — articles, social posts, image posts, LinkedIn carousels and short vertical videos.
4. **Publish** — schedule once, publish to every connected channel, with a reliable engine behind it.
5. **Engage** — find the conversations that matter and draft replies for approval.
6. **Measure** — impressions, engagement, mentions and AI citations.
7. **Advertise** — turn winning posts into ad campaigns.

All seven are built. Platform integrations are covered by tests against simulated APIs; see [docs/platforms.md](docs/platforms.md) and [docs/ads.md](docs/ads.md) for what still needs verifying on live accounts and which platform approvals are required.

## 🚀 Features available now

- **Teams and workspaces** — organizations, roles, invitations, email + Google sign-in, session rotation.
- **Channel connections** — OAuth for LinkedIn (profile and pages), Facebook Pages, Instagram,
  Threads, X, Reddit and YouTube, with automatic token refresh and re-connect prompts.
- **Composer and scheduling** — one post, many channels, per-channel overrides, media uploads to S3-compatible storage.
- **Publishing engine** — BullMQ queues, idempotent state machine, per-platform rate limits,
  safe retries. A platform call whose outcome is unknown is never blindly retried, so you won't get double posts.
- **AI content** — write posts for every selected channel from one brief (each adapted to the
  platform's length and style), rewrite in one click, suggest hashtags, generate images and
  render LinkedIn/Instagram carousels and short vertical videos with voiceover. A brand-voice profile keeps everything on brand, and a
  monthly budget per workspace keeps AI spend predictable.
- **Research & AI visibility** — crawl your website into a brand brief (topics, buyer questions,
  competitors, content gaps and ready-to-create ideas), track whether ChatGPT, Claude, Gemini and
  Perplexity mention you versus competitors, and (with DataForSEO) keyword volumes and Google ranks.
- **Engagement inbox** — comments, replies and mentions from every connected platform plus keyword
  listening on Reddit and X, AI triage of what deserves an answer, on-brand AI reply drafts, and
  optional admin approval before anything is posted.
- **Ads** — AI-written ad copy and targeting, campaign drafts with approval for Meta, Google,
  LinkedIn, TikTok, Pinterest and X. Campaigns are always created paused; an admin activates them by
  typing the exact budget, under a hard daily budget ceiling. Spend and results sync back daily.
- **Analytics** — impressions, reach and engagement per post and per channel (X, Facebook,
  Instagram, Threads, YouTube, Reddit, LinkedIn pages), follower growth, top posts, and a
  best-time-to-post heatmap from your own results.
- **Operations built in** — OpenTelemetry traces, logs and metrics, Bull Board for jobs,
  health checks, a developer CLI and production Dockerfiles.

> **Heads up:** SocialFly is under active development. Platform adapters are covered by tests
> but have not all been exercised against live accounts yet — see
> [docs/platforms.md](docs/platforms.md#verified-vs-to-verify).

## 🧱 Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript everywhere (strict) |
| Runtime | [Bun](https://bun.sh) for services, Node for the Next.js web app |
| Backend | [Hono](https://hono.dev) with OpenAPI docs |
| Frontend | [Next.js 16](https://nextjs.org) |
| Database | PostgreSQL 17 + [Drizzle ORM](https://orm.drizzle.team) + pgvector |
| Queues | [BullMQ](https://bullmq.io) on Redis |
| AI | Anthropic Claude (text), OpenAI / Gemini (images), Satori + resvg (carousels) |
| Storage | Any S3-compatible store (RustFS locally, Cloudflare R2 / S3 in production) |
| Observability | OpenTelemetry → Grafana (Tempo, Loki, Prometheus) |
| Tooling | Turborepo, Biome, lefthook, commitlint, gitleaks |

## ⚡ Quick start

Prerequisites: [Bun 1.3.13](https://bun.sh) and Docker.

```bash
git clone <repository-url> socialflyai
cd socialflyai
bun install                 # also installs git hooks (lefthook)
bun run cli env             # .env with freshly generated local secrets
bun dev                     # infra in Docker → migrations → every service and app with hot reload
bun run cli db seed         # demo@socialfly.local / Demo-Password-123!
```

| Service | URL | |
|---|---|---|
| App (dashboard) | http://localhost:4700 | Next.js — sign in here |
| Marketing site | http://localhost:4701 | Next.js, static |
| Admin console | http://localhost:4702 | staff only — `bun run cli admin grant <email>` |
| API | http://localhost:4400/docs | OpenAPI reference (Scalar) |
| Auth | http://localhost:4800/docs | OpenAPI reference |
| Worker | http://localhost:4500/queues | Bull Board: inspect and replay jobs |
| Mail inbox | http://localhost:8025 | Mailpit catches every email |
| Storage console | http://localhost:9001 | S3-compatible (RustFS) |
| Grafana | http://localhost:4703 | traces, logs, metrics: `bun run cli stack up observability` |

`bun run cli` lists every command: `status`, `stack up|down|logs`, `db migrate|generate|seed|reset`,
`secrets`, `service-client`.

To connect real social accounts, create a developer app per platform and add its credentials to
`.env` — see [docs/platforms.md](docs/platforms.md). For AI features add `ANTHROPIC_API_KEY`
(text), `OPENAI_API_KEY` (images + video voiceover) or `GEMINI_API_KEY` (images) to `.env`;
without them those features are simply hidden. Carousels and videos with theme backgrounds need
no key at all.

## 🗂 Repository layout

```
apps/
  api/          Hono on Bun: REST API (organizations, channels, media, posts, AI)
  auth/         Hono on Bun: identity, sessions, refresh rotation, Google, service tokens
  worker/       Bun + BullMQ: publishing engine, AI images/carousels/videos, token refresh
  app/          Next.js 16: the product (dashboard, composer, calendar, Create studio)
  site/         Next.js 16: public marketing site (static, SEO)
  admin/        Next.js 16: internal staff console (orgs, users, publishing, AI spend, queues)
packages/
  config/       zod-validated env per service; production refuses to boot without secrets
  core/         errors, logger, telemetry, HTTP middleware, auth helpers, crypto, mail
  db/           Drizzle schema + SQL migrations + seeds
  queue/        typed job contracts shared by producer (api) and consumer (worker)
  integrations/ one adapter per platform behind one contract
  ai/           AI providers (Claude text, image chain, voiceover), prompts, carousel + video renderer
  ui/           shared design system for app, site and admin
  tsconfig/     shared strict TypeScript configs
infra/          local compose stack, Dockerfiles, Jenkins controller, OpenTelemetry config
Jenkinsfile     CI/CD: lint, typecheck, tests on real infra, security scans, images, Azure deploy
scripts/        the `bun run cli` developer CLI
docs/           architecture, platform setup, deployment, runbooks
```

## 🧑‍💻 Development

```bash
bun run lint          # Biome (lint + format check)
bun run typecheck     # every workspace, via Turborepo
bun run test          # unit + integration (needs the stack up: real Postgres/Redis/S3)
bun run cli db generate add_something   # after editing packages/db/src/schema; review the SQL
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org). Pre-commit runs Biome
and gitleaks on staged files. Documentation:

- [Architecture](docs/architecture.md): services, data model, publishing engine, decisions
- [CI/CD with Jenkins](docs/ci-jenkins.md): pipeline stages, controller setup, credentials, rollback
- [Admin console](docs/admin-console.md): staff access, what it shows, audit trail
- [Ads](docs/ads.md): safety model, per-platform setup and the approvals each platform needs
- [Platform setup](docs/platforms.md): creating the LinkedIn / Meta / X / Reddit / Google apps
- [Deploying to Azure](docs/deployment-azure.md): Container Apps, secrets, CI/CD
- [Runbook: publishing](docs/runbooks/publishing.md): what to do when posts fail

## 🔒 License

Proprietary and confidential — see [LICENSE](LICENSE). Report security issues privately to
the maintainers ([SECURITY.md](SECURITY.md)).
