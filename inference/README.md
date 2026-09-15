# CARE Local Inference

This directory serves `inclusionAI/Ling-3.0-tiny-fp8` with SGLang on the dedicated
`dx-2` GPU host. It is intentionally independent from CARE release/deployment
Compose. Updates are operated manually through SSH; the host-level systemd unit
starts the already-installed stack automatically after a reboot.

## Runtime boundary

- SGLang is reachable only inside the Compose network.
- Caddy exposes `127.0.0.1:30000` and requires one Bearer API key.
- Cloudflare Tunnel `9c0cee75-da3c-44d6-ba10-d9d8f20331af` routes
  `inference.qd-tmmin.site` to the loopback gateway.
- There is no application rate limiter. Cloudflare's normal network protection
  remains outside this stack.
- The model context window is 32,768 tokens and the CARE application caps its
  Ling requests at 8,192 new tokens. The inference stack does not enforce a
  global output cap for other clients.
- Ling uses its checkpoint-native FP8 quantization, explicit `deepseek-r1`
  reasoning and `glm45` tool parsers, and LPM scheduling. NEXTN speculative
  decoding is intentionally disabled because Ling Tiny has no draft layer.
- The NVIDIA/SGLang container is built locally from the digest-pinned CUDA
  13.0.3 development base and SGLang 0.5.19. The `dx-2` Docker build cache
  reuses the CUDA/toolchain layers; no vendor prebuilt SGLang image is used.
- The inference container runs as root because CUDA tooling and the runtime
  write caches under `/root`; it has no host port or host filesystem access
  other than the dedicated Hugging Face cache.

## First start / update

```sh
cd /home/pcsistem/GitHub/CARE/inference
cp .env.example .env
chmod 0600 .env
# Set one random INFERENCE_API_KEY without printing it in shared logs.
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d --build
docker compose --env-file .env ps
```

The first start downloads the model. Later starts reuse `HF_CACHE`.

## Boot and crash recovery

Install the included host units once on `dx-2`:

```sh
sudo install -Dm0644 systemd/care-inference.service \
  /etc/systemd/system/care-inference.service
sudo install -Dm0644 systemd/cloudflared-restart.conf \
  /etc/systemd/system/cloudflared.service.d/restart.conf
sudo systemctl daemon-reload
sudo systemctl enable --now docker.service cloudflared.service \
  care-inference.service
```

The Compose services also use `restart: unless-stopped`. The systemd unit calls
`docker compose up -d` on every host boot, while Docker recovers the containers
after daemon or container crashes. The cloudflared drop-in retries the existing
tunnel indefinitely with a five-second delay and disables systemd's repeated-
failure start limit. Model updates remain manual using the commands above;
these units do not join the CARE deployment flow.

Verify the persistence configuration without rebooting the host:

```sh
systemctl is-enabled docker cloudflared care-inference
systemctl is-active docker cloudflared care-inference
systemctl show cloudflared --property=Restart --property=RestartUSec
docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' \
  care-inference-inference-1 care-inference-gateway-1
```

## Validation

```sh
set -a
. ./.env
set +a
python3 scripts/live_smoke.py
```

Run the smoke only in a private operator shell; it prints model, latency,
reasoning presence, and tool-call validity, never the key or reasoning text.

## Stop

```sh
docker compose --env-file .env down
```

The model cache is retained when the stack stops.
