# QA Agent Demo — Runbook

One-time setup:

```bash
npm install
```

(Local runs drive your installed Google Chrome — no browser download. CI installs playwright chromium itself.)

Optional (shows the packaged-plugin form of the same agents/skills):

```bash
claude plugin marketplace add ./qa-agent-plugin
```

Run the demo steps in order.

## 1. `/qa-api` — API contract QA *(use case: API QA skill)*

In Claude Code:

```
/qa-api
```

Runs `tests/api.spec.js` against `serve.js` (started automatically on :8000), validates the README "Data shape" contract, reports PASS, stops.

## 2. Break it live — `/qa-e2e` catches a one-line defect *(use case: e2e QA skill)*

Edit `data.js` — change Austin's posStatus:

```js
// break it:
posStatus: "offline",   // was "down"  (Silvern Capital — Austin, id 2211)
```

Then:

```
/qa-e2e
```

A visible Chrome window opens and Playwright drives the dashboard for ~10 seconds (slow-motion via `npm run test:e2e:headed`). The pill test fails: `"offline"` is not in the `ok|warn|down` vocabulary and the pill no longer matches `data.js`. The skill reports the failing assertion and stops — no retry, no auto-fix.

**Revert** (must be back to green before continuing):

```js
posStatus: "down",
```

Re-run `/qa-e2e` → PASS.

## 3. CI — same Playwright suite, headless in GitHub Actions *(use case: QA in CI)*

```bash
git push
```

The `e2e` job in `.github/workflows/ci.yml` runs the identical suite headless on ubuntu-latest and uploads `playwright-report/` as an artifact on failure. (The original `sanity` job is unchanged.)

On pull requests, a third job — `qa-test-gap` — runs Claude in CI: it executes the qa-test-gap skill against the PR and posts the coverage-gap table as a PR comment. Requires the `ANTHROPIC_API_KEY` repo secret.

## 4. `/qa-migration` — data QA, no repo/browser in the path *(use case: data QA skill)*

```
/qa-migration
```

Validates `qa/data_migrated.json` against `data.js` and reports **exactly 3 seeded discrepancies**, each with the check that proves it:

1. `[row-count/id-integrity]` — Silvern Capital — Seattle (id 3108) missing
2. `[status-vocabulary]` — Silvern Capital — Miami netStatus `"online"`
3. `[field-drift]` — Silvern Capital — Chicago fillRate 91.2 → 89.7

## 5. QA orchestrator — fleet of subagents *(use case: parallel QA agents)*

In Claude Code:

```
Use the qa-orchestrator agent to run a full QA sweep.
```

It fans out three `qa-engineer` subagents in parallel (api, e2e, migration) and aggregates one QA report.

## 6. Claude in Chrome — visual QA *(use case: browser-driving QA)*

```bash
npm run serve
```

Then in Claude Code (with the Chrome extension connected):

```
Open http://localhost:8000 in Chrome and inspect the Silvern Capital — Austin card —
do the status pills match what data.js says?
```

Bonus: `/qa-test-gap` — coverage/gap analysis, ranked by risk, report-only.

## Cheat sheet

| Step | Command | Proves |
|------|---------|--------|
| 1 | `/qa-api` | API contract QA |
| 2 | edit data.js → `/qa-e2e` → revert | e2e catches real defects |
| 3 | `git push` | same suite headless in CI |
| 4 | `/qa-migration` | data QA without the app |
| 5 | qa-orchestrator | parallel QA subagent fleet |
| 6 | Claude in Chrome | interactive visual QA |

_Last demo dry-run: 2026-07-08_
