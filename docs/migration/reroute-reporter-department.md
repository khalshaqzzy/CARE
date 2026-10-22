# Move active Voices back to the reporter's department

One-off for a category whose route Admin changed from **Pemilik lokasi (shop kejadian)** to **Related Dept (department reporter)**, such as Fasilitas Kerja / Kesulitan Kerja (`WORK_DIFFICULTY`). The route change only applies to new Voices. This tool moves the active ones that went to another department's shop.

## What it does

The tool selects active Voices (Terbuka, Direspon, Diproses) of the category that are handled outside the reporter's department. Each one starts again at the bottom of the reporter's own chain: Group Leader → Section Head → Manager.

For every Voice it moved:

- **Window:** a new one. Respond if Terbuka; respond + process if Direspon.
- **Status:** a Voice in **Diproses** loses its PIC and current target and returns to **Direspon**. A report waiting for approval is returned.
- **Old department:** the shop department loses access.
- **Notes:**
  - The timeline records the move (`ADMIN_HANDOVER_ROUTED`, source `REPORTER_DEPARTMENT_REROUTE`).
  - An open chat gets "Voice dialihkan ke …".
  - The new first level is notified.

The tool refuses to run while the category still routes to the shop. A Voice whose reporter department has no active Department Head or no leaders is reported as `ERROR` and left alone. Running it again only finds what is left.

## Run on the server

Use the API image of the current release. `RELEASE` is `<base>/releases/$(cat <base>/current_release)`, as for the legacy import. Dry run first. It lists each Voice with the department it moves from and to, and who receives it.

```bash
docker compose --project-name "$(grep '^COMPOSE_PROJECT_NAME=' "$RELEASE/.runtime.env" | cut -d= -f2)" \
  --env-file "$RELEASE/.runtime.env" -f "$RELEASE/deploy/compose/docker-compose.remote.yml" \
  --profile operations run --rm \
  --entrypoint node migrate dist/cli/reroute-reporter-department.js --category WORK_DIFFICULTY
```

Then repeat the same command with `--commit` added at the end.
