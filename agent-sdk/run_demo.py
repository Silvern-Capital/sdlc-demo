#!/usr/bin/env python3
"""Gated agentic development demo, built on the Claude Agent SDK.

Flow, in one screen:

  1. Build a fresh workspace: copy the synthetic service into workspace/,
     make it a git repository, commit a baseline on main, branch for the
     requirement.
  2. Hand the requirement to an agent. In real mode that is Claude through
     the Agent SDK. In mock mode it is a canned transcript. Either way every
     tool call passes through the PreToolUse hook in governance.py.
  3. Run the test suite ourselves (the agent's word is not the record).
  4. Show the diff and the test result. Ask a human to type "approve".
  5. Approved: commit with the requirement id and merge into main.
     Not approved: commit on the branch and leave it for review.

Everything that happens is appended to audit/trail.jsonl. Run report.py
afterwards to see the trail as a table. The current picture of the run is
also written to pipeline/state.json, stage by stage, which is what the
pipeline page in the parent folder renders its own files.

Usage:
  python3 run_demo.py --mock          offline rehearsal, no API key needed
  python3 run_demo.py                 real agent if ANTHROPIC_API_KEY is set, else the mock agent
  python3 run_demo.py --no-fallback   real agent even without a key (uses a Claude Code login)
  python3 run_demo.py --req REQ-042   pick a requirement file from requirements/
  python3 run_demo.py --approve       answer the approval prompt with "approve" (for scripts and CI)
  python3 run_demo.py --reject        answer the approval prompt with "reject"
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

from agent.runner import pick_mode, run_agent
from governance import AuditTrail, make_pre_tool_use_hook
from pipeline_state import DONE, FAILED, PENDING, RUNNING, SKIPPED, PipelineState, hook_decisions_from_trail

ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT / "workspace"
TRAIL_PATH = ROOT / "audit" / "trail.jsonl"
COPIED = ("src", "tests", "requirements", "pytest.ini")

GIT_ENV = {
    **os.environ,
    "GIT_AUTHOR_NAME": "Demo Runner",
    "GIT_AUTHOR_EMAIL": "demo-runner@example.com",
    "GIT_COMMITTER_NAME": "Demo Runner",
    "GIT_COMMITTER_EMAIL": "demo-runner@example.com",
}


def git(*args: str, check: bool = True) -> str:
    result = subprocess.run(
        ["git", *args], cwd=WORKSPACE, env=GIT_ENV, capture_output=True, text=True
    )
    if check and result.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed:\n{result.stderr}")
    return result.stdout.strip()


def banner(text: str) -> None:
    print()
    print("=" * 72)
    print(text)
    print("=" * 72)


def prepare_workspace(req_id: str) -> str:
    """Fresh copy of the synthetic repo, as a git repo on a feature branch.

    workspace/ is scratch. It is deleted and rebuilt on every run, and it is
    recreated here if someone removed it by hand.
    """
    if WORKSPACE.exists():
        shutil.rmtree(WORKSPACE)
    WORKSPACE.mkdir(parents=True)
    for name in COPIED:
        source = ROOT / name
        if source.is_dir():
            shutil.copytree(source, WORKSPACE / name, ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache"))
        else:
            shutil.copy(source, WORKSPACE / name)
    (WORKSPACE / ".gitignore").write_text("__pycache__/\n.pytest_cache/\n", encoding="utf-8")
    git("init", "-q", "-b", "main")
    git("add", "-A")
    git("commit", "-q", "-m", "Baseline: synthetic telemetry ingest service")
    branch = f"feature/{req_id}"
    git("checkout", "-q", "-b", branch)
    return branch


def load_requirement(req_id: str) -> tuple[str, str]:
    path = ROOT / "requirements" / f"{req_id}.md"
    if not path.exists():
        raise SystemExit(f"no requirement file at {path}")
    text = path.read_text(encoding="utf-8")
    first_line = text.splitlines()[0].lstrip("# ").strip()
    return first_line, text


def build_prompt(req_id: str, req_text: str) -> str:
    return f"""You are implementing one requirement in a small Python service.

Working directory: the repository root. Source lives in src/telemetry/, tests in tests/.
Run tests with: python3 -m pytest -q

Rules you must follow:
- Only change files inside src/ and tests/. A hook will block anything else.
- Do not commit, merge, push, or delete anything. A human does that after review.
- Add a new test file under tests/ whose name contains {req_id}.
- Keep every existing test passing.
- When the tests pass, stop and summarize what you changed in three short sentences.

The requirement:

