# Legacy Voice migration

How closed Voices from earlier member-voice platforms are brought into CARE. The decisions are recorded in [ADR-0061](../adr/0061-legacy-voice-migration.md).

| File                               | Purpose                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `Template_Migrasi_Voice_CARE.xlsx` | Workbook sent to each old-platform PIC (one row per closed Voice)       |
| `build_template.py`                | Regenerates the workbook (`python build_template.py`, needs `openpyxl`) |

Do not commit filled workbooks or reports: they contain names and Voice text.

## Each batch

1. Make sure the latest HR organization file is imported, so NoRegs and departments match.
2. Receive the filled workbook. Fill in the orange columns (Area, Kategori CARE, Severity) and any blank Area or Kategori CARE.
3. Dry run locally against a copy of the data, then fix the rows the report marks `ERROR`:

   ```bash
   pnpm --filter @care/api exec tsx src/cli/import-legacy-voices.ts --file ./batch-1.xlsx
   ```

   The report is written next to the workbook as `batch-1-hasil.csv`. `SIAP` means ready. `DILEWATI` means already in CARE.

4. Run on the server with the API image of the current release:

   1. Copy the workbook into a folder on the VPS, for example `/srv/care-migration`.
   2. Let the container user (`65532`) write the report there: `sudo chown 65532 /srv/care-migration`.
   3. Dry run first, then repeat with `--commit`. `RELEASE` is the folder of the current release, `<base>/releases/$(cat <base>/current_release)`. The project name must be the running stack's, so the container reaches its database.

   ```bash
   docker compose --project-name "$(grep '^COMPOSE_PROJECT_NAME=' "$RELEASE/.runtime.env" | cut -d= -f2)" \
     --env-file "$RELEASE/.runtime.env" -f "$RELEASE/deploy/compose/docker-compose.remote.yml" \
     --profile operations run --rm -v /srv/care-migration:/migration \
     --entrypoint node migrate dist/cli/import-legacy-voices.js --file /migration/batch-1.xlsx
   ```

   A commit writes all rows or none. Running the same file again only reports the rows as `DILEWATI`.

5. Spot-check a few Voices with the PIC. Search by the old ID in the Voice list. Then delete the workbook and report from the server.

## Rules the importer enforces

- Only closed Voices: `Tanggal Ditutup` is required.
- Times are WIB, written `YYYY-MM-DD HH:MM`. Response and closing times cannot be earlier than the submit time.
- General Voices need a handling division and department that exist in CARE. Private Voices do not.
- NoRegs missing from CARE become inactive accounts. The report lists them.
- Ratings are whole numbers from 1 to 5. Leave the cell empty when there is no rating. Never write 0.
