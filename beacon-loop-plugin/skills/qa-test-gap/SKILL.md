---
name: qa-test-gap
description: Coverage/gap analysis — read index.html, data.js, and tests/, then list behaviors with no test, ranked by risk. Report only, no test writing.
---

# QA — test-gap analysis

1. Read `index.html` (render logic), `data.js` (data shape), and everything in `tests/`.
2. List behaviors that have NO test, e.g.:
   - rendering paths (KPI cards, pills, sparklines, ticket pill thresholds, `statusLabel` wording)
   - KPI math (open tickets sum, POS-down count, alert styling)
   - filter edge cases (no matches, case sensitivity, region match, clearing the input)
   - API edge cases not covered in `tests/api.spec.js`
3. Rank each gap by risk: **High** (wrong data shown to store ops), **Medium** (visual/state bug), **Low** (cosmetic).
4. Output a table: `| Risk | Behavior | Why untested matters |` — max 10 rows.
5. Report only. Do NOT write tests or modify code.
