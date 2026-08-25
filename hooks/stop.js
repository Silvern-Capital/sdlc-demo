#!/usr/bin/env node
// Stop hook: the agent may not finish with untested app changes.
//
// Runs when the agent is about to end its turn. If this session edited an app
// file (index.html, data.js, serve.js, tests/, qa/) and no test command ran
// after the last edit, exit 2 and tell the agent to run the tests. Claude
// Code then gives the agent another turn with that message.
//
// stop_hook_active is true when the agent is already continuing because of
// this hook. Exit 0 in that case so a failing test can still be reported
// without an endless loop. The QA skills report failures and stop on
// purpose; this hook only insists that the tests were run, not that they
// passed.
var lib = require("./lib");

var input = lib.readStdinJson();
var sessionId = input.session_id || null;

if (input.stop_hook_active) {
  lib.audit("agent_stop", { session_id: sessionId, decision: "allow", reason: "second stop after a test reminder; letting the agent finish" });
  process.exit(0);
}

var events = lib.readAudit().filter(function (e) { return !sessionId || e.session_id === sessionId; });
var lastEdit = null;
var lastTest = null;
for (var i = 0; i < events.length; i++) {
  var e = events[i];
  // tool_result rows are edits that actually completed (PostToolUse).
  if (e.event === "tool_result" && ["Write", "Edit", "MultiEdit", "NotebookEdit"].indexOf(e.tool) !== -1) {
    var rel = String(e.target || "").replace(lib.REPO_ROOT + "/", "");
    if (lib.isAppFile(rel)) lastEdit = i;
  }
  if (e.event === "test_run") lastTest = i;
}

if (lastEdit !== null && (lastTest === null || lastTest < lastEdit)) {
  var msg = "App files were changed in this session but the tests have not run since the last edit. Run the tests before finishing: npx playwright test (or node qa/check_migration.js for QA fixture changes). Report the result, pass or fail, and then stop.";
  lib.audit("agent_stop", { session_id: sessionId, decision: "block", reason: "tests not run since last app edit" });
  lib.setStage("tests", "pending", { note: "required before the agent may stop" });
  process.stderr.write(msg + "\n");
  process.exit(2);
}

lib.audit("agent_stop", { session_id: sessionId, decision: "allow", reason: lastEdit === null ? "no app edits this session" : "tests ran after the last edit" });
if (lastEdit !== null) {
  var state = lib.readState();
  if (state.stages.changes && state.stages.changes.status === "running") lib.setStage("changes", "done", {});
  if (state.stages.gates && state.stages.gates.status === "running") lib.setStage("gates", "done", {});
}
process.exit(0);
