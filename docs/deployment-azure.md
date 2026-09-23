# Deploying to Azure Container Apps

Pipeline: Jenkins (the root `Jenkinsfile`, see [ci-jenkins.md](ci-jenkins.md)) → ACR Tasks
build → Container Apps. Jenkins logs in to Azure with a **service principal** stored as Jenkins
credentials. It records the live images, runs migrations, deploys, smoke tests, and rolls back
automatically if the deploy or the smoke test fails.

## Resources (one-time)

| Resource | Notes |
|---|---|
| Resource group | e.g. `rg-socialfly-prod` |
| Azure Container Registry | `AZURE_ACR_NAME`; Container Apps pull via managed identity |
| Container Apps environment | with a Log Analytics workspace; VNet-integrated |
| Container App `auth` | image `socialfly/auth`, port 4800, **external** ingress (`auth.<domain>`) |
| Container App `api` | image `socialfly/api`, port 4400, **external** ingress (`api.<domain>`) |
| Container App `worker` | image `socialfly/worker`, port 4500, **internal** ingress only (Bull Board off), min replicas ≥ 1 |
| Container App `app` | image `socialfly/app` (apps/app, the dashboard), port 3000, external (`app.<domain>`) |
| Container App `site` | image `socialfly/site` (apps/site, marketing), port 3000, external (`<domain>`, `www.<domain>`) |
| Container App `admin` | image `socialfly/admin` (apps/admin, staff console), port 3000, external (`admin.<domain>`). Consider IP restrictions |
| Container Apps **Job** `migrate` | manual trigger. The deploy sets its image to the new api image and runs `bun /app/packages/db/src/migrate.ts` |
| Container App `otel-collector` | `otel/opentelemetry-collector-contrib` with `infra/otel/collector.yaml`; internal ingress; services set `OTEL_EXPORTER_OTLP_ENDPOINT` to it |
| Azure Database for PostgreSQL Flexible Server 17 | enable extensions `vector`, `pg_trgm`, `citext` (server parameter `azure.extensions`); private access |
| Azure Cache for Redis (or Managed Redis) | **`maxmemory-policy noeviction`** (BullMQ requirement); persistence on |
| Cloudflare R2 bucket | media; public bucket URL/custom domain → `S3_PUBLIC_URL` |

Set a readiness probe on each app to `GET /ready` and liveness to `GET /health`.
Give the worker a termination grace period ≥ 60 s so in-flight publishes finish.

All three web images come from one recipe, `infra/docker/web.Dockerfile --build-arg APP=site|app|admin`,
and listen on 3000 in the container.

## Secrets and configuration (the running services)

Store secrets in Key Vault and reference them from Container Apps secrets:
`DATABASE_URL`, `REDIS_URL`, `AUTH_JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `S3_*` keys,
`SMTP_URL`, `GOOGLE_CLIENT_SECRET`, every platform `*_SECRET`, `SENTRY_DSN`.
Generate the two application secrets with `bun run cli secrets`.
Plain env: `NODE_ENV=production`, `AUTH_ISSUER`, `AUTH_COOKIE_DOMAIN=.<domain>`,
`AUTH_COOKIE_SECURE=true`, `WEB_URL` (dashboard), `SITE_URL` (marketing), `ADMIN_URL`, `API_URL`,
`S3_PUBLIC_URL`, and `CORS_ORIGINS`, which must include the **app and admin** origins
(e.g. `https://app.<domain>,https://admin.<domain>`) on both api and auth.

The services refuse to start if a required secret is missing (see
`packages/config/src/shared.ts`). A misconfigured revision fails the smoke test and
is rolled back instead of running on dev defaults.

