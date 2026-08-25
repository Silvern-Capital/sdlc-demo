#!/usr/bin/env node
// UserPromptSubmit hook: record the requirement.
//
// Runs when the user sends a prompt. The first prompt of a session is treated
// as the requirement for this change and written to the requirement stage,
// so the pipeline page shows what the agent was asked to do. Later prompts
// in the same session are appended as notes. This hook never blocks.
var lib = require("./lib");

var input = lib.readStdinJson();
var prompt = String(input.prompt || "").trim();
if (!prompt) process.exit(0);

// Slash commands (for example /qa-e2e) are skill runs, not requirements.
var isSkill = prompt.charAt(0) === "/";

lib.audit("user_prompt", { session_id: input.session_id || null, prompt: prompt.slice(0, 300), skill: isSkill });

var state = lib.readState();
var req = state.stages.requirement || {};
if (!isSkill) {
  if (req.status !== "done" || (state.session_id && input.session_id && state.session_id !== input.session_id)) {
    // A new session with a new prompt starts a fresh run.
    var fresh = lib.emptyState();
    fresh.session_id = input.session_id || null;
    fresh.run_id = (input.session_id || String(Date.now())).slice(0, 8);
    fresh.stages.requirement = { status: "done", text: prompt.slice(0, 500), at: lib.nowIso() };
    fresh.stages.branch = { status: "pending", name: lib.currentBranch() };
    lib.writeState(fresh);
  } else {
    var notes = req.notes || [];
    notes.push(prompt.slice(0, 200));
    lib.setStage("requirement", "done", { notes: notes });
  }
}
process.exit(0);
