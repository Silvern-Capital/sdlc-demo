# Beacon · Site Health

Static dashboard for the Silvern Capital site fleet: uptime, network status,
open tickets per location. It is also the repo for the hands-on Claude Code
workshop "The agent builds it. The checks hold. You keep the merge."

## Quickstart

```bash
git clone https://github.com/Silvern-Capital/sdlc-demo.git
cd sdlc-demo
npm install            # Playwright for the browser suite; nothing else
npm run serve          # http://localhost:8000, API at /api/stores
node --test tests/*.test.js     # the node tests, no browser, under a second
claude                 # the hooks, skills and agents load automatically
```

No browser download is needed on your laptop. The node tests run in plain
Node; the Playwright browser suite runs on CI and, locally, drives the
Google Chrome you already have.

## Files

- `index.html` — dashboard UI and render logic (Chart.js sparklines via CDN)
- `data.js` — site dataset, exposed as `window.STORES`; the single source of truth
- `serve.js` — zero-dependency dev server and the `/api/stores` API
- `tests/*.test.js` — node:test files, run with `node --test tests/*.test.js`
- `tests/*.spec.js` — Playwright suite (API contract and browser e2e), run on CI
- `scripts/lint.js` — a small, deterministic linter (exit 0 when clean)

## What the workshop turns on

- `CLAUDE.md` — conventions and what done means. It asks; it cannot enforce.
- `.claude/hooks/test-changed.js` — PostToolUse: runs the node tests after every app edit.
- `.claude/hooks/stop-check.js` — Stop: runs the node tests plus lint before Claude may finish.
- `.claude/statusline.js` — prints model, estimated cost, context used and lines changed at the bottom of the terminal. Zero tokens.
- `.claude/skills/pr-ready` — everything before a pull request except code review: tests, coverage (Node's built-in), lint, scope of the diff, feature tried, PR description with the evidence pasted. Ends READY or NOT READY.
- `.claude/skills/autocover` — reads the coverage table, writes the missing node tests for uncovered app code as new files, re-runs, reports before and after. Never edits app code or existing tests.
- `.claude/skills/triage` — reproduce a failing check, quote the assertion, name the file and line, report cause, blast radius and the one-line fix. Does not fix.
- `.claude/agents/qa.md` — exploratory QA in a fresh context: tries the cases nobody wrote a test for and files findings with a repro, expected versus actual, and the test that would have caught each.
- `.claude/agents/tester.md`, `builder.md` — an agent team where the test and the code have different owners: the tester writes the failing test first and sends it to the builder; the builder changes only app code. Agent teams are experimental; `.claude/settings.json` enables them. Set `"teammateMode": "tmux"` there for split panes.
- `beacon-loop-plugin/` — all of the above packaged as a plugin. `/plugin marketplace add ./beacon-loop-plugin` then `/plugin install beacon-loop@beacon-loop`.
- `.github/workflows/` — `ci.yml` (node tests, lint, browser suite), `claude-review.yml` (AI review comment, advice only), `claude-triage.yml` (AI: explains a red run on a PR). The `claude-` prefix marks the AI checks; `ci` is plain scripts.

Prove the hooks can go red: `bash scripts/check_hooks.sh`.

Open the pull request for a change: `node scripts/open_pr.js` (add `--dry-run`
to only print). It commits on a fresh branch, pushes, and opens a PR whose body
carries the pasted test and lint runs. A person merges on GitHub.

Reset between runs: `bash scripts/reset_demo.sh` restores the baseline tarball
that lives next to the repo and removes anything a live run created. After a
deliberate change you want to keep, `bash scripts/reset_demo.sh --snapshot`.

## Data shape

Each site in `window.STORES`:

```js
{
  name: "Silvern Capital — New York",
  id: "1305",
  region: "US · Northeast",
  fillRate: 96.4,
  posStatus: "ok",        // "ok" | "warn" | "down"
  netStatus: "ok",        // "ok" | "warn" | "down"
  openTickets: 1,
  daysOfSupply: 18,
  runRate7d: [212, 198, 224, 207, 231, 188, 219]
}
```

## Review

`/code-review high` and `/security-review` are built into Claude Code. The deep
scan is a plugin from the official marketplace:

```text
/plugin install claude-security@claude-plugins-official
/claude-security scan my branch
```

It writes a `CLAUDE-SECURITY-<timestamp>/` folder with a findings report and
patch files; nothing is applied for you.
