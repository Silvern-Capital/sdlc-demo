"""Governance for the demo: the policy, the hooks, and the audit trail.

Three things live here.

1. decide(): the policy. Given a tool name and its input, it answers
   "allow" or "deny" and says why. It is a plain function so it is easy to
   read, easy to unit test, and the same in mock mode and real mode.

2. AuditTrail: appends one JSON line per event to audit/trail.jsonl.
   Every tool call, every gate decision, the test run, the human approval,
   and the final merge all land here with a timestamp and the requirement id.

3. make_pre_tool_use_hook(): wraps decide() and AuditTrail into the exact
   callback shape the Claude Agent SDK expects for a PreToolUse hook. The
   SDK calls it before every tool call. If it returns a deny decision the
   tool never runs, and the agent is told why.
"""

from __future__ import annotations

import json
import re
import shlex
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Tools that change files. The path they touch must be inside src/ or tests/.
FILE_WRITE_TOOLS = {"Write", "Edit", "MultiEdit", "NotebookEdit"}

# Tools that only read. Always allowed.
READ_ONLY_TOOLS = {"Read", "Glob", "Grep", "LS", "TodoWrite", "WebFetch", "WebSearch"}

# Directories the agent may write to, relative to the workspace root.
WRITABLE_DIRS = ("src", "tests")

# Shell commands that are never allowed, whatever else is on the line.
# Each entry is (regex, short reason). They cover merge, push, and delete.
FORBIDDEN_SHELL = [
    (r"\bgit\s+push\b", "git push is reserved for the human approval step"),
    (r"\bgit\s+merge\b", "git merge is reserved for the human approval step"),
    (r"\bgit\s+rebase\b", "history rewrites are not allowed"),
    (r"\bgit\s+reset\s+--hard\b", "destructive reset is not allowed"),
    (r"\bgit\s+clean\b", "git clean deletes files"),
    (r"\bgit\s+branch\s+(-d|-D|--delete)\b", "branch deletion is not allowed"),
    (r"\bgit\s+checkout\s+main\b", "the agent must stay on its feature branch"),
    (r"\bgit\s+switch\s+main\b", "the agent must stay on its feature branch"),
    (r"(?<![\w-])rm\s", "rm deletes files"),
    (r"(?<![\w-])rmdir\b", "rmdir deletes directories"),
    (r"\bpython3?\s+-c\b", "inline python can delete or rewrite anything; put code in a file under tests/ instead"),
    (r"\b(shutil|rmtree|os\.remove|os\.unlink|unlink)\b", "file deletion from the shell is not allowed"),
    (r"\bsudo\b", "privilege escalation is not allowed"),
    (r"\b(curl|wget)\b", "network access from the agent shell is not allowed"),
    (r"\bpip\s+install\b", "dependency changes need a human"),
]

# Shell commands the agent may run. The first word of the command must be
# one of these. Anything else is denied with a clear reason.
ALLOWED_SHELL_PREFIXES = (
    "python", "python3", "pytest", "git", "ls", "cat", "head", "tail",
    "grep", "find", "wc", "pwd", "echo", "diff", "true",
)


def _first_word(command: str) -> str:
    try:
        parts = shlex.split(command)
    except ValueError:
        parts = command.split()
    return parts[0] if parts else ""


def _inside_writable_dirs(path_str: str, workspace: Path) -> bool:
    candidate = Path(path_str)
    if not candidate.is_absolute():
        candidate = workspace / candidate
    candidate = candidate.resolve()
    for name in WRITABLE_DIRS:
        allowed_root = (workspace / name).resolve()
        if candidate == allowed_root or allowed_root in candidate.parents:
            return True
    return False


