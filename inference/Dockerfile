# CARE local inference images. Built manually on dx-2; they are not part of CARE CI/CD.
FROM caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d AS gateway

# The upstream binary carries cap_net_bind_service. Copying it creates a
# high-port-only binary without that xattr, so no-new-privileges + cap_drop=ALL
# remains compatible with a rootless gateway.
USER root
RUN cp /usr/bin/caddy /usr/bin/caddy-unprivileged
USER 65532:65532
ENTRYPOINT ["/usr/bin/caddy-unprivileged"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]

FROM nvcr.io/nvidia/cuda:13.0.3-devel-ubuntu24.04@sha256:b7ae301dea2c162444795462ce17a05f6a516e5a75944b57af5b88540a1a2266 AS inference

ENV DEBIAN_FRONTEND=noninteractive \
    CUDA_HOME=/usr/local/cuda \
    PIP_NO_CACHE_DIR=1 \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

# Ubuntu package revisions are inherited from the digest-pinned CUDA base.
# hadolint ignore=DL3008
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3.12-full \
      python3.12-dev \
      python3-pip \
      git \
      curl \
      ca-certificates \
      ninja-build \
      build-essential \
      libopenmpi3 \
      libnuma1 \
      libibverbs1 \
      libnl-3-200 \
      libnl-route-3-200 \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 2 \
    && update-alternatives --set python3 /usr/bin/python3.12 \
    && ln -sf /usr/bin/python3.12 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Granite 4.2 requires SGLang 0.5.18+ for automatic reasoning/tool parsers.
RUN python3 -m pip config set global.break-system-packages true \
    && python3 -m pip install "sglang[all]==0.5.18"

EXPOSE 30000
CMD ["bash"]
