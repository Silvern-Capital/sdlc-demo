"""One JSON file that tracks a change from requirement to merge.

pipeline/state.json is the single place the dashboard reads. Every stage of
the flow writes its part here:

  requirement     run_demo.py, at the start of a run
  plan            run_demo.py, what the agent said it would do and did
  changes         run_demo.py, the branch and the files the agent touched
  hook_decisions  run_demo.py, copied from the audit trail (allow and deny)
  pr              scripts/open_pr.py, after `gh pr create` (or a dry run)
  ci              scripts/record_ci.py, from the CI workflow
  review          scripts/record_ci.py, from the code review workflow
  gate1           run_demo.py, the human "approve" answer
  merge           run_demo.py, the local merge (or "left for review")
  gate2           run_demo.py and scripts/record_ci.py, validation evidence
  telemetry       run_demo.py, counters for the run

The file is plain JSON so it can be committed, diffed, and read by other
tools. The audit trail (audit/trail.jsonl) stays the append only record of
every event; this file is the current picture.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATE_PATH = ROOT / "pipeline" / "state.json"

STAGES = (
    "requirement",
    "plan",
    "changes",
    "hook_decisions",
    "pr",
    "ci",
    "review",
    "gate1",
    "merge",
    "gate2",
    "telemetry",
)

# Status words the dashboard understands. Keep them few.
PENDING = "pending"
RUNNING = "running"
DONE = "done"
FAILED = "failed"
SKIPPED = "skipped"
STATUSES = (PENDING, RUNNING, DONE, FAILED, SKIPPED)

# Stage names that older versions of this file used. load() renames them.
RENAMED = {"agent": "plan", "hooks": "hook_decisions"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def empty_state() -> dict:
    state = {"schema": 2, "updated_at": now_iso()}
    for stage in STAGES:
        state[stage] = {"status": PENDING}
    state["hook_decisions"]["decisions"] = []
    state["gate2"]["evidence"] = []
    state["telemetry"]["counters"] = {}
    return state


def normalize(data: dict) -> dict:
    """Bring a loaded state up to the current shape without losing fields."""
    for old, new in RENAMED.items():
        if old in data and new not in data:
            data[new] = data.pop(old)
    for stage in STAGES:
        section = data.setdefault(stage, {"status": PENDING})
        if not isinstance(section, dict):
            data[stage] = {"status": PENDING}
        elif section.get("status") not in STATUSES:
            section["status"] = PENDING
    data["hook_decisions"].setdefault("decisions", [])
    data["gate2"].setdefault("evidence", [])
    data["telemetry"].setdefault("counters", {})
    data["schema"] = 2
    return data


class PipelineState:
    """Read, update, and write pipeline/state.json."""

    def __init__(self, path: Path = STATE_PATH) -> None:
        self.path = path
        self.data = self.load(path)

    @staticmethod
    def load(path: Path) -> dict:
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(data, dict) and data.get("schema") in (1, 2):
                    return normalize(data)
            except json.JSONDecodeError:
                pass
        return empty_state()

    def reset(self) -> "PipelineState":
        self.data = empty_state()
        return self

    def set(self, stage: str, status: str | None = None, **fields) -> dict:
        if stage not in STAGES:
            raise KeyError(f"unknown stage {stage!r}; expected one of {STAGES}")
        if status is not None and status not in STATUSES:
            raise ValueError(f"unknown status {status!r}; expected one of {STATUSES}")
        section = self.data[stage]
        if status is not None:
            section["status"] = status
        section.update(fields)
        section["updated_at"] = now_iso()
        self.save()
        return section

    def add_evidence(self, kind: str, summary: str, **fields) -> None:
        item = {"kind": kind, "summary": summary, "at": now_iso()}
        item.update(fields)
        self.data["gate2"]["evidence"].append(item)
        self.save()

    def bump(self, counter: str, by: int = 1) -> None:
        counters = self.data["telemetry"]["counters"]
        counters[counter] = counters.get(counter, 0) + by
        self.save()

    def save(self) -> None:
        self.data["updated_at"] = now_iso()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, indent=2) + "\n", encoding="utf-8")


def hook_decisions_from_trail(trail_path: Path, run_id: str) -> list[dict]:
    """Pull the tool_call events for one run out of audit/trail.jsonl."""
    if not trail_path.exists():
        return []
    decisions = []
    for line in trail_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        entry = json.loads(line)
        if entry.get("run_id") != run_id or entry.get("event") != "tool_call":
            continue
        decisions.append({
            "ts": entry.get("ts"),
            "tool": entry.get("tool"),
            "target": entry.get("target"),
            "decision": entry.get("decision"),
            "reason": entry.get("reason"),
        })
    return decisions
