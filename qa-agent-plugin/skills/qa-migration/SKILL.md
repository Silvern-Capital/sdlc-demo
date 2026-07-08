---
name: qa-migration
description: Data-migration QA with no repo build or browser in the path — validate qa/data_migrated.json against data.js (row counts, field drift, status vocabulary, id integrity) and report every discrepancy.
---

# QA — data migration

1. Run:
   ```bash
   node qa/check_migration.js
   ```
   It compares `qa/data_migrated.json` (post-migration data) against `data.js` (source of truth):
   - row count + id integrity (missing/unexpected/duplicate ids)
   - status vocabulary (`ok|warn|down`)
   - per-field value drift (every field, including `runRate7d`)
2. Report:
   - **PASS**: row count confirmed.
   - **FAIL**: EVERY discrepancy, each with the check that proves it (the script prints them as `[check-name] detail`).
3. STOP. Report only — do not edit the fixture or data.js.
