"""The agent layer: Claude through the Agent SDK, with the governance hooks attached.

Two entry points, same shape:

  agent.runner.run_agent(...)   real Claude through claude_agent_sdk.query()
  mock_agent.run_mock_agent(...) canned transcript through the same hook

agent.runner.pick_mode() decides which one to use: real when a credential is
present, mock otherwise. run_demo.py calls that so the demo never stalls on
a missing key.
"""

from agent.runner import AgentResult, pick_mode, run_agent

__all__ = ["AgentResult", "pick_mode", "run_agent"]
