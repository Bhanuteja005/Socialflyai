# syntax=docker/dockerfile:1.7
#
#   docker build -f infra/docker/web.Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com ... -t socialfly/web .
#
# Next.js "standalone" output: the runtime image holds only the traced server
# files, not the workspace or node_modules. Built with Bun (fast install), served
# by Node — Next.js is built and tested on Node, and the web tier gains nothing
# from a different runtime.

ARG BUN_VERSION=1.3.13
ARG NODE_VERSION=24

FROM oven/bun:${BUN_VERSION}-alpine AS manifests
WORKDIR /src
COPY . .
RUN mkdir /manifests \
	&& find . -name package.json -not -path "*/node_modules/*" -exec cp --parents {} /manifests \; \
	&& cp bun.lock /manifests/

FROM oven/bun:${BUN_VERSION}-alpine AS bun

# Install with Bun, but on the Node image: `next build` must run under Node (under
# Bun on Alpine/musl it segfaults), and Node is what serves the app anyway.
FROM node:${NODE_VERSION}-alpine AS deps
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY --from=manifests /manifests ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile --filter "@socialfly/web"

FROM deps AS build
WORKDIR /app
# NEXT_PUBLIC_* are inlined into the browser bundle at build time — they must be
# build args; setting them on the running container has no effect.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_AUTH_CLIENT_ID=socialfly-web
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
	NEXT_PUBLIC_AUTH_URL=${NEXT_PUBLIC_AUTH_URL} \
	NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
	NEXT_PUBLIC_AUTH_CLIENT_ID=${NEXT_PUBLIC_AUTH_CLIENT_ID} \
	NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
	NEXT_TELEMETRY_DISABLED=1
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/web ./apps/web
RUN cd apps/web && bun run build

FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production \
	NEXT_TELEMETRY_DISABLED=1 \
	PORT=3000 \
	HOSTNAME=0.0.0.0
WORKDIR /app
# Standalone output mirrors the monorepo layout (outputFileTracingRoot = repo root).
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
	CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