def decide(tool_name: str, tool_input: dict, workspace: Path) -> tuple[str, str]:
    """Return ("allow" | "deny", reason) for one proposed tool call."""
    if tool_name in READ_ONLY_TOOLS:
        return "allow", "read only tool"

    if tool_name in FILE_WRITE_TOOLS:
        path_str = tool_input.get("file_path") or tool_input.get("notebook_path") or ""
        if not path_str:
            return "deny", f"{tool_name} call has no file_path"
        allowed = " or ".join(f"{name}/" for name in WRITABLE_DIRS)
        if _inside_writable_dirs(path_str, workspace):
            return "allow", f"path is inside {allowed}"
        return "deny", f"{path_str} is outside {allowed}"

    if tool_name == "Bash":
        command = tool_input.get("command", "")
        for pattern, reason in FORBIDDEN_SHELL:
            if re.search(pattern, command):
                return "deny", reason
        # A command line can chain several commands. Check each one.
        for piece in re.split(r"[;&|]+", command):
            word = _first_word(piece)
            if word and word not in ALLOWED_SHELL_PREFIXES:
                return "deny", f"'{word}' is not on the shell allowlist"
        return "allow", "command is on the shell allowlist"

    return "deny", f"tool {tool_name} is not part of this workflow"


class AuditTrail:
    """Append only JSON lines. One run id per demo run."""

    def __init__(self, path: Path, requirement_id: str, mode: str) -> None:
        self.path = path
        self.requirement_id = requirement_id
        self.run_id = uuid.uuid4().hex[:8]
        self.mode = mode
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def record(self, event: str, **fields) -> dict:
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "run_id": self.run_id,
            "mode": self.mode,
            "requirement_id": self.requirement_id,
            "event": event,
        }
        entry.update(fields)
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, sort_keys=False) + "\n")
        return entry


def summarize_input(tool_name: str, tool_input: dict) -> str:
    """Short, human readable view of a tool input for the trail and the console."""
    if tool_name == "Bash":
        return tool_input.get("command", "")[:160]
    path = tool_input.get("file_path") or tool_input.get("notebook_path") or tool_input.get("pattern")
    return str(path or "")[:160]


def make_pre_tool_use_hook(trail: AuditTrail, workspace: Path, echo=print):
    """Build the PreToolUse hook callback for ClaudeAgentOptions.hooks.

    The SDK calls it as: await hook(input_data, tool_use_id, context).
    input_data has hook_event_name, tool_name, tool_input, and more.
    To block a tool call we return hookSpecificOutput with
    permissionDecision "deny" and a reason the agent can read.
    """

    async def pre_tool_use(input_data, tool_use_id, context):
        tool_name = input_data.get("tool_name", "")
        tool_input = input_data.get("tool_input", {}) or {}
        decision, reason = decide(tool_name, tool_input, workspace)
        target = summarize_input(tool_name, tool_input)
        trail.record(
            "tool_call",
            tool=tool_name,
            target=target,
            decision=decision,
            reason=reason,
            tool_use_id=tool_use_id,
        )
        marker = "ALLOW" if decision == "allow" else "DENY "
        echo(f"  [{marker}] {tool_name:<10} {target}   ({reason})")
        if decision == "allow":
            return {}
        return {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": f"Blocked by governance policy: {reason}",
            }
        }

    return pre_tool_use


def make_post_tool_use_hook(trail: AuditTrail, echo=print):
    """Build the PostToolUse hook: record what each allowed tool call returned.

    PostToolUse runs after a tool has finished. It cannot block the call (it
    already happened), so this hook only observes. It writes one trail line
    per completed call with a short view of the result, which lets report.py
    and the dashboard show not just what the agent asked for but what it got.
    """

    async def post_tool_use(input_data, tool_use_id, context):
        tool_name = input_data.get("tool_name", "")
        tool_input = input_data.get("tool_input", {}) or {}
        response = input_data.get("tool_response")
        if isinstance(response, (dict, list)):
            preview = json.dumps(response)[:160]
        else:
            preview = str(response or "")[:160]
        trail.record(
            "tool_result",
            tool=tool_name,
            target=summarize_input(tool_name, tool_input),
            tool_use_id=tool_use_id,
            result_preview=preview,
        )
        return {}

    return post_tool_use


def make_stop_hook(trail: AuditTrail, echo=print):
    """Build the Stop hook: record that the agent ended its turn.

    Stop runs when the agent is about to finish. This demo never blocks it
    (returning {} lets the agent stop); it only records the event so the
    trail has a clean end marker for the run.
    """

    async def stop(input_data, tool_use_id, context):
        trail.record("agent_stop", reason="agent ended its turn")
        echo("  [STOP ] agent ended its turn")
        return {}

    return stop
