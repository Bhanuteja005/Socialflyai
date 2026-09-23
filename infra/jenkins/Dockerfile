# SocialFly Jenkins controller: Jenkins LTS + Docker CLI + plugins + JCasC.
#
#   docker compose -f infra/jenkins/compose.yaml up -d --build
#
# Everything the UI would otherwise ask for (setup wizard, plugins, admin user,
# the SocialFly multibranch job, global variables) comes from plugins.txt and
# casc.yaml, so the controller is reproducible and disposable.

FROM docker:29-cli AS docker-cli

FROM jenkins/jenkins:2.568.3-lts-jdk21

# Builds drive the HOST Docker daemon through the mounted socket (see compose.yaml):
# the CLI, BuildKit (buildx) and compose are all the controller needs. Static
# binaries copied from the official image — no apt repository to trust or pin.
USER root
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/ /usr/local/libexec/docker/cli-plugins/
USER jenkins

COPY --chown=jenkins:jenkins plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt

COPY --chown=jenkins:jenkins casc.yaml /usr/share/jenkins/casc.yaml
ENV CASC_JENKINS_CONFIG=/usr/share/jenkins/casc.yaml \
	JAVA_OPTS="-Djenkins.install.runSetupWizard=false"
