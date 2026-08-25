#!/usr/bin/env python3
"""Write CI and review results back into pipeline/state.json.

Called from a GitHub Actions step (see docs/github-setup.md), or by hand.
It reads what it can from the GitHub Actions environment and takes the rest
from flags. It never calls the GitHub API; the workflow passes in the facts.

Record a CI result:
  python3 scripts/record_ci.py ci --check "pytest" --conclusion success \\
      --detail "10 passed" --run-url "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"

Record an automated review verdict:
  python3 scripts/record_ci.py review --verdict "looks good" --comments 2 \\
      --summary "No issues found in src/ or tests/." --url "<pr url>"

Record the pull request state (used when the workflow knows it):
  python3 scripts/record_ci.py pr --number 12 --url https://github.com/org/repo/pull/12 --state open

Record the merge on GitHub (from a workflow that runs on push to main):
  python3 scripts/record_ci.py merge --merged-by octocat --merge-commit abc1234

Each call also appends a line to the gate2 evidence list so the dashboard
shows where the proof came from. Pass --state-file to write somewhere
other than pipeline/state.json (for example an artifact path in CI).
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from pipeline_state import DONE, FAILED, PipelineState, STATE_PATH  # noqa: E402

CONCLUSIONS = ("success", "failure", "cancelled", "skipped", "neutral", "timed_out", "unknown")


def run_url_from_env() -> str | None:
    server = os.environ.get("GITHUB_SERVER_URL")
    repo = os.environ.get("GITHUB_REPOSITORY")
    run_id = os.environ.get("GITHUB_RUN_ID")
    if server and repo and run_id:
        return f"{server}/{repo}/actions/runs/{run_id}"
    return None


def record_ci(state: PipelineState, args) -> None:
    section = state.data["ci"]
    checks = [c for c in section.get("checks", []) if c.get("name") != args.check]
    checks.append({
        "name": args.check,
        "conclusion": args.conclusion,
        "detail": args.detail,
        "url": args.url or run_url_from_env(),
        "sha": args.sha or os.environ.get("GITHUB_SHA"),
    })
    failed = any(c["conclusion"] in ("failure", "timed_out", "cancelled") for c in checks)
    state.set("ci", FAILED if failed else DONE, checks=checks,
              run_url=args.run_url or run_url_from_env(),
              workflow=args.workflow or os.environ.get("GITHUB_WORKFLOW"))
    state.add_evidence(f"ci: {args.check}", args.detail or args.conclusion,
                       passed=args.conclusion == "success", url=args.url or run_url_from_env())
    print(f"ci: {args.check} = {args.conclusion}")


def record_review(state: PipelineState, args) -> None:
    negative = args.verdict.lower() in ("changes requested", "fail", "request changes")
    state.set("review", FAILED if negative else DONE, verdict=args.verdict,
              reviewer=args.reviewer, comments=args.comments, summary=args.summary, url=args.url)
    state.add_evidence("automated review", args.verdict, passed=not negative, url=args.url)
    print(f"review: {args.verdict} ({args.reviewer})")


def record_pr(state: PipelineState, args) -> None:
    pr = state.data["pr"]
    state.set("pr", DONE, number=args.number or pr.get("number"), url=args.url or pr.get("url"),
              state=args.state, dry_run=False,
              branch=args.branch or pr.get("branch") or os.environ.get("GITHUB_HEAD_REF"))
    print(f"pr: #{args.number} {args.state}")


def record_merge(state: PipelineState, args) -> None:
    state.set("merge", DONE, decision="merged on github", merged_by=args.merged_by,
              merge_commit=args.merge_commit or os.environ.get("GITHUB_SHA"))
    state.add_evidence("merge", f"merged by {args.merged_by}", passed=True)
    print(f"merge: by {args.merged_by}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Record CI, review, PR, or merge facts in pipeline/state.json.")
    parser.add_argument("--state-file", default=str(STATE_PATH), help="path to the state file to update")
    sub = parser.add_subparsers(dest="kind", required=True)

    ci = sub.add_parser("ci", help="record one CI check")
    ci.add_argument("--check", required=True, help="check name, for example pytest")
    ci.add_argument("--conclusion", required=True, choices=CONCLUSIONS)
    ci.add_argument("--detail", default="", help="one line, for example '10 passed in 0.01s'")
    ci.add_argument("--url", help="link to the check or job log")
    ci.add_argument("--run-url", help="link to the workflow run (default: from GITHUB_* env)")
    ci.add_argument("--workflow", help="workflow name (default: GITHUB_WORKFLOW)")
    ci.add_argument("--sha", help="commit the check ran on (default: GITHUB_SHA)")

    review = sub.add_parser("review", help="record the automated review verdict")
    review.add_argument("--verdict", required=True, help="for example 'looks good' or 'changes requested'")
    review.add_argument("--reviewer", default="claude-code-action")
    review.add_argument("--comments", type=int, default=None, help="number of review comments left")
    review.add_argument("--summary", default="")
    review.add_argument("--url", help="link to the pull request or review")

    pr = sub.add_parser("pr", help="record the pull request state")
    pr.add_argument("--number", type=int)
    pr.add_argument("--url")
    pr.add_argument("--state", default="open", help="open, merged, or closed")
    pr.add_argument("--branch")

    merge = sub.add_parser("merge", help="record a merge that happened on GitHub")
    merge.add_argument("--merged-by", required=True)
    merge.add_argument("--merge-commit")

    args = parser.parse_args()
    state = PipelineState(Path(args.state_file))
    {"ci": record_ci, "review": record_review, "pr": record_pr, "merge": record_merge}[args.kind](state, args)
    print(f"wrote {state.path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
