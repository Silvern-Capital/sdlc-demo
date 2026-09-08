---
name: fix-lint
description: Run scripts/lint.js and fix every warning in one batch without changing behavior, then prove it with lint + Playwright.
---

Run `node scripts/lint.js`.

If it reports warnings, fix ALL of them in one batch:

- Fix the code, never the linter (scripts/lint.js is protected anyway).
- Do not change behavior. A loose equality becomes strict equality with the
  same operands; a leftover console.log is deleted; a TODO is either resolved
  in one line or removed if the code already handles it.
- After the batch, re-run `node scripts/lint.js` and then
  `npx playwright test` to prove nothing broke.

Stop when lint reports 0 warnings and the tests pass. Report one line per fix.
