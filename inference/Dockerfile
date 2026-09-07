# CARE local inference images. Built manually on dx-2; they are not part of CARE CI/CD.
ARG GO_IMAGE=golang:1.25.13-alpine@sha256:1e0126852075c9c60731c8ba49088448b91f63e2aed97ca9d1a9791622a05946
ARG GATEWAY_RUNTIME_IMAGE=gcr.io/distroless/static-debian12:nonroot@sha256:afa5c872c891853ca7fcf1f12c3edb23f7eeef36189728842dd51042ff57f7ab

FROM ${GO_IMAGE} AS gateway-build
WORKDIR /build
RUN --mount=type=cache,id=care-inference-caddy-go-mod,target=/go/pkg/mod \
    --mount=type=cache,id=care-inference-caddy-go-build,target=/root/.cache/go-build \
    printf '%s\n' \
      'package main' \
      'import (' \
      '  caddycmd "github.com/caddyserver/caddy/v2/cmd"' \
      '  _ "github.com/caddyserver/caddy/v2/modules/standard"' \
      ')' \
      'func main() { caddycmd.Main() }' > main.go \
    && go mod init care/inference-gateway \
    && go get github.com/caddyserver/caddy/v2@v2.11.4 \
    && go get golang.org/x/crypto@v0.55.0 golang.org/x/net@v0.57.0 golang.org/x/text@v0.41.0 google.golang.org/grpc@v1.82.1 \
    && go mod tidy \
    && CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/caddy . \
    && printf '%s\n' \
      'package main' \
      'import ("io"; "net/http"; "os")' \
      'func main() {' \
      '  request, err := http.NewRequest(http.MethodGet, "http://127.0.0.1:30000/v1/models", nil)' \
      '  if err != nil { os.Exit(1) }' \
      '  request.Header.Set("Authorization", "Bearer "+os.Getenv("INFERENCE_API_KEY"))' \
      '  response, err := (&http.Client{}).Do(request)' \
      '  if err != nil { os.Exit(1) }' \
      '  defer response.Body.Close()' \
      '  _, _ = io.Copy(io.Discard, response.Body)' \
      '  if response.StatusCode != http.StatusOK { os.Exit(1) }' \
      '}' > healthcheck.go \
    && CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/healthcheck healthcheck.go

FROM ${GATEWAY_RUNTIME_IMAGE} AS gateway

COPY --from=gateway-build /out/caddy /usr/bin/caddy-unprivileged
COPY --from=gateway-build /out/healthcheck /usr/bin/healthcheck
ENV XDG_CONFIG_HOME=/config XDG_DATA_HOME=/data
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
