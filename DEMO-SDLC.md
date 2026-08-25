# Gated SDLC Demo (Create Loop + Validate Loop) · Runbook

What the audience sees: a requirement goes in, an agent writes code and a test, hooks check every step, a pull request opens, CI and a Claude review run, and a person approves before the merge. Every step is recorded.

Two words up front. A hook is a small program Claude Code runs at a fixed point in the agent's work. A gate is a check that must pass before the next step. Gate 1 is the human approval on the pull request.

One-time setup:

```bash
npm install
gh auth status            # signed in to the GitHub org that holds this repo
```

The repo needs the `ANTHROPIC_API_KEY` secret for the `claude-code-review`, `ci-triage`, and `qa-test-gap` jobs. The `ci-triage` workflow only starts once it is on the default branch, so merge this change to main before the call.

Before the call:

```bash
node scripts/reset_pipeline.js     # fresh audit log and pipeline state
npm run serve                      # leave it running
```

Open two tabs: http://localhost:8000 (the dashboard) and http://localhost:8000/pipeline.html (the pipeline page). The pipeline page refreshes itself every 3 seconds.

Run the demo steps in order.

## 1. Show the policy *(use case: hooks as code)*

Open `hooks/policy.js`. Two rules, both readable on screen: which paths the agent may edit, and which shell commands are denied. Then:

```bash
bash scripts/check_hooks.sh
```

Every hook runs with sample input. Allowed calls exit 0, denied calls exit 2, and the script prints one line per case. Point at the `git push origin main`, `gh pr merge`, and `rm -rf` lines: those are the Gate 1 protections.

## 2. Create Loop: requirement to code and tests *(use case: agent hooks)*

In Claude Code:

```
Add a short tagline under the dashboard title that reads "Fleet health at a glance". Add a Playwright test in tests/ that checks it renders.
```

Watch the pipeline page while the agent works. Stage 1 (requirement) fills from the prompt. Stage 3 (code + tests) lists the files as they are edited. Stage 5 (hooks / gates) counts every allow and deny. The audit table at the bottom shows each tool call.

If the agent tries to finish without running the tests, the Stop hook sends it back with "run the tests before finishing". Stage 4 turns green when `npx playwright test` has run.

Optional live deny. Ask:

```
Also update .github/workflows/ci.yml to add a lint job.
```

The edit is denied by the PreToolUse hook with the reason on screen. The agent reports it and moves on. Workflow files are protected; a person changes those.

## 3. Open the pull request *(use case: agent-opened PR)*

```bash
node scripts/open_pr.js
```

It creates a uniquely named branch (`agent/<slug>-<timestamp>`), commits with `Requirement-Id` and `Tests` trailers, pushes, and runs `gh pr create`. The PR body lists the gates already passed (hooks, tests, audit log) and the ones still open (CI, Claude review, Gate 1). Stage 6 shows the PR link.

If there is no remote or no `gh`, add `--dry-run` and it prints the commands and the body instead.

## 4. Validate Loop: CI, Claude review, CI triage *(use case: CI with Claude)*

On GitHub, open the PR. Three things happen on their own:

- The `ci` workflow runs `sanity` (data.js parse check), `e2e` (npm install, Playwright headless), and `qa-test-gap` (the coverage table as a PR comment).
- The `claude-code-review` workflow has Claude read `REVIEW.md` and the diff, leave line comments, and post a summary that starts with "Verdict: looks good" or "Verdict: changes requested". It never approves.
- If `ci` fails, the `ci-triage` workflow reads the failed job log and posts a comment that starts with "CI triage (automated)": likely cause, failing test, suggested fix.

To show triage on purpose, break a test before step 3 (for example change one expected string in `tests/e2e.spec.js`) and push. The `e2e` job fails, and the triage comment names the assertion.

Pull the results into the pipeline page:

```bash
node scripts/sync_pr.js
```

Stages 7 (CI) and 8 (Claude review) update.

## 5. Gate 1: a person approves and merges *(use case: human approval kept)*

On GitHub, approve the PR and merge it. Then:

```bash
node scripts/sync_pr.js
```

Stages 9 (Gate 1) and 10 (merge) turn green with the approver's name. Say it out loud: the agent could not do this step. The hooks deny `git merge` and `gh pr merge`, and branch protection requires the review.

## 6. Optional: the same loop through the Agent SDK *(use case: SDK variant)*

```bash
cd agent-sdk
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 -m pytest                     # 7 passed
python3 run_demo.py --mock --approve  # whole flow in a few seconds, no model call
```

Same three hooks, attached in code through the SDK instead of `.claude/settings.json`. The mock transcript includes two calls the policy denies, so the audience sees a deny without waiting on a model. `python3 report.py --all` prints the audit trail as a table.

## Reset between runs

```bash
git checkout main
node scripts/reset_pipeline.js
```

Each run creates a new branch, so old PRs can stay open.

## Cheat sheet

| Step | Command | Proves |
|------|---------|--------|
| 1 | `bash scripts/check_hooks.sh` | policy is code, deny exits 2 |
| 2 | feature request in Claude Code | hooks gate every edit and command; tests required before stop |
| 3 | `node scripts/open_pr.js` | agent-opened PR with gates in the body |
| 4 | push, watch Actions, `node scripts/sync_pr.js` | CI, Claude review, CI triage |
| 5 | approve on GitHub, `node scripts/sync_pr.js` | Gate 1 stays human |
| 6 | `python3 run_demo.py --mock --approve` | same gates through the Agent SDK |

_Dry run: 2026-08-23 (hooks, scripts, and pages checked locally; workflows checked for valid YAML, not yet run on GitHub)_
