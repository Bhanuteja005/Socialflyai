#!/usr/bin/env bash
# Image and release steps for the Jenkinsfile. One subcommand per step so the
# pipeline decides what happens between them (rollback only after something
# changed). Everything except build-local runs inside the azure-cli container
# after `az login`:
#
#   release.sh build-local <app> <tag>  docker build only (PR check; nothing pushed)
#   release.sh publish <app>            ACR Tasks build + push :${DEPLOY_TAG} and :latest
#   release.sh check                    required configuration is present
#   release.sh record                   record the images live RIGHT NOW (rollback target)
#   release.sh migrate                  run DB migrations as a Container Apps job
#   release.sh deploy                   point every container app at ${DEPLOY_TAG}
#   release.sh smoke                    /ready on auth + api, 200 on each web app
#   release.sh rollback                 restore the recorded images, wait for health
#   release.sh summary                  what was deployed and how to roll back
#
# Inputs (environment): DEPLOY_TAG, AZURE_ACR_NAME, AZURE_RESOURCE_GROUP,
# DEPLOY_APPS (image names in deploy order, e.g. "auth api worker app site"),
# ACA_<APP>_APP per image (see app_var), ACA_MIGRATE_JOB, AUTH_URL, API_URL,
# WEB_URL, SITE_URL, ADMIN_URL when admin is deployed, NEXT_PUBLIC_SENTRY_DSN,
# STATE_DIR.
set -euo pipefail

STATE_DIR="${STATE_DIR:-.deploy}"
LIVE_FILE="${STATE_DIR}/live-images.txt"
REGISTRY="${AZURE_ACR_NAME:-}.azurecr.io"
RG="${AZURE_RESOURCE_GROUP:-}"

# Image name → the variable holding its Container App name. "app" (apps/app, the
# product UI at WEB_URL) keeps the historical ACA_WEB_APP name.
app_var() {
	case "$1" in
	auth) echo ACA_AUTH_APP ;;
	api) echo ACA_API_APP ;;
	worker) echo ACA_WORKER_APP ;;
	app) echo ACA_WEB_APP ;;
	site) echo ACA_SITE_APP ;;
	admin) echo ACA_ADMIN_APP ;;
	*)
		echo "unknown app: $1" >&2
		exit 2
		;;
	esac
}
app_name() {
	local var
	var="$(app_var "$1")"
	echo "${!var:-}"
}

# Dockerfile + build args for one image, shared by the PR build check and the
# ACR build so both build exactly the same thing.
image_args() {
	local app="$1"
	IMG_ARGS=(--build-arg "APP=${app}" --build-arg "APP_VERSION=${DEPLOY_TAG:-dev}")
	case "$app" in
	api) IMG_ARGS+=(--file infra/docker/service.Dockerfile --build-arg PORT=4400) ;;
	auth) IMG_ARGS+=(--file infra/docker/service.Dockerfile --build-arg PORT=4800) ;;
	worker) IMG_ARGS+=(--file infra/docker/service.Dockerfile --build-arg PORT=4500) ;;
	app | site | admin)
		# NEXT_PUBLIC_* are BUILD args: Next.js inlines them into the client bundle,
		# so setting them on the running container would have no effect. Each
		# frontend links to the other two, so all of them get every public URL.
		local client_id=socialfly-web
		[ "$app" = admin ] && client_id=socialfly-admin
		IMG_ARGS+=(
			--file infra/docker/web.Dockerfile
			--build-arg "NEXT_PUBLIC_API_URL=${API_URL:-}"
			--build-arg "NEXT_PUBLIC_AUTH_URL=${AUTH_URL:-}"
			--build-arg "NEXT_PUBLIC_AUTH_CLIENT_ID=${client_id}"
			--build-arg "NEXT_PUBLIC_APP_URL=${WEB_URL:-}"
			--build-arg "NEXT_PUBLIC_SITE_URL=${SITE_URL:-}"
			--build-arg "NEXT_PUBLIC_ADMIN_URL=${ADMIN_URL:-}"
			--build-arg "NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN:-}"
		)
		;;
	*)
		echo "unknown app: $app" >&2
		exit 2
		;;
	esac
}

cmd_build_local() {
	local app="${1:?app}" tag="${2:?tag}"
	image_args "$app"
	docker build "${IMG_ARGS[@]}" -t "socialfly-ci/${app}:${tag}" .
	docker image rm "socialfly-ci/${app}:${tag}" >/dev/null
}

# Built by ACR Tasks next to the registry: nothing is pushed from the agent, and
# the agent needs no Docker login to ACR.
cmd_publish() {
	local app="${1:?app}"
	image_args "$app"
	az acr build --registry "$AZURE_ACR_NAME" \
		--image "socialfly/${app}:${DEPLOY_TAG}" --image "socialfly/${app}:latest" \
		"${IMG_ARGS[@]}" .
}

