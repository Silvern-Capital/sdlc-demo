---
name: qa-api
description: Run the API contract tests against the stores API (serve.js), validate the documented schema, report and stop.
---

# QA — API contract

1. Run:
   ```bash
   npx playwright test tests/api.spec.js
   ```
   (the webServer config starts `node serve.js` on :8000 if it isn't already running)
2. Optionally spot-check by hand: `curl -s http://localhost:8000/api/stores | head`.
3. The contract under test (README "Data shape"): field names + types, posStatus/netStatus in `ok|warn|down`, `runRate7d` length 7, unique ids.
4. Report:
   - **PASS**: number of tests passed.
   - **FAIL**: the failing assertion and the offending request/response, quoted from the output.
5. STOP. One run, no retries, no fixes.
