# CI/CD with Jenkins

SocialFly's CI and deploys run on Jenkins. The pipeline is the root `Jenkinsfile`, a Declarative
Pipeline run by a **Multibranch Pipeline** job. That job uses the GitHub Branch Source plugin, so
every branch and pull request gets a build, and the result appears on GitHub as a commit status /
PR check. The controller itself is defined in `infra/jenkins/` (Docker image, plugins,
Configuration as Code) and can be rebuilt from scratch at any time.

- [Pipeline, stage by stage](#pipeline-stage-by-stage)
- [Running the controller](#running-the-controller)
- [Connecting GitHub](#connecting-github)
- [Credentials and variables](#credentials-and-variables)
- [Rolling back or forward](#rolling-back-or-forward)
- [Pull requests from forks](#pull-requests-from-forks)
- [Troubleshooting](#troubleshooting)

## Pipeline, stage by stage

The `Plan` stage picks one of three modes for each build:

| Mode | When | What runs |
|---|---|---|
| `ci` | every push and PR | everything below. On `main` it also publishes images and deploys |
| `release` | `main`, started by hand with `IMAGE_TAG` set | Checkout → Deploy only. Rolls production to an existing image |
| `security` | the weekly timer on `main` (`H 5 * * 1`, Monday ~05:00) | Checkout → Install → Security only |

| Stage | Runs in | Notes |
|---|---|---|
| **Plan** | no executor | Picks the mode. Checks that `IMAGE_TAG` is a valid tag and is only used on `main`. Skips publish/deploy when `AZURE_ACR_NAME` is empty |
| **Approve fork PR** | no executor | Fork PRs only. Waits (up to 7 days) for someone in `FORK_PR_APPROVERS`. [Why](#pull-requests-from-forks) |
| **Checkout** | agent `docker` | `checkout scm`. Fails if the clone is shallow, because gitleaks needs the full history |
| **Install** | `socialfly-ci-bun` container | `bun install --frozen-lockfile`. The image is `oven/bun:1.3.13` plus git (`infra/jenkins/bun.Dockerfile`), built on the agent. Installs share the `socialfly-bun-cache` volume |
| **Quality** (parallel) | bun container | **Lint** `bunx biome ci .` · **Typecheck** `bunx turbo typecheck` · **Migrations committed** runs `drizzle-kit generate` and fails if it would write a new migration |
| **Test** | bun container + private stack | See below. The stack is always torn down in `post` |
| **Security** (parallel) | gitleaks / bun containers | **Secret scan** `gitleaks git` over the full history with `.gitleaks.toml` · **Dependency audit** `bun audit --audit-level=high` |
| **Image build check** | agent's Docker | Branches and PRs. Builds every image (api, auth, worker, app, site, admin) without pushing |
| **Publish images** | azure-cli container | `main`, when Azure is configured. `az acr build` per image, tagged `<commit sha>` and `latest` |
| **Deploy** | azure-cli container | `main`, when Azure is configured, inside `lock('production-deploy')`. Check config → record live images → migrate → deploy → smoke → roll back on failure. See [deployment-azure.md](deployment-azure.md) |

### The test stack

`infra/compose/ci.yaml` starts Postgres (pgvector 0.8.1, pg17), Redis and RustFS (S3) under a
compose project named after `BUILD_TAG`, so each build gets its own containers. No port is
published on the host, so any number of builds can run side by side.

- Every service shares Postgres' network namespace and listens on the same ports as the local dev
  stack: Postgres on 5434, Redis on 6380, S3 on 9000.
- The test container joins that namespace (`--network container:<postgres>`). The test setups'
  `localhost` defaults (`apps/*/src/tests/setup.ts`) therefore work unchanged:
  - The api suite uses Redis db 1 and the worker suite uses db 2, as they do locally.
  - No CI-only environment is needed. Turbo's strict env mode would strip it anyway.
- The test database `socialfly_test` is created from `POSTGRES_DB`. The `vector`, `pg_trgm` and
  `citext` extensions come from an init script passed through an environment variable.
- There are no bind mounts, because the compose CLI talks to the host daemon from inside Jenkins.
- `storage-init` creates the `socialfly-media` bucket.
- Data lives on tmpfs, and `docker compose down -v` in `post { always }` removes everything, even
  when the build fails or is aborted.

To reproduce the Test stage locally:

```bash
P=sfci-local
docker compose -p $P -f infra/compose/ci.yaml up -d --wait postgres redis storage
docker compose -p $P -f infra/compose/ci.yaml run --rm storage-init
docker build -t socialfly-ci-bun:1.3.13 -f infra/jenkins/bun.Dockerfile infra/jenkins
docker run --rm --network container:$(docker compose -p $P -f infra/compose/ci.yaml ps -q postgres) \
  -v "$PWD":/src -w /src socialfly-ci-bun:1.3.13 sh -c 'bun install --frozen-lockfile && bunx turbo test'
docker compose -p $P -f infra/compose/ci.yaml --profile init down -v
```

(On Windows or macOS, run this against a copy of the repo. A Linux `bun install` into your working
tree replaces the native binaries in `node_modules`.)

### Concurrency

- **Branches and PRs:** `disableConcurrentBuilds(abortPrevious: true)`. A new push aborts the
  running build of the same branch or PR.
- **main:** `disableConcurrentBuilds(abortPrevious: false)`. Builds queue and are **never** aborted
  by a newer push. Stopping between "update api" and "update app" would leave production running
  two builds. The Deploy stage also holds the Lockable Resources lock `production-deploy`, which
  serialises deploys across every job on the controller.
- **Timeouts:**
  - The work stage has a 2-hour timeout.
  - Every deploy step has shorter limits: migrations 10 min, each smoke URL 5 min.
  - A fork approval waits up to 7 days.
  - A deploy approval waits up to 60 minutes, inside the 2-hour stage timeout.

## Running the controller

Requirements: a Linux VM (or a dev machine) with Docker Engine 24+ and the compose plugin.

```bash
cp infra/jenkins/.env.example infra/jenkins/.env      # set JENKINS_ADMIN_PASSWORD, GITHUB_TOKEN, …
docker compose -f infra/jenkins/compose.yaml up -d --build
# → http://localhost:4780  (log in as JENKINS_ADMIN_ID / JENKINS_ADMIN_PASSWORD)
```

- `Dockerfile`: `jenkins/jenkins:2.568.3-lts-jdk21`, plus the static Docker CLI, buildx and
  compose from `docker:29-cli`, plus the plugins in `plugins.txt` (pinned versions).
- `casc.yaml` (Configuration as Code) holds all of the controller's configuration:
  - the admin user
  - security (logged-in users only, no sign-up, CSRF crumbs)
  - 4 executors labelled `docker`
  - the global variables below
  - the `github` credential
  - the `production-deploy` lock
  - the `socialfly` multibranch job (Job DSL), pointing at `https://github.com/Bhanuteja005/Socialflyai`

  Changes made in the UI are overwritten on restart, so edit the file instead.
- `compose.yaml` publishes only the web UI, on `127.0.0.1:4780` (8080 is used by another project
  on the dev machine). The inbound-agent port 50000 is not published; agents can connect over
  WebSocket or SSH. `JENKINS_HOME` is the named volume `jenkins_home`.

Stop it with `docker compose -f infra/jenkins/compose.yaml down`. Add `-v` to also delete
`JENKINS_HOME` (build history). Job config and credentials defined in `casc.yaml` are recreated on
the next start. Credentials added in the UI are lost.

### The Docker socket: security trade-off

The controller mounts `/var/run/docker.sock` so that pipelines can start containers: Bun, the test
stack, gitleaks, azure-cli and image builds. **Access to that socket is root on the host.** Any code
a build executes can take over the machine, including tests, dependency install scripts and
Dockerfile `RUN` lines. So:

- Run the controller on a **dedicated VM** that holds nothing else of value, not on a shared
  server.
- Builds run on the controller (label `docker`) to keep the setup to one box. For anything larger,
  set `JENKINS_EXECUTORS=0` and attach a separate agent VM labelled `docker`. The controller, with
  its credentials and config, then no longer needs the socket or any other access to build code.
- On Linux, the jenkins user reaches the socket through the group in `DOCKER_GID`
  (`stat -c %g /var/run/docker.sock`). Docker Desktop's socket is root-owned, so the default group
  0 works there.
- Put TLS in front of the controller (reverse proxy) before exposing it beyond localhost, and set
  `JENKINS_URL` to the public https URL.

## Connecting GitHub

1. **Credential.** Create a fine-grained personal access token for `Bhanuteja005/Socialflyai` with:
   Contents: read, Metadata: read, Pull requests: read, Commit statuses: read and write. Put it in
   `infra/jenkins/.env` as `GITHUB_TOKEN`. It becomes the `github` credential the job uses to scan
   the repo and report statuses. A token also raises GitHub's API rate limit from 60 to 5,000
   requests an hour.

   *Better for a team:* a **GitHub App**. It is not tied to a person and gets higher rate limits.
   Create an App with the same permissions (plus Checks: read and write if you install the GitHub
   Checks plugin), install it on the repo, then replace the `usernamePassword` entry in `casc.yaml`
   with:

   ```yaml
   - gitHubApp:
       id: "github"
       appID: "${GITHUB_APP_ID}"
       privateKey: "${GITHUB_APP_PRIVATE_KEY}"   # PKCS#8 PEM
   ```

2. **Webhook.** In the repo, go to Settings → Webhooks → Add webhook:
   - Payload URL: `<JENKINS_URL>/github-webhook/`
   - Content type: `application/json`
   - Events: *Pushes* and *Pull requests*

   Jenkins must be reachable from GitHub for this, through a reverse proxy, a tunnel, or a public
   VM. Without a webhook, the job still rescans once a day, and you can click **Scan Repository
   Now**.

3. **Status checks.** Each build reports as `continuous-integration/jenkins/branch` or
   `…/pr-merge`. To require them on `main`, go to Settings → Branches → rule for `main` →
   *Require status checks to pass* → pick `continuous-integration/jenkins/pr-merge`.

The job discovers:
- **branches**, except those also filed as PRs (the PR build covers them)
- **PRs**, built merged with `main`
- **fork PRs** (next section)

## Credentials and variables

**Credentials** (secrets, referenced by ID only, never echoed):

| ID | Kind | Used by | How to create |
|---|---|---|---|
| `github` | Username + password (token) or GitHub App | branch source, commit statuses | `casc.yaml` from `GITHUB_USERNAME` / `GITHUB_TOKEN` |
| `azure-sp` | Username + password | Publish images, Deploy | UI: username = service principal appId, password = client secret |
| `azure-tenant-id` | Secret text | Publish images, Deploy | UI |
| `azure-subscription-id` | Secret text | Publish images, Deploy | UI |

The Azure credentials are added in the UI (Manage Jenkins → Credentials → System → Global
credentials) on purpose, so the Azure secret never sits in an env file on disk. How to create the
service principal and scope its roles is in [deployment-azure.md](deployment-azure.md#service-principal-for-jenkins).
Nothing Sentry-related is secret today: `NEXT_PUBLIC_SENTRY_DSN` is public by design. Source-map
upload is not wired up. If it is added, store its token as a Secret text credential such as
`sentry-auth-token` and pass it with `az acr build --secret-build-arg`.

**Global variables** (non-secret; `infra/jenkins/.env` → `casc.yaml` → Global properties):

| Variable | Meaning |
|---|---|
| `AZURE_ACR_NAME` | Registry name without `.azurecr.io`. **Empty = CI only**: main is verified, nothing is built or deployed |
| `AZURE_RESOURCE_GROUP` | Resource group of the container apps and migrate job |
| `ACA_AUTH_APP`, `ACA_API_APP`, `ACA_WORKER_APP` | Container App names for the backends |
| `ACA_WEB_APP` | Container App serving `apps/app` (the dashboard, image `socialfly/app`) |
| `ACA_SITE_APP` | Container App serving `apps/site` (marketing, image `socialfly/site`) |
| `ACA_ADMIN_APP` | Container App serving `apps/admin`. Required once `apps/admin` exists |
| `ACA_MIGRATE_JOB` | Container Apps job that runs migrations |
| `AUTH_URL`, `API_URL` | Public URLs. Smoke tested at `/ready`, and baked into the frontends |
| `WEB_URL`, `SITE_URL`, `ADMIN_URL` | Public URLs of app, site and admin. Smoke tested, and baked in as `NEXT_PUBLIC_APP_URL` / `_SITE_URL` / `_ADMIN_URL` |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser Sentry DSN baked into the frontends (optional) |
| `DEPLOY_APPROVERS` | Comma-separated Jenkins user ids who must approve each deploy. Empty = no approval |
| `FORK_PR_APPROVERS` | Who may approve CI for fork PRs (default `admin`) |
| `JENKINS_ADMIN_ID`, `JENKINS_ADMIN_PASSWORD`, `JENKINS_URL`, `JENKINS_EXECUTORS`, `DOCKER_GID` | Controller settings (compose/casc only) |

Before touching Azure, the Deploy stage (`release.sh check`) fails with the exact list of anything
that is missing.

## Rolling back or forward

Every deploy archives `deploy-summary.txt`. It lists the tag deployed and the images that were live
before it. To roll back:

1. Open **SocialFly → main → Build with Parameters**.
2. Set `IMAGE_TAG` to the previous tag, e.g. the commit SHA from the summary.
3. Build.

The run skips CI and image builds and goes straight to record → migrate → deploy → smoke, still
under the deploy lock and still with automatic rollback. Rolling *forward* to any earlier-built SHA
works the same way. `IMAGE_TAG` is rejected on other branches, when Azure is not configured, and
when it is not a valid Docker tag.

The database is never rolled back. Migrations must be backward compatible (expand → deploy →
contract), because a rollback runs old code on the new schema.

## Pull requests from forks

A PR build runs the PR's code on the agent, and the agent has the Docker socket, which is root on
the host. That includes tests, `bun install` lifecycle scripts, and Dockerfile `RUN` lines. So a
malicious fork PR that builds automatically can take over the CI machine and read everything on it.
How the setup handles this:

- **Trust.** Fork discovery uses *Trust: users with Admin or Write permission*. For anyone else,
  Jenkins does **not** use the fork's `Jenkinsfile`; it runs the target branch's. A fork cannot edit
  the pipeline to skip the gate below.
- **Approval gate (recommended, on by default).** The `Approve fork PR` stage runs before anything
  touches the code, and without holding an executor. It waits for someone listed in
  `FORK_PR_APPROVERS` to read the diff and click *Run it*. Review everything that executes, not
  just `src/`: `package.json` scripts, `bun.lock` changes, Dockerfiles, `infra/`, test files.
  Unapproved requests time out after 7 days.
- **Secrets.** Only `main` binds the Azure credentials, so a PR build never gets them from the
  pipeline. But builds run on the controller next to the Docker socket. Code that abuses the socket
  can read `JENKINS_HOME`, and with it every stored credential, the Azure service principal
  included. That is why the approval gate matters, and why the `github` token should have minimal
  permissions. A separate agent VM removes this path: the controller then holds no socket, and the
  build machine holds no credentials.
- **Collaborators' PRs** (branches in this repo) build automatically. Their authors can already push
  code.

If fork PRs become frequent, move builds to disposable agents (ephemeral VMs or containers without
the host socket). The approval gate then becomes a convenience instead of the security boundary.

## Troubleshooting

- **`lefthook install` fails during Install.** The git plugin sets `core.hooksPath=/dev/null` on
  checkout, and the pipeline unsets it before installing. If you add a checkout step, keep that
  order.
- **`permission denied … docker.sock`.** Set `DOCKER_GID` in `infra/jenkins/.env` to the socket's
  group id and recreate the container.
- **Test stack left behind** after a controller crash: run `docker compose ls` to find `sfci-*`
  projects, then `docker compose -p <name> -f infra/compose/ci.yaml --profile init down -v`.
- **Validate a Jenkinsfile change** without pushing:
  `curl -u admin:<password> -F "jenkinsfile=<Jenkinsfile" http://localhost:4780/pipeline-model-converter/validate`.