cmd_check() {
	local missing=() v app
	for v in DEPLOY_TAG AZURE_ACR_NAME AZURE_RESOURCE_GROUP ACA_MIGRATE_JOB AUTH_URL API_URL WEB_URL SITE_URL DEPLOY_APPS; do
		[ -n "${!v:-}" ] || missing+=("$v")
	done
	for app in ${DEPLOY_APPS:-}; do
		[ -n "$(app_name "$app")" ] || missing+=("$(app_var "$app")")
	done
	case " ${DEPLOY_APPS:-} " in *" admin "*) [ -n "${ADMIN_URL:-}" ] || missing+=(ADMIN_URL) ;; esac
	if [ ${#missing[@]} -gt 0 ]; then
		echo "ERROR: missing Jenkins configuration: ${missing[*]} (Manage Jenkins → System → Global properties, or casc.yaml)" >&2
		exit 1
	fi
	echo "deploying ${DEPLOY_TAG} to: ${DEPLOY_APPS}"
}

# Captured BEFORE anything changes, so rollback restores what was actually
# serving — not a guess at "the previous commit".
cmd_record() {
	mkdir -p "$STATE_DIR"
	: >"$LIVE_FILE"
	local app image
	for app in $DEPLOY_APPS; do
		image=$(az containerapp show -n "$(app_name "$app")" -g "$RG" \
			--query 'properties.template.containers[0].image' -o tsv)
		echo "${app} ${image}" >>"$LIVE_FILE"
		echo "live ${app}: ${image}"
	done
}

# A Container Apps JOB running the new api image: the database stays on the
# private network (no firewall hole for the CI agent). Migrations must be
# backward compatible (expand → deploy → contract), because a rollback restores
# OLD code against the NEW schema.
cmd_migrate() {
	az containerapp job update -n "$ACA_MIGRATE_JOB" -g "$RG" \
		--image "${REGISTRY}/socialfly/api:${DEPLOY_TAG}" \
		--command "bun" --args "/app/packages/db/src/migrate.ts" -o none
	local execution status
	execution=$(az containerapp job start -n "$ACA_MIGRATE_JOB" -g "$RG" --query name -o tsv)
	echo "migration execution: $execution"
	for _ in $(seq 1 120); do
		status=$(az containerapp job execution show -n "$ACA_MIGRATE_JOB" -g "$RG" \
			--job-execution-name "$execution" --query properties.status -o tsv)
		case "$status" in
		Succeeded)
			echo "migrations applied"
			return 0
			;;
		Failed | Stopped | Degraded)
			echo "ERROR: migration ${status} — nothing was deployed" >&2
			return 1
			;;
		esac
		sleep 5
	done
	echo "ERROR: migration timed out after 10 minutes" >&2
	return 1
}

# DEPLOY_APPS is ordered backends first, so a new web bundle never calls an API
# that does not exist yet. The worker drains in-flight jobs on SIGTERM.
cmd_deploy() {
	local app
	for app in $DEPLOY_APPS; do
		echo "update ${app} → ${REGISTRY}/socialfly/${app}:${DEPLOY_TAG}"
		az containerapp update -n "$(app_name "$app")" -g "$RG" \
			--image "${REGISTRY}/socialfly/${app}:${DEPLOY_TAG}" -o none
	done
}

check_url() {
	local name="$1" url="$2" code="000" attempt
	for attempt in $(seq 1 30); do
		code=$(curl -sL -o /dev/null -w '%{http_code}' --max-time 10 "$url" || echo 000)
		if [ "$code" = "200" ]; then
			echo "ok   ${name} (${attempt} attempt(s))"
			return 0
		fi
		sleep 10
	done
	echo "FAIL ${name}: last status ${code} after 5 minutes" >&2
	return 1
}

# /ready checks each service's real dependencies (DB, Redis, queue), so a
# container that boots with a bad connection string fails here. The worker has
# internal ingress only, so the agent cannot reach it; Container Apps' own
# readiness probe on /ready keeps a broken worker revision from going live.
cmd_smoke() {
	check_url auth "${AUTH_URL}/ready"
	check_url api "${API_URL}/ready"
	check_url app "${WEB_URL}"
	case " $DEPLOY_APPS " in *" site "*) check_url site "${SITE_URL}" ;; esac
	case " $DEPLOY_APPS " in *" admin "*) check_url admin "${ADMIN_URL}" ;; esac
}

cmd_rollback() {
	if [ ! -s "$LIVE_FILE" ]; then
		echo "ERROR: no recorded live images — cannot roll back automatically" >&2
		return 1
	fi
	echo "Deploy or smoke test failed — restoring the previously live images." >&2
	local app image
	while read -r app image; do
		[ -n "$image" ] || continue
		echo "restore ${app} → ${image}"
		az containerapp update -n "$(app_name "$app")" -g "$RG" --image "$image" -o none
	done <"$LIVE_FILE"
	if check_url api "${API_URL}/ready"; then
		echo "previous version healthy again"
		return 0
	fi
	echo "ERROR: rollback did not become healthy — production needs manual attention." >&2
	return 1
}

cmd_summary() {
	echo "Image tag: ${DEPLOY_TAG}"
	echo "Apps:      ${DEPLOY_APPS}"
	if [ -s "$LIVE_FILE" ]; then
		echo "Previously live (re-run main with IMAGE_TAG=<that tag> to roll back):"
		sed 's/^/  /' "$LIVE_FILE"
	fi
}

case "${1:-}" in
build-local) cmd_build_local "${@:2}" ;;
publish) cmd_publish "${@:2}" ;;
check | record | migrate | deploy | smoke | rollback | summary) "cmd_$1" ;;
*)
	echo "usage: $0 build-local|publish|check|record|migrate|deploy|smoke|rollback|summary" >&2
	exit 2
	;;
esac
