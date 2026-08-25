"""A canned agent transcript for offline rehearsal.

Mock mode does not call any model and needs no network. It replays a fixed
list of tool calls through the very same PreToolUse hook that real mode
uses, then actually performs the allowed ones (writes the files, runs the
command). So the diff, the tests, the gate decisions, and the audit trail
you see in mock mode are produced by the same code path as in real mode.
The only thing that is canned is the agent's choices.
"""

from __future__ import annotations

import asyncio
import subprocess
from pathlib import Path

NEW_VALIDATION = '''    if not 0.0 <= sample.fuel_pct <= 100.0:
        raise ValidationError(f"fuel_pct out of range: {sample.fuel_pct}")
    if sample.timestamp - now > MAX_FUTURE_SKEW:
        raise ValidationError(
            f"timestamp is more than 24 hours in the future: {sample.timestamp.isoformat()}"
        )
'''

OLD_VALIDATION = '''    if not 0.0 <= sample.fuel_pct <= 100.0:
        raise ValidationError(f"fuel_pct out of range: {sample.fuel_pct}")
'''

NEW_TEST_FILE = '''"""Tests for REQ-042: reject samples timestamped more than 24 hours ahead."""

from datetime import datetime, timedelta, timezone

import pytest

from telemetry import IngestService, ValidationError, parse_sample, validate_sample

NOW = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)


def sample_at(offset: timedelta) -> dict:
    return {
        "vehicle_id": "VIN-DEMO-0002",
        "timestamp": (NOW + offset).isoformat(),
        "speed_kph": 50.0,
        "fuel_pct": 60.0,
    }


def test_req_042_rejects_25_hours_in_the_future():
    sample = parse_sample(sample_at(timedelta(hours=25)))
    with pytest.raises(ValidationError, match="future"):
        validate_sample(sample, now=NOW)


def test_req_042_accepts_23_hours_in_the_future():
    sample = parse_sample(sample_at(timedelta(hours=23)))
    validate_sample(sample, now=NOW)


def test_req_042_service_does_not_store_rejected_sample():
    service = IngestService(now=NOW)
    assert service.submit(sample_at(timedelta(hours=30))) is False
    assert service.accepted == []
    assert "future" in service.rejected[0][1]
'''

# The canned transcript. Each step is (what the agent says, tool name, tool input).
# Two steps are deliberately against policy so the audience sees a deny.
TRANSCRIPT = [
    ("Let me read the requirement first.",
     "Read", {"file_path": "requirements/REQ-042.md"}),
    ("Now the module I need to change and its existing tests.",
     "Read", {"file_path": "src/telemetry/ingest.py"}),
    ("", "Read", {"file_path": "tests/test_ingest.py"}),
    ("I will add a constant for the 24 hour limit and one more check in validate_sample().",
     "Edit", {"file_path": "src/telemetry/ingest.py",
              "old_string": "MAX_SPEED_KPH = 400.0\n",
              "new_string": "MAX_SPEED_KPH = 400.0\nMAX_FUTURE_SKEW = timedelta(hours=24)\n"}),
    ("", "Edit", {"file_path": "src/telemetry/ingest.py",
                  "old_string": "from datetime import datetime, timezone\n",
                  "new_string": "from datetime import datetime, timedelta, timezone\n"}),
    ("", "Edit", {"file_path": "src/telemetry/ingest.py",
                  "old_string": OLD_VALIDATION, "new_string": NEW_VALIDATION}),
    ("Adding a test file that names REQ-042 and covers the acceptance criteria.",
     "Write", {"file_path": "tests/test_req_042_future_timestamp.py", "content": NEW_TEST_FILE}),
    ("I would also like to note the change in the deployment config.",
     "Write", {"file_path": "deploy/config.yaml", "content": "max_future_skew_hours: 24\n"}),
    ("Running the full test suite.",
     "Bash", {"command": "python3 -m pytest"}),
    ("Tests pass. Pushing the branch so it can be merged.",
     "Bash", {"command": "git push origin HEAD"}),
    ("Understood, pushing is not mine to do. The change is ready for human review.",
     None, None),
]


def _perform(tool_name: str, tool_input: dict, workspace: Path) -> str:
    """Carry out an allowed tool call in the simplest possible way."""
    if tool_name == "Read":
        return (workspace / tool_input["file_path"]).read_text(encoding="utf-8")[:80]
    if tool_name == "Write":
        target = workspace / tool_input["file_path"]
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(tool_input["content"], encoding="utf-8")
        return f"wrote {len(tool_input['content'])} bytes"
    if tool_name == "Edit":
        target = workspace / tool_input["file_path"]
        text = target.read_text(encoding="utf-8")
        if text.count(tool_input["old_string"]) != 1:
            raise RuntimeError(f"old_string not found exactly once in {target}")
        target.write_text(text.replace(tool_input["old_string"], tool_input["new_string"]), encoding="utf-8")
        return "edited"
    if tool_name == "Bash":
        result = subprocess.run(
            tool_input["command"], shell=True, cwd=workspace, capture_output=True, text=True
        )
        lines = (result.stdout + result.stderr).strip().splitlines()
        return lines[-1] if lines else ""
    raise RuntimeError(f"mock cannot perform {tool_name}")


async def run_mock_agent(pre_tool_use_hook, workspace: Path, echo=print):
    """Replay TRANSCRIPT through the real hook. Perform what the hook allows.

    Returns an agent.runner.AgentResult so run_demo.py can treat mock and
    real mode the same way when it writes pipeline/state.json.
    """
    from agent.runner import AgentResult

    result = AgentResult(mode="mock")
    for index, (say, tool_name, tool_input) in enumerate(TRANSCRIPT, start=1):
        if say:
            result.said.append(say)
            echo(f"agent: {say}")
        if tool_name is None:
            continue
        result.tools_requested.append(tool_name)
        await asyncio.sleep(0.15)  # a small pause so the audience can follow
        hook_input = {
            "hook_event_name": "PreToolUse",
            "tool_name": tool_name,
            "tool_input": tool_input,
            "tool_use_id": f"mock-{index:02d}",
            "session_id": "mock",
            "transcript_path": "",
            "cwd": str(workspace),
        }
        output = await pre_tool_use_hook(hook_input, hook_input["tool_use_id"], {"signal": None})
        denied = bool(output) and output.get("hookSpecificOutput", {}).get("permissionDecision") == "deny"
        if denied:
            reason = output["hookSpecificOutput"]["permissionDecisionReason"]
            echo(f"agent sees: {reason}")
            continue
        outcome = _perform(tool_name, tool_input, workspace)
        if outcome and tool_name == "Bash":
            echo(f"  output: {outcome}")
    result.turns = len(TRANSCRIPT)
    result.subtype = "mock_transcript_complete"
    return result
