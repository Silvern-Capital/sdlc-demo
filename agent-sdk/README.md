# Agent SDK variant (Python)

This folder is the same gated SDLC idea, run through the Claude Agent SDK
instead of Claude Code. It is self contained. It does not touch the
dashboard, the Node tests, or the hooks in the parent folder, and nothing in
the parent folder depends on it. Skip it if the call only needs the Claude
Code flow.

What it shows: an agent implements a written requirement in a small Python
service, with the same three hooks (PreToolUse, PostToolUse, Stop) attached
in code through the SDK rather than through .claude/settings.json. The
policy is in governance.py and reads the same way as ../hooks/policy.js.

Everything here is synthetic. The service, the data, and the requirement are
made up for the demo.

## Run

    cd agent-sdk
    python3 -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    python3 -m pytest                  # 7 passed
    python3 run_demo.py --mock --approve   # no model call, whole flow in a few seconds
    python3 report.py --all            # the audit trail as a table

Python 3.10 or newer and git are required. run_demo.py builds a scratch git
repository in workspace/ on every run and rebuilds it each time.

Real mode (Claude through the SDK):

    export ANTHROPIC_API_KEY=...
    python3 run_demo.py

Type "approve" when asked. That prompt is Gate 1 in this variant.
`run_demo.py --reject` shows the other ending: the branch is left for
review and main is untouched.

## Files

| Path | What it is |
|---|---|
| run_demo.py | The runner: workspace, agent, tests, Gate 1, merge. Writes audit/trail.jsonl and pipeline/state.json inside this folder. |
| governance.py | The policy (decide), the audit trail, and the three hooks. |
| agent/runner.py | Real mode through claude_agent_sdk.query() with the hooks attached. Falls back to mock mode when no credential is set. |
| mock_agent.py | A canned transcript that goes through the same hooks and really edits the workspace. Includes two calls the policy denies on purpose. |
| pipeline_state.py, report.py | State file helpers and the trail printer. |
| scripts/open_pr.py, scripts/record_ci.py | The Python versions of the PR and CI recording scripts. The Node versions in ../scripts are what the main demo uses. |
| requirements/REQ-042.md | The requirement the agent implements. |
| src/telemetry/, tests/ | The synthetic service and its 7 tests. |
| docs/ | two-layers.md (hooks versus GitHub controls, in plain words) and github-setup.md (gh api commands for branch protection and a required reviewer). |

## Words used here

- Tool call: one action the agent takes (read a file, edit a file, run a command).
- Hook: a function the SDK calls at a fixed point. PreToolUse can deny a call. PostToolUse observes. Stop runs when the agent ends its turn.
- Gate 1: the human approval. Here it is a person typing "approve"; on GitHub it is the required approving review.
