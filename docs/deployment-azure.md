# Deploying to Azure Container Apps

Mirrors the reference monorepo's pipeline: GitHub Actions → ACR Tasks build →
Container Apps, OIDC login (no stored Azure secret), record live images → migrate
→ deploy → smoke test → automatic rollback.

## Resources (one-time)

| Resource | Notes |
|---|---|
| Resource group | e.g. `rg-socialfly-prod` |
| Azure Container Registry | `AZURE_ACR_NAME`; Container Apps pull via managed identity |
| Container Apps environment | with a Log Analytics workspace; VNet-integrated |
| Container App `auth` | image `socialfly/auth`, port 4800, **external** ingress (`auth.<domain>`) |
| Container App `api` | image `socialfly/api`, port 4400, **external** ingress (`api.<domain>`) |
| Container App `worker` | image `socialfly/worker`, port 4500, **internal** ingress only (Bull Board off) , min replicas ≥ 1 |
| Container App `web` | image `socialfly/web`, port 3000, external (`app.<domain>` + marketing domain) |
| Container Apps **Job** `migrate` | manual trigger; the deploy workflow sets its image to the new api image and runs `bun /app/packages/db/src/migrate.ts` |
| Container App `otel-collector` | `otel/opentelemetry-collector-contrib` with `infra/otel/collector.yaml`; internal ingress; services set `OTEL_EXPORTER_OTLP_ENDPOINT` to it |
| Azure Database for PostgreSQL Flexible Server 17 | enable extensions `vector`, `pg_trgm`, `citext` (server parameter `azure.extensions`); private access |
| Azure Cache for Redis (or Managed Redis) | **`maxmemory-policy noeviction`** (BullMQ requirement); persistence on |
| Cloudflare R2 bucket | media; public bucket URL/custom domain → `S3_PUBLIC_URL` |

Set a readiness probe on each app to `GET /ready` and liveness to `GET /health`.
Give the worker a termination grace period ≥ 60 s so in-flight publishes finish.

## Secrets and configuration

Store secrets in Key Vault and reference them from Container Apps secrets:
`DATABASE_URL`, `REDIS_URL`, `AUTH_JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `S3_*` keys,
`SMTP_URL`, `GOOGLE_CLIENT_SECRET`, every platform `*_SECRET`, `SENTRY_DSN`.
Generate the two application secrets with `bun run cli secrets`.
Plain env: `NODE_ENV=production`, `AUTH_ISSUER`, `AUTH_COOKIE_DOMAIN=.<domain>`,
`AUTH_COOKIE_SECURE=true`, `WEB_URL`, `API_URL`, `CORS_ORIGINS`, `S3_PUBLIC_URL`.

The services refuse to start if a required secret is missing (see
`packages/config/src/shared.ts`) — a misconfigured revision fails the smoke test and
is rolled back instead of running on dev defaults.

## GitHub configuration

**Secrets**: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (federated
credential for `repo:<org>/<repo>:environment:production`).

**Variables**: `AZURE_ACR_NAME`, `AZURE_RESOURCE_GROUP`, `ACA_AUTH_APP`, `ACA_API_APP`,
`ACA_WORKER_APP`, `ACA_WEB_APP`, `ACA_MIGRATE_JOB`, `AUTH_URL`, `API_URL`, `WEB_URL`,
`NEXT_PUBLIC_SENTRY_DSN`.

Create a `production` environment with required reviewers if deploys should be approved.

## Rolling back

Every deploy summary lists the images that were live before it. Re-run the
"Deploy to production" workflow manually with that tag as `image_tag` — it skips
build and verification and goes straight to deploy + smoke. Remember that the
database is **not** rolled back; that is why migrations must be backward compatible.
