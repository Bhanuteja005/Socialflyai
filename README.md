<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg">
    <img alt="SocialFly" src=".github/assets/logo-light.svg" width="320">
  </picture>
</p>

<p align="center">
  <b>Open-source AI marketing automation for social media.</b><br>
  Research your brand, create content, schedule and publish it everywhere, engage with
  conversations, and measure what works — in one self-hostable product.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-0BE27D"></a>
  <a href="https://github.com/Bhanuteja005/Socialflyai/actions/workflows/deploy.yml"><img alt="CI" src="https://github.com/Bhanuteja005/Socialflyai/actions/workflows/deploy.yml/badge.svg?branch=main"></a>
  <a href="https://github.com/Bhanuteja005/Socialflyai/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/Bhanuteja005/Socialflyai?style=flat&color=0BE27D"></a>
  <a href="https://github.com/Bhanuteja005/Socialflyai/issues"><img alt="Issues" src="https://img.shields.io/github/issues/Bhanuteja005/Socialflyai"></a>
  <a href="CONTRIBUTING.md"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-0BE27D"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="Bun" src="https://img.shields.io/badge/Bun-1.3-000?logo=bun">
</p>

<p align="center">
  <a href="#-quick-start">Quick start</a> ·
  <a href="docs/architecture.md">Architecture</a> ·
  <a href="docs/platforms.md">Platform setup</a> ·
  <a href="#-roadmap">Roadmap</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="#-support-the-project">Sponsor</a>
</p>

<p align="center">
  <img src="apps/web/public/assets/applogos/linkedin.svg" width="32" alt="LinkedIn">&nbsp;
  <img src="apps/web/public/assets/applogos/facebook.svg" width="32" alt="Facebook">&nbsp;
  <img src="apps/web/public/assets/applogos/instagram.svg" width="32" alt="Instagram">&nbsp;
  <img src="apps/web/public/assets/applogos/threads.svg" width="32" alt="Threads">&nbsp;
  <img src="apps/web/public/assets/applogos/x.svg" width="32" alt="X">&nbsp;
  <img src="apps/web/public/assets/applogos/youtube.svg" width="32" alt="YouTube">
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

