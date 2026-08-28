# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

ARG NODE_IMAGE=node:22.23.2-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5
ARG RUNTIME_IMAGE=gcr.io/distroless/cc-debian12:nonroot@sha256:9dac0a79194e45a7da0158a9c6da57b217585af0786db3845d1f0ec1a0dd182f

FROM ${NODE_IMAGE} AS build
WORKDIR /workspace

# Prisma resolves its Debian OpenSSL engine during generation.
# hadolint ignore=DL3008
RUN apt-get update \
  && apt-get install --yes --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,id=care-pnpm,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile --filter @care/api... --filter @care/contracts

COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN --mount=type=cache,id=care-pnpm,target=/root/.local/share/pnpm/store \
  pnpm --filter @care/api prisma:generate \
  && pnpm --filter @care/contracts build \
  && pnpm --filter @care/api build \
  && pnpm --filter @care/api deploy --prod --legacy /opt/api \
  && node /opt/api/node_modules/prisma/build/index.js generate --schema /opt/api/prisma/schema.prisma

FROM ${RUNTIME_IMAGE} AS runtime
ARG RELEASE_SHA=unknown
LABEL org.opencontainers.image.title="care-api" \
  org.opencontainers.image.revision="${RELEASE_SHA}" \
  org.opencontainers.image.source="https://github.com/khalshaqzzy/CARE"

ENV NODE_ENV=production \
  PORT=3000 \
  PATH=/nodejs/bin
WORKDIR /app

COPY --from=build /usr/local/bin/node /nodejs/bin/node
COPY --from=build --chown=65532:65532 /opt/api/ ./

USER 65532:65532
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=18 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/ready').then(async(r)=>{const b=await r.json();if(!r.ok||b.status!=='ready'||b.releaseSha!==process.env.RELEASE_SHA)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
