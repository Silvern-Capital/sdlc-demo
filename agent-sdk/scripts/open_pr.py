#!/usr/bin/env python3
"""Push the feature branch and open a pull request, then record it in state.json.

Real run (needs GH_TOKEN and a git remote named origin in workspace/):
  GH_TOKEN=... python3 scripts/open_pr.py

Dry run (the default when either is missing, or when --dry-run is passed):
  python3 scripts/open_pr.py --dry-run

What it does:
  1. Reads pipeline/state.json for the branch, requirement, and test file.
  2. If GH_TOKEN is set and `git remote get-url origin` works in the
     workspace, runs `git push -u origin <branch>` and `gh pr create`.
     Otherwise it prints the commands it would have run.
  3. Writes the pr stage into pipeline/state.json: branch, number, url,
     state, and whether this was a dry run.

The push happens here, not in the agent. The PreToolUse hook in
governance.py denies `git push` to the agent on purpose; pushing is a step
a person (or this script run by a person) takes after Gate 1.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from pipeline_state import DONE, FAILED, SKIPPED, PipelineState  # noqa: E402

WORKSPACE = ROOT / "workspace"


def run(cmd: list[str], cwd: Path, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if check and result.returncode != 0:
        raise SystemExit(f"{' '.join(cmd)} failed:\n{result.stderr.strip()}")
    return result


def has_remote(workspace: Path) -> str | None:
    if not (workspace / ".git").exists():
        return None
    result = run(["git", "remote", "get-url", "origin"], workspace, check=False)
    return result.stdout.strip() or None


def gh_available() -> bool:
    try:
        return subprocess.run(["gh", "--version"], capture_output=True).returncode == 0
    except FileNotFoundError:
        return False


def pr_body(state: dict) -> str:
    req = state.get("requirement", {})
    changes = state.get("changes", {})
    gate1 = state.get("gate1", {})
    gate2 = state.get("gate2", {})
    hooks = state.get("hook_decisions", {})
    lines = [
        f"## {req.get('title', 'Requirement')}",
        "",
        f"Requirement-Id: {req.get('id', 'unknown')}",
        f"Audit-Run: {state.get('plan', {}).get('run_id', 'unknown')}",
        f"Tests: {', '.join(changes.get('test_files', [])) or 'none added'}",
        f"Hook decisions: {hooks.get('allowed', 0)} allowed, {hooks.get('denied', 0)} denied",
        f"Gate 1 (local human approval): {gate1.get('decision', 'not recorded')} by {gate1.get('by', 'unknown')}",
        "",
        "### Files touched",
        *[f"- `{f}`" for f in changes.get("files_touched", [])],
        "",
        "### Validation evidence",
        *[f"- {e.get('kind')}: `{e.get('summary')}` ({'pass' if e.get('passed') else 'fail'})" for e in gate2.get("evidence", [])],
        "",
        "Opened by scripts/open_pr.py. Branch protection requires CI and a human review before merge.",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Push the feature branch and open a pull request.")
    parser.add_argument("--dry-run", action="store_true", help="print the commands, do not push or open anything")
    parser.add_argument("--base", default="main", help="base branch for the pull request")
    parser.add_argument("--workspace", default=str(WORKSPACE), help="git repository to push from")
    args = parser.parse_args()
    workspace = Path(args.workspace)

    state = PipelineState()
    data = state.data
    branch = data.get("changes", {}).get("branch") or data.get("merge", {}).get("branch")
    req = data.get("requirement", {})
    if not branch:
        state.set("pr", SKIPPED, note="no branch in pipeline/state.json; run run_demo.py first")
        raise SystemExit("no branch recorded in pipeline/state.json. Run run_demo.py first.")

    title = req.get("title") or f"{req.get('id', 'change')}: agent implemented change"
    body = pr_body(data)

    remote = has_remote(workspace)
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    reasons = []
    if args.dry_run:
        reasons.append("--dry-run was passed")
    if not token:
        reasons.append("GH_TOKEN is not set")
    if not remote:
        reasons.append("workspace has no git remote named origin")
    if not reasons and not gh_available():
        reasons.append("the gh command line tool is not installed")

    push_cmd = ["git", "push", "-u", "origin", branch]
    create_cmd = ["gh", "pr", "create", "--base", args.base, "--head", branch, "--title", title, "--body", body]

    if reasons:
        note = "dry run: " + "; ".join(reasons)
        print(note)
        print("would run, in", workspace)
        print("  " + " ".join(push_cmd))
        print("  " + " ".join(create_cmd[:6]) + " --title ... --body ...")
        print()
        print("pull request body would be:")
        print(body)
        state.set("pr", DONE, branch=branch, base=args.base, number=None, url=None, state="dry-run",
                  dry_run=True, title=title, note=note)
        print()
        print(f"recorded a dry run pr stage in {state.path}")
        return 0

    print(f"pushing {branch} to {remote}")
    run(push_cmd, workspace)
    env = {**os.environ, "GH_TOKEN": token}
    result = subprocess.run(create_cmd, cwd=workspace, capture_output=True, text=True, env=env)
    if result.returncode != 0:
        state.set("pr", FAILED, branch=branch, base=args.base, dry_run=False, title=title,
                  note=result.stderr.strip()[:500])
        raise SystemExit(f"gh pr create failed:\n{result.stderr}")
    url = result.stdout.strip().splitlines()[-1]
    match = re.search(r"/pull/(\d+)", url)
    number = int(match.group(1)) if match else None
    state.set("pr", DONE, branch=branch, base=args.base, number=number, url=url, state="open",
              dry_run=False, title=title)
    print(f"opened {url}")
    print(f"recorded the pr stage in {state.path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