Steps 4 and the foundations under it are built today; the rest is the [roadmap](#-roadmap).

## 🚀 Features available now

- **Teams and workspaces** — organizations, roles, invitations, email + Google sign-in, session rotation.
- **Channel connections** — OAuth for LinkedIn (profile and pages), Facebook Pages, Instagram,
  Threads, X, Reddit and YouTube, with automatic token refresh and re-connect prompts.
- **Composer and scheduling** — one post, many channels, per-channel overrides, media uploads to S3-compatible storage.
- **Publishing engine** — BullMQ queues, idempotent state machine, per-platform rate limits,
  safe retries. A platform call whose outcome is unknown is never blindly retried, so you won't get double posts.
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
| Storage | Any S3-compatible store (RustFS locally, Cloudflare R2 / S3 in production) |
| Observability | OpenTelemetry → Grafana (Tempo, Loki, Prometheus) |
| Tooling | Turborepo, Biome, lefthook, commitlint, gitleaks |

## ⚡ Quick start

Prerequisites: [Bun 1.3.13](https://bun.sh) and Docker.

```bash
git clone https://github.com/Bhanuteja005/Socialflyai.git
cd Socialflyai
bun install                 # also installs git hooks (lefthook)
bun run cli env             # .env with freshly generated local secrets
bun dev                     # infra in Docker → migrations → auth, api, worker, web with hot reload
bun run cli db seed         # demo@socialfly.local / Demo-Password-123!
```

| Service | URL | |
|---|---|---|
| Web app | http://localhost:3000 | Next.js |
| API | http://localhost:4400/docs | OpenAPI reference (Scalar) |
| Auth | http://localhost:4800/docs | OpenAPI reference |
| Worker | http://localhost:4500/queues | Bull Board: inspect and replay jobs |
| Mail inbox | http://localhost:8025 | Mailpit catches every email |
| Storage console | http://localhost:9001 | S3-compatible (RustFS) |
| Grafana | http://localhost:3001 | traces, logs, metrics: `bun run cli stack up observability` |

`bun run cli` lists every command: `status`, `stack up|down|logs`, `db migrate|generate|seed|reset`,
`secrets`, `service-client`.

To connect real social accounts, create a developer app per platform and add its credentials to
`.env` — see [docs/platforms.md](docs/platforms.md).

## 🗂 Repository layout

```
apps/
  api/          Hono on Bun: REST API (organizations, channels, media, posts)
  auth/         Hono on Bun: identity, sessions, refresh rotation, Google, service tokens
  worker/       Bun + BullMQ: publishing engine, token refresh, self-healing maintenance
  web/          Next.js 16: marketing site + the app
packages/
  config/       zod-validated env per service; production refuses to boot without secrets
  core/         errors, logger, telemetry, HTTP middleware, auth helpers, crypto, mail
  db/           Drizzle schema + SQL migrations + seeds
  queue/        typed job contracts shared by producer (api) and consumer (worker)
  integrations/ one adapter per platform behind one contract
  tsconfig/     shared strict TypeScript configs
infra/          local compose stack, production Dockerfiles, OpenTelemetry config
scripts/        the `bun run cli` developer CLI
docs/           architecture, platform setup, deployment, runbooks
```

## 🗺 Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Monorepo, tooling, infra, CI/CD, observability | ✅ Done |
| 1 | Auth, organizations, roles, invitations, channel connections | ✅ Done |
| 2 | Media, composer, scheduling, publishing engine (8 platforms) | ✅ Done |
| 3 | AI content: posts, images, carousels, reels | 🚧 Next |
| 4 | Analytics: per-post and per-account metrics, dashboards | Planned |
| 5 | Research, SEO/AEO and AI-visibility tracking | Planned |
| 6 | Engagement inbox: listening, reply drafts, approval | Planned |
| 7 | Ads: campaign drafts, Meta / Google / LinkedIn / TikTok / X / Pinterest sync | Planned |

Details in [docs/architecture.md](docs/architecture.md#roadmap). Have an idea?
[Open a feature request](https://github.com/Bhanuteja005/Socialflyai/issues/new/choose).

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
- [Platform setup](docs/platforms.md): creating the LinkedIn / Meta / X / Reddit / Google apps
- [Deploying to Azure](docs/deployment-azure.md): Container Apps, secrets, CI/CD
- [Runbook: publishing](docs/runbooks/publishing.md): what to do when posts fail

## 🤝 Contributing

Contributions of all sizes are welcome: bug reports, docs, platform adapters and features.
Read [CONTRIBUTING.md](CONTRIBUTING.md) to get set up, and check
[good first issues](https://github.com/Bhanuteja005/Socialflyai/labels/good%20first%20issue).
Everyone taking part agrees to the [Code of Conduct](CODE_OF_CONDUCT.md).

Found a security issue? Please don't open a public issue — see [SECURITY.md](SECURITY.md).

## 💚 Support the project

SocialFly is free and open source. If it saves you time, you can help keep it going:

- ⭐ **Star this repo**: it helps others find it.
- 💖 **[Sponsor on GitHub](https://github.com/sponsors/Bhanuteja005)**
- ☕ **Buy Me a Coffee** / **Open Collective**: links are in the Sponsor button at the top of the repo.

### Sponsors

Your logo here: [become a sponsor](https://github.com/sponsors/Bhanuteja005) and appear in this section.

## 🌟 Contributors

<a href="https://github.com/Bhanuteja005/Socialflyai/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Bhanuteja005/Socialflyai" alt="Contributors">
</a>

## 📈 Star history

<a href="https://star-history.com/#Bhanuteja005/Socialflyai&Date">
  <img src="https://api.star-history.com/svg?repos=Bhanuteja005/Socialflyai&type=Date" alt="Star history chart" width="600">
</a>

## 📄 License

[MIT](LICENSE) © SocialFly contributors
