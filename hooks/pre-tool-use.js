#!/usr/bin/env node
// PreToolUse hook: the policy gate.
//
// Claude Code runs this before every tool call and passes the call as JSON on
// stdin ({ session_id, tool_name, tool_input, ... }). Exit 0 lets the call
// run. Exit 2 blocks it, and whatever this script prints to stderr is shown
// to the agent as the reason. Every decision, allow or deny, is appended to
// audit/audit.jsonl and counted in pipeline/state.json.
var lib = require("./lib");
var policy = require("./policy");

var input = lib.readStdinJson();
var toolName = input.tool_name || "";
var toolInput = input.tool_input || {};
var verdict = policy.decide(toolName, toolInput, lib.REPO_ROOT);
var target = policy.summarizeTarget(toolName, toolInput);

lib.audit("tool_call", {
  session_id: input.session_id || null,
  tool: toolName,
  target: target,
  decision: verdict.decision,
  reason: verdict.reason,
  tool_use_id: input.tool_use_id || null
});

// Keep running counts on the gates stage so the pipeline page can show them.
var state = lib.readState();
var gates = state.stages.gates || {};
gates.allowed = (gates.allowed || 0) + (verdict.decision === "allow" ? 1 : 0);
gates.denied = (gates.denied || 0) + (verdict.decision === "deny" ? 1 : 0);
gates.last = { tool: toolName, target: target, decision: verdict.decision, reason: verdict.reason, at: lib.nowIso() };
if (!state.session_id && input.session_id) state.session_id = input.session_id;
if (!state.run_id) state.run_id = (input.session_id || String(Date.now())).slice(0, 8);
lib.setStage("gates", "running", gates);

// A new branch is a pipeline stage. Record it when the agent creates one.
if (toolName === "Bash" && verdict.decision === "allow") {
  var m = /\bgit\s+(?:checkout\s+-b|switch\s+-c)\s+(\S+)/.exec(String(toolInput.command || ""));
  if (m) lib.setStage("branch", "done", { name: m[1], at: lib.nowIso() });
}

if (verdict.decision === "deny") {
  process.stderr.write("Blocked by the Beacon governance policy: " + verdict.reason + "\n");
  process.exit(2);
}
process.exit(0);
