#!/usr/bin/env node
// PostToolUse hook: the observer.
//
// Runs after a tool call has finished. It cannot block anything (the call
// already happened), so it only records what came back. Two things matter for
// the pipeline: which app files were changed, and whether a test command ran
// and what it reported.
var lib = require("./lib");
var policy = require("./policy");

var input = lib.readStdinJson();
var toolName = input.tool_name || "";
var toolInput = input.tool_input || {};
var response = input.tool_response;
var target = policy.summarizeTarget(toolName, toolInput);

var preview;
if (response && typeof response === "object") {
  preview = JSON.stringify(response).slice(0, 160);
} else {
  preview = String(response === undefined || response === null ? "" : response).slice(0, 160);
}

lib.audit("tool_result", {
  session_id: input.session_id || null,
  tool: toolName,
  target: target,
  tool_use_id: input.tool_use_id || null,
  result_preview: preview
});

// Record edited files on the changes stage.
if (policy.FILE_WRITE_TOOLS.indexOf(toolName) !== -1) {
  var rel = policy.relativeToRepo(toolInput.file_path || toolInput.notebook_path || "", lib.REPO_ROOT);
  if (rel) {
    var state = lib.readState();
    var changes = state.stages.changes || {};
    var files = changes.files || [];
    if (files.indexOf(rel) === -1) files.push(rel);
    var tests = files.filter(function (f) { return f.indexOf("tests/") === 0; });
    lib.setStage("changes", "running", { files: files, test_files: tests, branch: lib.currentBranch(), last_edit_at: lib.nowIso() });
    if (lib.isAppFile(rel)) {
      // An app edit makes any earlier test run stale. The Stop hook checks this.
      lib.setStage("tests", "pending", { stale_since: lib.nowIso() });
    }
  }
}

// Record test runs on the tests stage.
if (toolName === "Bash") {
  var kind = lib.testCommandKind(toolInput.command);
  if (kind) {
    var stdout = "";
    if (response && typeof response === "object") {
      stdout = String(response.stdout || "") + "\n" + String(response.stderr || "");
    } else {
      stdout = String(response || "");
    }
    var verdict = lib.testVerdict(kind, stdout);
    lib.audit("test_run", {
      session_id: input.session_id || null,
      kind: kind,
      command: String(toolInput.command || "").slice(0, 160),
      passed: verdict.passed,
      summary: verdict.summary
    });
    var status = verdict.passed === false ? "failed" : "done";
    lib.setStage("tests", status, { kind: kind, command: String(toolInput.command || "").slice(0, 160), passed: verdict.passed, summary: verdict.summary, at: lib.nowIso(), stale_since: null });
  }
}

process.exit(0);
