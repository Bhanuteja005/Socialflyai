// SocialFly CI/CD — Declarative Pipeline for a Jenkins Multibranch Pipeline job
// (GitHub Branch Source, so results are reported to PRs and commits as status
// checks). How it works, the controller setup and every credential/variable:
// docs/ci-jenkins.md.
//
// One Jenkinsfile, three modes, decided once in the "Plan" stage:
//   ci        every push/PR: install → lint + typecheck + migrations check →
//             integration tests on a throwaway stack → security → image build check;
//             on main additionally publish images → migrate → deploy → smoke → rollback
//   release   main with the IMAGE_TAG parameter set: skip CI and builds, roll
//             production forward/back to that existing tag
//   security  the weekly timer on main: secret scan + dependency audit only

// Backends first, then the frontends: a new web bundle must never call an API
// that does not exist yet. Deploy order is this list's order.
List<String> releaseApps() {
	def apps = ['auth', 'api', 'worker', 'app', 'site']
	// apps/admin is optional until it lands; once it exists it is always released.
	if (fileExists('apps/admin/package.json')) {
		apps.add('admin')
	}
	return apps
}

// Bun steps run in a container built from oven/bun (+ git, see
// infra/jenkins/bun.Dockerfile) with a shared install cache volume.
void withBun(String extraArgs = '', Closure body) {
	docker.image(env.CI_BUN_IMAGE).inside(
		"-v ${env.BUN_CACHE_VOLUME}:/bun-cache -e BUN_INSTALL_CACHE_DIR=/bun-cache -e HOME=/tmp ${extraArgs}",
		body)
}

// Azure CLI in a container, logged in with the service principal. Each call gets
// its own container and config dir, so parallel branches never share a token cache.
// Secrets reach the shell only as environment variables (single-quoted sh), never
// through Groovy string interpolation, so they are not written to the log.
void withAzure(Closure body) {
	withCredentials([
		usernamePassword(credentialsId: 'azure-sp', usernameVariable: 'AZURE_CLIENT_ID', passwordVariable: 'AZURE_CLIENT_SECRET'),
		string(credentialsId: 'azure-tenant-id', variable: 'AZURE_TENANT_ID'),
		string(credentialsId: 'azure-subscription-id', variable: 'AZURE_SUBSCRIPTION_ID'),
	]) {
		docker.image(env.AZURE_CLI_IMAGE).inside('-e HOME=/tmp -e AZURE_CONFIG_DIR=/tmp/azure -e AZURE_CORE_COLLECT_TELEMETRY=no') {
			sh '''
				az login --service-principal -u "$AZURE_CLIENT_ID" -p "$AZURE_CLIENT_SECRET" --tenant "$AZURE_TENANT_ID" -o none
				az account set --subscription "$AZURE_SUBSCRIPTION_ID"
			'''
			body()
		}
	}
}

