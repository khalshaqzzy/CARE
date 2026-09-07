# CARE Local Inference

This directory serves `ibm-granite/granite-4.2-3b` with SGLang on the dedicated
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
- The model context window is 32,768 tokens and CARE caps generated output at
  4,096 new tokens.
- The NVIDIA/SGLang container runs as the image-defined root user because the
  CUDA development image and runtime write caches under `/root`; it has no host
  port or host filesystem access other than the dedicated Hugging Face cache.

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

The first start downloads the model. Later rebuilds reuse `HF_CACHE`.

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

## Stop and rollback

```sh
docker compose --env-file .env down
```

The model cache is retained. Host-side backups made before an update can be
restored without changing the Cloudflare tunnel token.