{req_text}
"""


def run_tests() -> tuple[bool, str]:
    result = subprocess.run(
        [sys.executable, "-m", "pytest"], cwd=WORKSPACE, capture_output=True, text=True
    )
    output = (result.stdout + result.stderr).strip()
    summary = "no output"
    for line in reversed(output.splitlines()):
        if re.search(r"\d+ (passed|failed|error)", line):
            summary = line.strip()
            break
    return result.returncode == 0, summary


def changed_files() -> list[str]:
    git("add", "-A")
    names = git("diff", "--cached", "--name-only")
    return [line for line in names.splitlines() if line]


def ask_for_approval(preset: str | None = None) -> tuple[bool, str]:
    print()
    print('Type "approve" to merge this change into main. Anything else leaves the branch for review.')
    if preset is not None:
        print(f"> {preset}   (answered by a command line flag)")
        answer = preset
    else:
        try:
            answer = input("> ").strip()
        except EOFError:
            answer = ""
            print("> (no input; treating as not approved)")
    return answer.lower() == "approve", answer


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--mock", action="store_true", help="replay a canned agent transcript; no API key, no network")
    parser.add_argument("--req", default="REQ-042", help="requirement id; reads requirements/<id>.md")
    parser.add_argument("--base-url", default=os.environ.get("ANTHROPIC_BASE_URL"),
                        help="ANTHROPIC_BASE_URL for real mode, for example a LiteLLM proxy (default: from the environment)")
    parser.add_argument("--no-fallback", action="store_true",
                        help="do not fall back to the mock agent when no credential is set (use a Claude Code login)")
    gate = parser.add_mutually_exclusive_group()
    gate.add_argument("--approve", action="store_true", help='answer the human gate with "approve" without prompting')
    gate.add_argument("--reject", action="store_true", help='answer the human gate with "reject" without prompting')
    args = parser.parse_args()
    preset = "approve" if args.approve else ("reject" if args.reject else None)
    started = time.monotonic()

    req_id = args.req
    if not re.fullmatch(r"[A-Z]+-\d+", req_id):
        raise SystemExit("requirement id must look like REQ-042")
    mode, why = pick_mode(args.mock, allow_fallback=not args.no_fallback)
    title, req_text = load_requirement(req_id)

    trail = AuditTrail(TRAIL_PATH, req_id, mode)
    trail.record("run_start", title=title)

    # pipeline/state.json is the dashboard's view. Start a fresh picture for
    # this run; the audit trail keeps every previous run.
    state = PipelineState().reset()
    state.set("requirement", DONE, id=req_id, title=title, file=f"requirements/{req_id}.md",
              text=req_text)
    state.set("plan", RUNNING, run_id=trail.run_id, mode=mode, started_at=trail_now())
    state.set("telemetry", RUNNING, run_id=trail.run_id, mode=mode)

    banner(f"Step 1  Fresh workspace for {req_id} ({mode} mode, run {trail.run_id})")
    print(f"mode:      {mode} ({why})")
    branch = prepare_workspace(req_id)
    print(f"workspace: {WORKSPACE}")
    print(f"branch:    {branch} (from main)")
    trail.record("workspace_ready", branch=branch)
    state.set("changes", RUNNING, branch=branch, base="main")

    banner(f"Step 2  Agent implements {req_id}. Every tool call goes through the PreToolUse hook.")
    print(f"requirement: {title}")
    if mode == "mock":
        from mock_agent import run_mock_agent
        hook = make_pre_tool_use_hook(trail, WORKSPACE, echo=print)
        agent_result = asyncio.run(run_mock_agent(hook, WORKSPACE, echo=print))
    else:
        agent_result = asyncio.run(run_agent(build_prompt(req_id, req_text), WORKSPACE, trail, args.base_url, echo=print))
    trail.record("agent_done")
    decisions = hook_decisions_from_trail(TRAIL_PATH, trail.run_id)
    allowed = sum(1 for d in decisions if d["decision"] == "allow")
    denied = sum(1 for d in decisions if d["decision"] == "deny")
    state.set("plan", FAILED if agent_result.is_error else DONE,
              finished_at=trail_now(), steps=agent_result.said, turns=agent_result.turns,
              tools_requested=agent_result.tools_requested,
              cost_usd=agent_result.cost_usd, subtype=agent_result.subtype)
    state.set("hook_decisions", FAILED if agent_result.is_error else DONE, decisions=decisions,
              allowed=allowed, denied=denied)

    banner("Step 3  Runner executes the test suite (the agent does not grade its own work)")
    passed, summary = run_tests()
    print(f"pytest: {summary}")
    trail.record("tests", tool="pytest", decision="pass" if passed else "fail", summary=summary)
    state.add_evidence("pytest (runner)", summary, passed=passed)
    state.set("gate2", RUNNING)

    banner("Step 4  Human review gate")
    files = changed_files()
    src_files = [f for f in files if f.startswith("src/")]
    test_files = [f for f in files if f.startswith("tests/")]
    other_files = [f for f in files if f not in src_files and f not in test_files]
    print("files changed:")
    for name in files:
        print(f"  {name}")
    if other_files:
        print("WARNING: files outside src/ and tests/ changed. The hook should have prevented this.")
    if not any(req_id.lower().replace("-", "_") in f.lower().replace("-", "_") for f in test_files):
        print(f"WARNING: no new or changed test file names {req_id}. The requirement asked for one.")
        trail.record("check", tool="runner", decision="warn", reason=f"no test file names {req_id}")
    print()
    print(git("diff", "--cached", "--stat"))
    print()
    print(git("diff", "--cached"))
    print()
    print(f"tests: {'PASS' if passed else 'FAIL'}  ({summary})")
    if not passed:
        print("Tests failed. Approval is still your call, but the default answer should be no.")

    state.set("changes", DONE, files_touched=files, src_files=src_files, test_files=test_files,
              outside_allowed_dirs=other_files, diffstat=git("diff", "--cached", "--stat"))

    approved, answer = ask_for_approval(preset)
    trail.record("approval", tool="human", decision="approve" if approved else "reject",
                 answer=answer, tests_passed=passed, src_files=src_files, test_files=test_files)
    state.set("gate1", DONE, decision="approve" if approved else "reject", by="human reviewer",
              at=trail_now(), answer=answer, tests_passed=passed)

    commit_message = (
        f"{req_id}: {title.split(':', 1)[-1].strip()}\n\n"
        f"Requirement-Id: {req_id}\n"
        f"Tests: {', '.join(test_files) or 'none added'}\n"
        f"Test-Result: {'pass' if passed else 'fail'}\n"
        f"Audit-Run: {trail.run_id}\n"
        f"Approved-By: {'human reviewer' if approved else 'not yet approved'}\n"
    )
    if not files:
        print("Nothing changed, so there is nothing to commit.")
        trail.record("merge", decision="skipped", reason="no changes")
        state.set("merge", SKIPPED, reason="no changes")
        finish_telemetry(state, trail, decisions, allowed, denied, agent_result, passed, started)
        return 0

    git("commit", "-q", "-m", commit_message)
    branch_sha = git("rev-parse", "--short", "HEAD")
    print()
    print(f"feature commit {branch_sha} on {branch}. Its message carries the trailers:")
    for line in git("log", "-1", "--format=%B").splitlines():
        print(f"  {line}")

    if approved:
        banner("Step 5  Approved: merging into main")
        git("checkout", "-q", "main")
        git("merge", "-q", "--no-ff", branch, "-m", f"Merge {branch}: {req_id} approved by human reviewer")
        merge_sha = git("rev-parse", "--short", "HEAD")
        print(git("log", "--oneline", "-3"))
        trail.record("merge", tool="git", decision="merged", branch=branch, branch_commit=branch_sha, merge_commit=merge_sha)
        state.set("merge", DONE, decision="merged", branch=branch, branch_commit=branch_sha, merge_commit=merge_sha)
        print(f"merged {branch} into main as {merge_sha}")
    else:
        banner("Step 5  Not approved: change stays on the branch for review")
        trail.record("merge", tool="git", decision="left_for_review", branch=branch, branch_commit=branch_sha)
        state.set("merge", SKIPPED, decision="left_for_review", branch=branch, branch_commit=branch_sha)
        print(f"committed on {branch} as {branch_sha}. main is unchanged.")
        print(f"to inspect: cd {WORKSPACE} && git log --oneline --all && git diff main {branch}")

    trailer = "; ".join(line for line in commit_message.splitlines()[2:] if line)
    state.add_evidence("trailer", trailer, passed=passed)
    state.set("gate2", DONE if passed else FAILED)
    finish_telemetry(state, trail, decisions, allowed, denied, agent_result, passed, started)

    print()
    print(f"audit trail:    {TRAIL_PATH}")
    print(f"pipeline state: {state.path}")
    print("next: python3 report.py            (the trail as a table)")
    print("      python3 report.py --all      (the trail as a table; the Node pipeline page in ../ reads its own files)")
    print("      python3 scripts/open_pr.py   (push the branch and open a PR; dry run without GH_TOKEN)")
    return 0


def trail_now() -> str:
    from pipeline_state import now_iso
    return now_iso()


def finish_telemetry(state, trail, decisions, allowed, denied, agent_result, tests_passed, started) -> None:
    """Counters for the run. Plain numbers the dashboard shows as tiles."""
    by_tool: dict[str, int] = {}
    for d in decisions:
        by_tool[d["tool"]] = by_tool.get(d["tool"], 0) + 1
    counters = {
        "tool_calls": len(decisions),
        "allowed": allowed,
        "denied": denied,
        "agent_turns": agent_result.turns or 0,
        "agent_messages": len(agent_result.said),
        "tests_passed": 1 if tests_passed else 0,
        "tests_failed": 0 if tests_passed else 1,
        "run_seconds": round(time.monotonic() - started, 2),
    }
    state.set("telemetry", DONE, counters=counters, by_tool=by_tool,
              cost_usd=agent_result.cost_usd, finished_at=trail_now())
    trail.record("telemetry", **counters)


if __name__ == "__main__":
    raise SystemExit(main())
