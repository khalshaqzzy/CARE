# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

ARG POSTGRES_IMAGE=postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685
FROM ${POSTGRES_IMAGE} AS pgvector-build
ARG PGVECTOR_VERSION=0.8.6
ARG PGVECTOR_SHA256=10bf9938906e5d643bbc4a7eea104b6f57ba4898e5b76b20e60484ea1d5a7f8f
USER 0
SHELL ["/bin/ash", "-eo", "pipefail", "-c"]
# Build dependencies never enter the runtime stage.
# hadolint ignore=DL3018
RUN apk add --no-cache build-base ca-certificates \
  && wget --quiet --output-document=/tmp/pgvector.tar.gz "https://github.com/pgvector/pgvector/archive/refs/tags/v${PGVECTOR_VERSION}.tar.gz" \
  && echo "${PGVECTOR_SHA256}  /tmp/pgvector.tar.gz" | sha256sum -cs \
  && tar --extract --gzip --file=/tmp/pgvector.tar.gz --directory=/tmp \
  && make -C "/tmp/pgvector-${PGVECTOR_VERSION}" OPTFLAGS='' with_llvm=no \
  && make -C "/tmp/pgvector-${PGVECTOR_VERSION}" install with_llvm=no
USER 70:70

FROM ${POSTGRES_IMAGE}
LABEL org.opencontainers.image.title="care-postgres" \
  org.opencontainers.image.source="https://github.com/khalshaqzzy/CARE" \
  org.opencontainers.image.version="16-pgvector-0.8.6"
USER 0
RUN apk add --no-cache libcrypto3=3.5.8-r0 libssl3=3.5.8-r0 \
  && rm -f /usr/local/bin/gosu
COPY --from=pgvector-build /usr/local/lib/postgresql/vector.so /usr/local/lib/postgresql/vector.so
COPY --from=pgvector-build /usr/local/share/postgresql/extension/vector* /usr/local/share/postgresql/extension/
COPY deploy/postgres/init/001-init.sql /docker-entrypoint-initdb.d/001-init.sql
USER 70:70
