# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

ARG NODE_IMAGE=node:22.23.2-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5
ARG STATIC_IMAGE=nginxinc/nginx-unprivileged:1.31.4-alpine@sha256:901e944d1f4fc2bd077e8f5568b98c1f6f8cdacf6b97a87747c43134a339b9a7

FROM ${NODE_IMAGE} AS build
ARG RELEASE_SHA=unknown
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/web-voice/package.json apps/web-voice/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/frontend-core/package.json packages/frontend-core/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN --mount=type=cache,id=care-pnpm,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile --filter @care/web-voice...

COPY apps/web-voice apps/web-voice
COPY packages/contracts packages/contracts
COPY packages/frontend-core packages/frontend-core
COPY packages/ui packages/ui
RUN pnpm --filter @care/web-voice... build \
  && node --input-type=module -e "import{writeFileSync}from'node:fs';writeFileSync('apps/web-voice/dist/release.json',JSON.stringify({application:'care-web-voice',releaseSha:process.argv[1]})+'\\n')" "${RELEASE_SHA}"

FROM ${STATIC_IMAGE} AS runtime
ARG RELEASE_SHA=unknown
LABEL org.opencontainers.image.title="care-web-voice" \
  org.opencontainers.image.revision="${RELEASE_SHA}" \
  org.opencontainers.image.source="https://github.com/khalshaqzzy/CARE"
USER 0
# Pinned alpine packages: force patched versions past the frozen base image
# so the Trivy gate stays green between base-image digest bumps.
RUN apk add --no-cache libcrypto3=3.5.8-r0 libssl3=3.5.8-r0 libexpat=2.8.4-r0 libuuid=2.42.3-r0
COPY deploy/nginx/spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=101:101 /workspace/apps/web-voice/dist/ /usr/share/nginx/html/
USER 101
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=12 \
  CMD ["wget", "--quiet", "--tries=1", "--spider", "http://127.0.0.1:8080/healthz"]
