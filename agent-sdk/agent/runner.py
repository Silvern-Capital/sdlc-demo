"""Run Claude as a coding agent through the Claude Agent SDK, with hooks.

This is the real mode of the demo. It starts one agent session with
claude_agent_sdk.query(), registers three hooks from governance.py, and
streams what the agent says and does to the console.

  PreToolUse   the policy gate. Runs before every tool call and can deny it.
  PostToolUse  observer. Records what each allowed call returned.
  Stop         observer. Records that the agent ended its turn.

Credentials and endpoint come from the environment, never from this file:

  ANTHROPIC_API_KEY        API key (or a Claude Code login on the machine)
  ANTHROPIC_BASE_URL       send model calls through a proxy, for example a
                           LiteLLM proxy in front of Claude on Amazon Bedrock
  CLAUDE_CODE_USE_BEDROCK  ask the Claude Code runtime to talk to Bedrock
                           directly with AWS credentials (check the Claude
                           Code docs for the exact variables before relying
                           on them; this demo only passes them through)
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from governance import AuditTrail, make_post_tool_use_hook, make_pre_tool_use_hook, make_stop_hook

# Environment variables that mean "a real model endpoint is configured".
CREDENTIAL_VARS = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK")

# Environment variables we pass through to the Claude Code process the SDK
# starts, when they are set. Everything else about the machine is ignored.
PASS_THROUGH_VARS = (
    "ANTHROPIC_BASE_URL",
    "CLAUDE_CODE_USE_BEDROCK",
    "ANTHROPIC_BEDROCK_BASE_URL",
    "AWS_REGION",
    "AWS_PROFILE",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
)


@dataclass
class AgentResult:
    """What the runner learned from one agent session."""

    mode: str
    said: list[str] = field(default_factory=list)
    tools_requested: list[str] = field(default_factory=list)
    turns: int | None = None
    cost_usd: float | None = None
    subtype: str | None = None
    is_error: bool = False


def has_credentials(environ=os.environ) -> bool:
    return any(environ.get(name) for name in CREDENTIAL_VARS)


def pick_mode(requested_mock: bool, allow_fallback: bool = True, environ=os.environ) -> tuple[str, str]:
    """Return (mode, reason). mode is "mock" or "real"."""
    if requested_mock:
        return "mock", "--mock was passed"
    if has_credentials(environ):
        return "real", "a model credential is set in the environment"
    if allow_fallback:
        return "mock", "no ANTHROPIC_API_KEY (or other credential) in the environment, falling back to the mock agent"
    return "real", "--no-fallback was passed; the SDK will use a Claude Code login if there is one"


def build_env(base_url: str | None, environ=os.environ) -> dict:
    env = {name: environ[name] for name in PASS_THROUGH_VARS if environ.get(name)}
    if base_url:
        env["ANTHROPIC_BASE_URL"] = base_url
    return env


async def run_agent(
    prompt: str,
    workspace: Path,
    trail: AuditTrail,
    base_url: str | None = None,
    max_turns: int = 40,
    echo=print,
) -> AgentResult:
    """Drive Claude through the Agent SDK with all three governance hooks attached."""
    from claude_agent_sdk import (
        AssistantMessage,
        ClaudeAgentOptions,
        HookMatcher,
        ResultMessage,
        TextBlock,
        ToolUseBlock,
        query,
    )

    result = AgentResult(mode="real")
    pre = make_pre_tool_use_hook(trail, workspace, echo=echo)
    post = make_post_tool_use_hook(trail, echo=echo)
    stop = make_stop_hook(trail, echo=echo)

    options = ClaudeAgentOptions(
        cwd=str(workspace),
        # acceptEdits plus allowed_tools means the SDK will not stop to ask a
        # person about each tool. The PreToolUse hook is the only gate, on
        # purpose: policy lives in one place and is the same in every run.
        permission_mode="acceptEdits",
        allowed_tools=["Read", "Glob", "Grep", "Write", "Edit", "MultiEdit", "Bash"],
        hooks={
            "PreToolUse": [HookMatcher(matcher=None, hooks=[pre])],
            "PostToolUse": [HookMatcher(matcher=None, hooks=[post])],
            "Stop": [HookMatcher(matcher=None, hooks=[stop])],
        },
        setting_sources=[],  # ignore any Claude settings on this machine; only this demo's policy applies
        max_turns=max_turns,
        env=build_env(base_url),
    )

    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock) and block.text.strip():
                    text = block.text.strip()
                    result.said.append(text)
                    echo(f"agent: {text}")
                elif isinstance(block, ToolUseBlock):
                    result.tools_requested.append(block.name)
                    echo(f"agent wants: {block.name}")
        elif isinstance(message, ResultMessage):
            result.turns = message.num_turns
            result.cost_usd = message.total_cost_usd
            result.subtype = message.subtype
            result.is_error = bool(message.is_error)
            cost = f"${message.total_cost_usd:.4f}" if message.total_cost_usd is not None else "n/a"
            echo(f"agent finished: {message.subtype}, {message.num_turns} turns, cost {cost}")
            if message.is_error:
                echo("agent reported an error. Check the output above.")
    return result
