# Beacon · Site Health

Static dashboard for monitoring Silvern Capital site fleet health — systems uptime, network status, open tickets, and uptime per location.

## Run

No build step. Open directly:

```bash
open index.html
```

or serve it:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Files

- `index.html` — dashboard UI + render logic (Chart.js sparklines via CDN)
- `data.js` — site dataset, exposed as `window.STORES`
- `assets/` — Silvern Capital brand marks

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

## CI

`.github/workflows/ci.yml` checks that `index.html` / `data.js` exist and that `data.js` parses and exposes a non-empty `window.STORES` array.

## Gated SDLC demo

This repo also shows a gated software delivery loop. An agent takes a requirement, writes code and a test, and opens a pull request. Hooks check every step. A person approves before anything merges. See `DEMO-SDLC.md` for the order to run things on a call.

Terms used here:

- Hook: a small program Claude Code runs at a fixed point in the agent's work. The hooks live in `hooks/` and are wired in `.claude/settings.json`.
- Gate: a check that must pass before the next step. Some gates are code (the hooks, CI). One gate is a person.
- Gate 1: the human approval on the pull request. The agent cannot merge. `git merge` and `gh pr merge` are denied by the hooks.
- CI triage: when CI fails, Claude reads the failed job log and posts the likely cause and a suggested fix as a PR comment. It does not change code.

What is in the repo:

- `hooks/policy.js` is the policy in one file. Edits may only land on the app, its tests, QA fixtures, assets, and docs. Workflows, settings, hooks, scripts, and package files are protected. Destructive git and shell commands are denied.
- `hooks/pre-tool-use.js` runs before every tool call and allows or denies it. `hooks/post-tool-use.js` records what came back and notices test runs. `hooks/stop.js` refuses to let the agent finish if app files changed and the tests did not run after the last edit. `hooks/user-prompt-submit.js` records the requirement.
- `audit/audit.jsonl` gets one line per tool call, decision, test run, and stop. `pipeline/state.json` is the current picture, stage by stage.
- `pipeline.html` renders both files. Open it next to `index.html` (there is a link in the header).
- `scripts/open_pr.js` commits, pushes a uniquely named branch, and opens a PR whose body lists the gates passed.
- `scripts/sync_pr.js` pulls CI, review, approval, and merge state from GitHub into the pipeline page.
- `.github/workflows/claude-code-review.yml` has Claude review every PR and post a comment starting with "Verdict:". Advice only.
- `.github/workflows/ci-triage.yml` runs when the `ci` workflow fails on a PR and posts the triage comment.
- `agent-sdk/` is the same idea through the Claude Agent SDK in Python. Self contained; see its README.

Run it:

```bash
npm run serve                      # http://localhost:8000 and http://localhost:8000/pipeline.html
node scripts/reset_pipeline.js     # fresh audit log and pipeline state
bash scripts/check_hooks.sh        # every hook with sample input; allow exits 0, deny exits 2
claude                             # in Claude Code: "Add a header tagline under the title"
node scripts/open_pr.js            # new branch, commit, push, gh pr create (add --dry-run to only print)
node scripts/sync_pr.js            # after CI, the Claude review, and the human approval
```

The `claude-code-review` and `ci-triage` workflows use the same `anthropics/claude-code-action@v1` and `ANTHROPIC_API_KEY` repo secret as the `qa-test-gap` job. `ci-triage` triggers from the default branch, so it starts working once this change is merged to main.
