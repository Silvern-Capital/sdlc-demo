---
name: migrate-data
description: Static migration workflow for the site dataset. Validates a migrated dataset against data.js (the source of truth), classifies every discrepancy, applies the fix rule for its class, and re-validates until clean. Use when a data migration fails QA.
---

# Data migration - static workflow

The first migration attempt usually fails QA. That is expected. This skill is
the written-down workflow that turns a failed migration into a passing one,
the same way every time, instead of ad hoc fixes.

Work on `qa/data_migrated.json`. The source of truth is `data.js`
(`window.STORES`). Never edit `data.js` to make the migration pass.

## Workflow (run in this order, no steps skipped)

1. **Validate.** Run `node qa/check_migration.js`. If it exits clean, stop
   and report: the migration already passes.
2. **Classify.** Put every reported discrepancy into exactly one class:
   - `row-count / id-integrity` - a site from data.js is missing, duplicated,
     or has a changed id.
   - `status-vocabulary` - a status value outside `ok | warn | down`.
   - `field-drift` - a numeric or string field differs from data.js.
3. **Fix by rule, one class at a time.**
   - Missing row: copy the full record verbatim from data.js.
   - Vocabulary: restore the exact status value data.js has for that site.
     Never invent a mapping (`"online"` does not "mean" `"ok"`; the source
     value wins).
   - Field drift: restore the data.js value.
4. **Re-validate.** Run `node qa/check_migration.js` again. Repeat from
   step 2 if anything remains. Two clean passes in a row means done.
5. **Report.** A table: discrepancy, class, rule applied, before, after.
   Then the final validator output verbatim.

## Rules

- Batch the fixes, then validate. Do not validate after every single edit.
- If a discrepancy fits no class, stop and ask instead of improvising.
