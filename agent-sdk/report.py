#!/usr/bin/env python3
"""Print the audit trail as a table, then the requirement to merge chain.

Usage:
  python3 report.py             latest run
  python3 report.py --run ab12  one run by id
  python3 report.py --all       every run in the file
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

TRAIL_PATH = Path(__file__).resolve().parent / "audit" / "trail.jsonl"


def load_entries() -> list[dict]:
    if not TRAIL_PATH.exists():
        raise SystemExit(f"no trail at {TRAIL_PATH}. Run run_demo.py first.")
    entries = []
    for line in TRAIL_PATH.read_text(encoding="utf-8").splitlines():
        if line.strip():
            entries.append(json.loads(line))
    return entries


def detail_for(entry: dict) -> str:
    event = entry["event"]
    if event == "tool_call":
        return f"{entry.get('target', '')}  ({entry.get('reason', '')})"
    if event == "tests":
        return entry.get("summary", "")
    if event == "approval":
        return f"answer={entry.get('answer', '')!r} tests_passed={entry.get('tests_passed')}"
    if event == "merge":
        return " ".join(f"{k}={entry[k]}" for k in ("branch", "branch_commit", "merge_commit", "reason") if k in entry)
    if event == "run_start":
        return entry.get("title", "")
    if event == "workspace_ready":
        return f"branch={entry.get('branch', '')}"
    return ""


def print_table(entries: list[dict]) -> None:
    headers = ("time (UTC)", "requirement", "event", "tool", "decision", "detail")
    rows = []
    for entry in entries:
        rows.append((
            entry["ts"][11:19],
            entry["requirement_id"],
            entry["event"],
            entry.get("tool", ""),
            entry.get("decision", ""),
            detail_for(entry)[:70],
        ))
    widths = [max(len(str(r[i])) for r in [headers, *rows]) for i in range(len(headers))]
    line = "  ".join(h.ljust(w) for h, w in zip(headers, widths))
    print(line)
    print("-" * len(line))
    for row in rows:
        print("  ".join(str(c).ljust(w) for c, w in zip(row, widths)))


def print_chain(entries: list[dict]) -> None:
    req = entries[0]["requirement_id"]
    title = next((e.get("title") for e in entries if e["event"] == "run_start"), "")
    src_writes = sorted({e["target"] for e in entries
                         if e["event"] == "tool_call" and e["decision"] == "allow"
                         and e["tool"] in ("Write", "Edit", "MultiEdit") and e["target"].startswith("src/")})
    test_writes = sorted({e["target"] for e in entries
                          if e["event"] == "tool_call" and e["decision"] == "allow"
                          and e["tool"] in ("Write", "Edit", "MultiEdit") and e["target"].startswith("tests/")})
    denied = [e for e in entries if e["event"] == "tool_call" and e["decision"] == "deny"]
    tests = next((e for e in entries if e["event"] == "tests"), None)
    approval = next((e for e in entries if e["event"] == "approval"), None)
    merge = next((e for e in entries if e["event"] == "merge"), None)

    print()
    print(f"Traceability chain for {req}")
    print(f"  requirement : {title}")
    print(f"  code        : {', '.join(src_writes) or 'no source files written'}")
    print(f"  tests       : {', '.join(test_writes) or 'no test files written'}")
    if tests:
        print(f"  test result : {tests['decision']}  ({tests.get('summary', '')})")
    print(f"  blocked     : {len(denied)} tool call(s) denied by policy")
    for e in denied:
        print(f"                {e['tool']} {e['target']}  ({e['reason']})")
    if approval:
        print(f"  approval    : {approval['decision']} by {approval.get('tool', 'human')} at {approval['ts']}")
    if merge:
        where = merge.get("merge_commit") or merge.get("branch_commit") or ""
        print(f"  outcome     : {merge['decision']} {where}".rstrip())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run", help="run id to show")
    parser.add_argument("--all", action="store_true", help="show every run")
    args = parser.parse_args()

    entries = load_entries()
    if not entries:
        raise SystemExit("trail is empty")

    if args.all:
        run_ids = list(dict.fromkeys(e["run_id"] for e in entries))
    elif args.run:
        run_ids = [args.run]
    else:
        run_ids = [entries[-1]["run_id"]]

    for run_id in run_ids:
        chosen = [e for e in entries if e["run_id"] == run_id]
        if not chosen:
            raise SystemExit(f"no run with id {run_id}")
        print(f"Run {run_id}  ({chosen[0]['mode']} mode, {chosen[0]['ts']})")
        print_table(chosen)
        print_chain(chosen)
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