pipeline {
	// No executor is held while a fork PR waits for approval; everything that
	// needs a workspace runs inside the "Pipeline" stage's agent.
	agent none

	parameters {
		string(name: 'IMAGE_TAG', defaultValue: '', trim: true,
			description: 'main only. Blank = build and deploy this commit. Set to an existing image tag (a commit SHA) to skip CI/builds and roll production forward/back to it.')
	}

	triggers {
		// Weekly security scan: new advisories appear without any code change.
		cron(env.BRANCH_NAME == 'main' ? 'H 5 * * 1' : '')
	}

	options {
		timestamps()
		buildDiscarder(logRotator(numToKeepStr: '30', artifactNumToKeepStr: '10'))
		// Branches/PRs: a new push supersedes the running build. main: builds queue
		// and are NEVER aborted — stopping between "update api" and "update app"
		// would leave production running two different builds.
		disableConcurrentBuilds(abortPrevious: env.BRANCH_NAME != 'main')
		skipDefaultCheckout()
	}

	environment {
		BUN_VERSION = '1.3.13' // keep in sync with package.json "packageManager" and infra/docker/*
		CI_BUN_IMAGE = 'socialfly-ci-bun:1.3.13'
		BUN_CACHE_VOLUME = 'socialfly-bun-cache'
		GITLEAKS_IMAGE = 'zricethezav/gitleaks:v8.28.0'
		AZURE_CLI_IMAGE = 'mcr.microsoft.com/azure-cli:2.90.0'
		CI = 'true'
		TURBO_TELEMETRY_DISABLED = '1'
		DO_NOT_TRACK = '1'
	}

	stages {
		stage('Plan') {
			steps {
				script {
					def timer = !currentBuild.getBuildCauses('hudson.triggers.TimerTrigger$TimerTriggerCause').isEmpty()
					def tag = (params.IMAGE_TAG ?: '').trim()
					if (tag) {
						if (env.BRANCH_NAME != 'main') {
							error('IMAGE_TAG is only accepted on main (it deploys to production).')
						}
						// It ends up in shell commands and image references.
						if (!(tag ==~ /[A-Za-z0-9][A-Za-z0-9._-]{0,127}/)) {
							error("IMAGE_TAG '${tag}' is not a valid image tag.")
						}
					}
					env.SF_MODE = timer ? 'security' : (tag ? 'release' : 'ci')
					env.SF_DEPLOY_TAG = tag
					// Same gate as the old deploy.yml (vars.AZURE_ACR_NAME != ''): without
					// Azure configured, main gets full CI but nothing is built or deployed.
					env.SF_AZURE = (env.AZURE_ACR_NAME ?: '').trim() ? 'true' : 'false'
					// Unique per build, valid as a compose project name.
					env.CI_STACK = "sfci-${env.BUILD_TAG}".toLowerCase().replaceAll('[^a-z0-9_-]', '-')
					if (env.SF_MODE == 'release' && env.SF_AZURE != 'true') {
						error('IMAGE_TAG was given but Azure is not configured (AZURE_ACR_NAME is empty).')
					}
					echo "mode=${env.SF_MODE} branch=${env.BRANCH_NAME} azure=${env.SF_AZURE}"
				}
			}
		}

		stage('Approve fork PR') {
			// A fork PR's code (tests, install scripts, Dockerfiles) runs on an agent
			// with the Docker socket, i.e. root on that host. An admin reads the diff
			// first. The fork cannot remove this gate: for untrusted forks Jenkins runs
			// the TARGET branch's Jenkinsfile (see gitHubForkDiscovery trust in casc.yaml).
			when {
				changeRequest()
				expression { env.CHANGE_FORK?.trim() }
			}
			steps {
				timeout(time: 7, unit: 'DAYS') {
					input(message: "Run CI for PR #${env.CHANGE_ID} from fork ${env.CHANGE_FORK}? Review the diff first — it will execute on the build agent.",
						ok: 'Run it', submitter: env.FORK_PR_APPROVERS ?: 'admin')
				}
			}
		}

		stage('Pipeline') {
			agent { label 'docker' }
			options {
				// Bounded work only: each deploy step has its own shorter limits, so this
				// cannot fire in the middle of a healthy deploy.
				timeout(time: 2, unit: 'HOURS')
			}
			stages {
				stage('Checkout') {
					steps {
						script {
							def scmVars = checkout scm
							if (!env.SF_DEPLOY_TAG) {
								env.SF_DEPLOY_TAG = scmVars.GIT_COMMIT
							}
						}
						sh '''
							# gitleaks must see every commit, not just the tip.
							if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
								echo "ERROR: shallow clone. Remove the 'Shallow clone' behaviour from the job." >&2
								exit 1
							fi
						'''
					}
				}

				stage('Install') {
					when { expression { env.SF_MODE in ['ci', 'security'] } }
					steps {
						script {
							docker.build(env.CI_BUN_IMAGE, "--build-arg BUN_VERSION=${env.BUN_VERSION} -f infra/jenkins/bun.Dockerfile infra/jenkins")
						}
						// The cache volume is created root-owned; steps run as the agent's uid.
						sh 'docker volume create "$BUN_CACHE_VOLUME" >/dev/null && docker run --rm -u 0 -v "$BUN_CACHE_VOLUME":/cache "$CI_BUN_IMAGE" chown "$(id -u):$(id -g)" /cache'
						// The git plugin points core.hooksPath at /dev/null on every checkout,
						// and the root "prepare" script (lefthook install) refuses to run with a
						// custom hooks path. Safe to drop here: lefthook's hooks only fire on
						// commit, the pipeline never commits, and the next checkout resets it.
						sh 'git config --local --unset-all core.hooksPath || true'
						script {
							// Fails instead of silently resolving a different tree when bun.lock is stale.
							withBun { sh 'bun install --frozen-lockfile' }
						}
					}
				}

				stage('Quality') {
					when { environment name: 'SF_MODE', value: 'ci' }
					parallel {
						stage('Lint') {
							steps { script { withBun { sh 'bunx biome ci .' } } }
						}
						stage('Typecheck') {
							// Every workspace: packages share types (db schema, queue payloads,
							// API routes → frontends), so one change can break a consumer elsewhere.
							steps { script { withBun { sh 'bunx turbo typecheck' } } }
						}
						stage('Migrations committed') {
							// A schema change without a generated migration passes every test
							// (tests migrate from the committed SQL) and then breaks production.
							steps {
								script {
									withBun {
										sh '''
											cd packages/db
											bunx drizzle-kit generate --name ci_check
											if [ -n "$(git status --porcelain drizzle)" ]; then
												echo "ERROR: schema changed without a migration. Run: bun run cli db generate <name>" >&2
												git status --porcelain drizzle
												exit 1
											fi
										'''
									}
								}
							}
						}
					}
				}

				stage('Test') {
					// Real Postgres/Redis/S3, not mocks. A private stack per build (see
					// infra/compose/ci.yaml): no host ports, so parallel builds never collide.
					when { environment name: 'SF_MODE', value: 'ci' }
					steps {
						sh '''
							docker compose -p "$CI_STACK" -f infra/compose/ci.yaml up -d --wait --wait-timeout 180 postgres redis storage
							docker compose -p "$CI_STACK" -f infra/compose/ci.yaml run --rm storage-init
						'''
						script {
							def netns = sh(returnStdout: true, script: 'docker compose -p "$CI_STACK" -f infra/compose/ci.yaml ps -q postgres').trim()
							// Joins the stack's network namespace: localhost:5434/6380/9000 are the
							// stack's services, exactly what the test setups default to.
							withBun("--network container:${netns}") {
								sh 'bunx turbo test'
							}
						}
					}
					post {
						always {
							sh 'docker compose -p "$CI_STACK" -f infra/compose/ci.yaml --profile init down -v --remove-orphans || true'
						}
					}
				}

				stage('Security') {
					// The previous SocialFly repos had passwords, API keys and page tokens
					// committed to git; this makes that fail loudly instead of shipping.
					when { expression { env.SF_MODE in ['ci', 'security'] } }
					parallel {
						stage('Secret scan') {
							steps {
								script {
									docker.image(env.GITLEAKS_IMAGE).inside('--entrypoint= -e HOME=/tmp') {
										sh 'gitleaks git --config .gitleaks.toml --redact --no-banner --verbose .'
									}
								}
							}
						}
						stage('Dependency audit') {
							// High and critical only: fail on what matters, report the rest.
							steps { script { withBun { sh 'bun audit --audit-level=high' } } }
						}
					}
				}

				stage('Image build check') {
					// PRs and branches prove every Dockerfile still builds; nothing is pushed.
					// (main builds the real images in ACR below.)
					when {
						environment name: 'SF_MODE', value: 'ci'
						not { branch 'main' }
					}
					steps {
						script {
							def builds = [:]
							for (String name : releaseApps()) {
								def app = name
								builds[app] = {
									sh "bash infra/jenkins/scripts/release.sh build-local ${app} ${env.CI_STACK}"
								}
							}
							parallel builds
						}
					}
				}

				stage('Publish images') {
					when {
						branch 'main'
						environment name: 'SF_MODE', value: 'ci'
						environment name: 'SF_AZURE', value: 'true'
					}
					environment { DEPLOY_TAG = "${env.SF_DEPLOY_TAG}" }
					steps {
						script {
							def builds = [:]
							for (String name : releaseApps()) {
								def app = name
								builds[app] = {
									withAzure { sh "bash infra/jenkins/scripts/release.sh publish ${app}" }
								}
							}
							parallel builds
						}
					}
				}

				stage('Deploy') {
					when {
						beforeOptions true
						branch 'main'
						expression { env.SF_MODE in ['ci', 'release'] }
						environment name: 'SF_AZURE', value: 'true'
					}
					options {
						// Serialised across every job on this controller. Never abortPrevious.
						lock(resource: 'production-deploy')
					}
					environment { DEPLOY_TAG = "${env.SF_DEPLOY_TAG}" }
					steps {
						script {
							env.DEPLOY_APPS = releaseApps().join(' ')
							currentBuild.description = "deploy ${env.DEPLOY_TAG}"
							if (env.DEPLOY_APPROVERS?.trim()) {
								// Inside the 2-hour stage timeout: approve promptly or re-run.
								timeout(time: 60, unit: 'MINUTES') {
									input(message: "Deploy ${env.DEPLOY_TAG} to production?", ok: 'Deploy', submitter: env.DEPLOY_APPROVERS)
								}
							}
							withAzure {
								def release = 'bash infra/jenkins/scripts/release.sh'
								try {
									sh "${release} check"
									sh "${release} record"
									// Migrations first: if they fail, nothing was deployed.
									sh "${release} migrate"
									try {
										sh "${release} deploy"
										sh "${release} smoke"
									} catch (err) {
										sh "${release} rollback"
										throw err
									}
								} finally {
									sh "${release} summary | tee deploy-summary.txt"
									archiveArtifacts(artifacts: 'deploy-summary.txt, .deploy/live-images.txt', allowEmptyArchive: true)
								}
							}
						}
					}
				}

				stage('Main without Azure') {
					when {
						branch 'main'
						environment name: 'SF_MODE', value: 'ci'
						environment name: 'SF_AZURE', value: 'false'
					}
					steps {
						echo 'AZURE_ACR_NAME is not set: CI passed, nothing was built or deployed (see docs/ci-jenkins.md).'
					}
				}
			}
			post {
				always {
					// Workspaces hold node_modules and a full clone; don't let them pile up.
					cleanWs(deleteDirs: true, disableDeferredWipeout: true, notFailBuild: true)
				}
			}
		}
	}
}
