# syntax=docker/dockerfile:1.7
#
# One image recipe for every Next.js frontend (site, app, admin):
#
#   docker build -f infra/docker/web.Dockerfile --build-arg APP=site -t socialfly/site .
#   docker build -f infra/docker/web.Dockerfile --build-arg APP=app \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com ... -t socialfly/app .
#
# Next.js "standalone" output: the runtime image holds only the traced server
# files, not the workspace or node_modules. Built with Bun (fast install), served
# by Node — Next.js is built and tested on Node, and the web tier gains nothing
# from a different runtime. Every image listens on 3000 inside the container
# (override with -e PORT=...); the host ports 4700/4701/4702 are a dev convention.

ARG BUN_VERSION=1.3.13
ARG NODE_VERSION=24

# ── 1. manifests: every package.json in the workspace, nothing else ─────────────
# `bun install --frozen-lockfile` validates bun.lock against the WHOLE workspace, so
# every member's manifest must be present; the install layer below stays cached
# until a manifest actually changes.
FROM oven/bun:${BUN_VERSION}-alpine AS manifests
WORKDIR /src
COPY . .
RUN mkdir /manifests \
	&& find . -name package.json -not -path "*/node_modules/*" -exec cp --parents {} /manifests \; \
	&& cp bun.lock /manifests/

FROM oven/bun:${BUN_VERSION}-alpine AS bun

# ── 2. deps: the target frontend's dependencies only ────────────────────────────
# Install with Bun, but on the Node image: `next build` must run under Node (under
# Bun on Alpine/musl it segfaults), and Node is what serves the app anyway.
FROM node:${NODE_VERSION}-alpine AS deps
ARG APP
RUN case "${APP}" in site|app|admin) ;; \
	*) echo "build arg APP must be one of: site, app, admin (got '${APP}')" >&2; exit 1 ;; esac
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY --from=manifests /manifests ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile --filter "@socialfly/${APP}"

# ── 3. build ────────────────────────────────────────────────────────────────────
FROM deps AS build
ARG APP
WORKDIR /app
# NEXT_PUBLIC_* are inlined into the browser bundle at build time — they must be
# build args; setting them on the running container has no effect. Each frontend
# reads the ones it needs (packages/config/src/web.ts); the rest are harmless.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AUTH_URL
# No default: unset, each frontend picks its own auth client (app: socialfly-web,
# admin: socialfly-admin). A single default here would give the admin the app's client.
ARG NEXT_PUBLIC_AUTH_CLIENT_ID
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_ADMIN_URL
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
	NEXT_PUBLIC_AUTH_URL=${NEXT_PUBLIC_AUTH_URL} \
	NEXT_PUBLIC_AUTH_CLIENT_ID=${NEXT_PUBLIC_AUTH_CLIENT_ID} \
	NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
	NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
	NEXT_PUBLIC_ADMIN_URL=${NEXT_PUBLIC_ADMIN_URL} \
	NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
	NEXT_TELEMETRY_DISABLED=1
COPY packages ./packages
# The app (and admin) type-import @socialfly/api for the typed RPC client; type
# checking during `next build` needs its source even though none of it ships.
COPY apps/api ./apps/api
COPY apps/${APP} ./apps/${APP}
# `public/` is optional; create it so the runtime COPY below never fails.
RUN cd apps/${APP} && bun run build && mkdir -p public

# ── 4. runtime ──────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runtime
ARG APP
ENV NODE_ENV=production \
	NEXT_TELEMETRY_DISABLED=1 \
	PORT=3000 \
	HOSTNAME=0.0.0.0
WORKDIR /app
# Standalone output mirrors the monorepo layout (outputFileTracingRoot = repo root).
COPY --from=build --chown=node:node /app/apps/${APP}/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build --chown=node:node /app/apps/${APP}/public ./apps/${APP}/public
USER node
WORKDIR /app/apps/${APP}
EXPOSE 3000
# wget follows redirects, so this also works for the app, whose / redirects to /login.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
	CMD wget -qO- "http://127.0.0.1:${PORT}/" >/dev/null || exit 1
# exec form + node as PID 1 → SIGTERM reaches Next's graceful shutdown.
CMD ["node", "server.js"]
