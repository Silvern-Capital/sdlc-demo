---
name: qa-e2e
description: Run the Playwright e2e suite headless against the dashboard, report pass/fail with the failing assertion, then stop.
---

# QA — e2e (Playwright, headless)

1. Run:
   ```bash
   npm run test:e2e:headed
   ```
   — a VISIBLE Chrome window opens and the audience watches Playwright drive the
   dashboard for ~10–15 seconds (slowed via SLOWMO). The webServer starts
   `node serve.js` on :8000 automatically.

   For a fast silent run (what CI does) use `npx playwright test tests/e2e.spec.js` instead.
2. Parse the output.
3. Report:
   - **PASS**: number of tests passed.
   - **FAIL**: each failing test name + the failing assertion (expected vs received), quoted from the output.
4. STOP. Do not retry, do not fix code, do not re-run.