The frontends' `NEXT_PUBLIC_*` values are **build args**, baked in when Jenkins builds the image:
`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_SENTRY_DSN`, and `NEXT_PUBLIC_AUTH_CLIENT_ID`
(`socialfly-web`, or `socialfly-admin` for the admin image). Jenkins derives them from its own
`API_URL`, `AUTH_URL`, `WEB_URL`, `SITE_URL`, `ADMIN_URL` and `NEXT_PUBLIC_SENTRY_DSN` settings.
Setting them on the running container does nothing.

## Service principal for Jenkins

Jenkins has no GitHub OIDC token to federate, so it uses a service principal with a client secret.
Keep its rights narrow:

```bash
az ad sp create-for-rbac --name sp-socialfly-jenkins --skip-assignment
# → appId (client id), password (client secret), tenant
RG_ID=$(az group show -n rg-socialfly-prod --query id -o tsv)
ACR_ID=$(az acr show -n <acr> --query id -o tsv)
az role assignment create --assignee <appId> --role Contributor --scope "$RG_ID"   # container apps + migrate job
az role assignment create --assignee <appId> --role AcrPush --scope "$ACR_ID"      # ACR Tasks builds
```

(`az acr build` needs permission to queue runs on the registry. Contributor on the resource group
covers it when the registry is in that group.) Rotate the secret on a schedule. It is the only
long-lived Azure credential, and it lives only in Jenkins' credential store.

## Jenkins configuration

**Credentials** (Manage Jenkins → Credentials → System → Global):

| ID | Kind | Value |
|---|---|---|
| `azure-sp` | Username with password | username = SP `appId`, password = SP client secret |
| `azure-tenant-id` | Secret text | tenant id |
| `azure-subscription-id` | Secret text | subscription id |

**Global variables** (`infra/jenkins/.env` → `casc.yaml`, or Manage Jenkins → System → Global
properties): `AZURE_ACR_NAME`, `AZURE_RESOURCE_GROUP`, `ACA_AUTH_APP`, `ACA_API_APP`,
`ACA_WORKER_APP`, `ACA_WEB_APP` (the `app` container app), `ACA_SITE_APP`, `ACA_ADMIN_APP`,
`ACA_MIGRATE_JOB`, `AUTH_URL`, `API_URL`, `WEB_URL`, `SITE_URL`, `ADMIN_URL`,
`NEXT_PUBLIC_SENTRY_DSN`, and optionally `DEPLOY_APPROVERS`.

Leave `AZURE_ACR_NAME` empty and main still gets full CI, but nothing is built or deployed.
Set `DEPLOY_APPROVERS` (comma-separated Jenkins user ids) if every production deploy should wait
for a human. This is the equivalent of GitHub's "required reviewers" on an environment.

## What a deploy does

Only on `main`, inside `lock('production-deploy')`. Main builds are queued, never aborted.

1. **Publish images.** `az acr build` for auth, api, worker, app, site (and admin once `apps/admin`
   exists), tagged with the commit SHA and `latest`.
2. **Record** the image each container app is running right now. That is the rollback target.
3. **Migrate.** Point the `migrate` job at the new api image, run it, and wait. If it fails, nothing
   has been deployed.
4. **Deploy** in order: auth, api, worker, app, site, admin. Backends go first, so a new frontend
   never calls an API that does not exist yet.
5. **Smoke test.** `AUTH_URL/ready`, `API_URL/ready`, then `WEB_URL`, `SITE_URL` and `ADMIN_URL`
   must return 200 within 5 minutes each.
6. **Roll back** automatically if step 4 or 5 fails: every app goes back to its recorded image, then
   Jenkins waits for `API_URL/ready`.

The steps live in `infra/jenkins/scripts/release.sh`.

## Rolling back (or forward) by hand

Every deploy archives `deploy-summary.txt`, which lists the images that were live before it. Open
the `main` branch job in Jenkins → **Build with Parameters** → set `IMAGE_TAG` to that tag (a
commit SHA that was built before). The run skips CI and image builds and goes straight to record →
migrate → deploy → smoke, with the same automatic rollback. The database is **not** rolled back;
that is why migrations must be backward compatible.
