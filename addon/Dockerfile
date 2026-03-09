ARG BUILD_FROM=ghcr.io/hassio-addons/base:20.0.1

# hadolint ignore=DL3006
FROM ${BUILD_FROM}

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV TERM="xterm-256color" \
    LANG="C.UTF-8"

# Install system packages
# hadolint ignore=DL3018
RUN apk add --no-cache \
    bash \
    ca-certificates \
    curl \
    git \
    libgcc \
    libstdc++ \
    nodejs \
    npm \
    python3 \
    fd \
    ripgrep \
    tmux \
    ttyd \
    mosquitto-clients

# Install pi coding agent (pinned version)
RUN npm install -g @mariozechner/pi-coding-agent@0.57.1

# Copy HA extension into image
COPY extensions/home-assistant /opt/ha-extension

# Copy custom component for pi_agent.ask service
COPY component/pi_agent /opt/pi-agent-component/pi_agent

# Install extension dependencies
RUN cd /opt/ha-extension && npm install --omit=dev

# Copy rootfs overlay
COPY rootfs /

# Ensure scripts are executable
RUN chmod a+x /usr/bin/pi-entrypoint.sh \
    && find /etc/s6-overlay/s6-rc.d -name 'run' -exec chmod a+x {} \; \
    && find /etc/s6-overlay/s6-rc.d -name 'finish' -exec chmod a+x {} \;

# Build arguments for labels
ARG BUILD_ARCH
ARG BUILD_DATE
ARG BUILD_DESCRIPTION
ARG BUILD_NAME
ARG BUILD_REF
ARG BUILD_REPOSITORY
ARG BUILD_VERSION

# Labels
LABEL \
    io.hass.name="${BUILD_NAME}" \
    io.hass.description="${BUILD_DESCRIPTION}" \
    io.hass.arch="${BUILD_ARCH}" \
    io.hass.type="addon" \
    io.hass.version=${BUILD_VERSION}
