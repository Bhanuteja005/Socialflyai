# syntax=docker/dockerfile:1.7
#
# One image recipe for every Bun backend service (api, auth, worker):
#
#   docker build -f infra/docker/service.Dockerfile --build-arg APP=api -t socialfly/api .
#
# Fixes over the reference repo's Dockerfiles: multi-stage (no build tooling or
# dev dependencies in the final image), non-root user, a real HEALTHCHECK, and the
# dependency layer is keyed on package manifests only — a source change does not
# reinstall node_modules, and no CACHEBUST workaround is needed.

ARG BUN_VERSION=1.3.13

# ── 1. manifests: every package.json in the workspace, nothing else ─────────────
# `bun install --frozen-lockfile` validates bun.lock against the WHOLE workspace,
# so every member's manifest must be present. Extracting them in their own stage
# means the install layer below is cached until a manifest actually changes.
FROM oven/bun:${BUN_VERSION}-alpine AS manifests
WORKDIR /src
COPY . .
RUN mkdir /manifests \
	&& find . -name package.json -not -path "*/node_modules/*" -exec cp --parents {} /manifests \; \
	&& cp bun.lock /manifests/

# ── 2. deps: production dependencies for the target service only ───────────────
FROM oven/bun:${BUN_VERSION}-alpine AS deps
ARG APP
WORKDIR /app
COPY --from=manifests /manifests ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile --production --filter "@socialfly/${APP}"

# ── 3. runtime ──────────────────────────────────────────────────────────────────
FROM oven/bun:${BUN_VERSION}-alpine AS runtime
ARG APP
ARG PORT
ARG APP_VERSION=dev
ENV NODE_ENV=production \
	APP_VERSION=${APP_VERSION} \
	SERVICE_PORT=${PORT}
WORKDIR /app

COPY --from=deps --chown=bun:bun /app ./
# Workspace packages are consumed as TypeScript source (no build step): copy them
# plus the one app. drizzle/ ships inside packages/db so the image can migrate.
COPY --chown=bun:bun packages ./packages
COPY --chown=bun:bun apps/${APP} ./apps/${APP}

USER bun
WORKDIR /app/apps/${APP}
EXPOSE ${PORT}

# Liveness only (/health never touches dependencies): an unhealthy DB must not
# make the orchestrator kill every replica. Readiness (/ready) is the platform probe.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
	CMD wget -qO- "http://127.0.0.1:${SERVICE_PORT}/health" >/dev/null || exit 1

# exec form + bun as PID 1 → SIGTERM reaches the app's graceful shutdown handler.
CMD ["bun", "src/index.ts"]
