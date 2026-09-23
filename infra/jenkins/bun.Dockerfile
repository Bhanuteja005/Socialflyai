# Image the Jenkinsfile runs every Bun step in: the official Bun image plus git.
#
# git is not optional: `bun install` runs the root "prepare" script (lefthook
# install), which fails without it, and Turbo/Biome use it for change detection
# and .gitignore handling. Built on the agent by the pipeline itself
# (docker.build), so there is nothing to publish; Docker's layer cache makes the
# rebuild a no-op until BUN_VERSION changes.
#
# Keep BUN_VERSION in sync with package.json "packageManager" and infra/docker/*.

ARG BUN_VERSION=1.3.13
FROM oven/bun:${BUN_VERSION}

RUN apt-get update \
	&& apt-get install -y --no-install-recommends git ca-certificates \
	&& rm -rf /var/lib/apt/lists/* \
	# The workspace is bind-mounted from the agent and may be owned by a different
	# uid than the one the step runs as; git would refuse it as "dubious ownership".
	&& git config --system --add safe.directory '*'
