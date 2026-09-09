#!/usr/bin/env node
// PostToolUse hook: run the node tests after every edit to an app file.
//
// Claude Code runs this after Edit, Write and MultiEdit and passes the tool
// call as JSON on stdin. Exit 0 means say nothing. Exit 2 means whatever
// this script printed to stderr goes into Claude's context as a message it
// has to act on. The whole node suite runs in well under a second, which is
// why it can run on every edit.
var fs = require("fs");
var path = require("path");
var cp = require("child_process");

// The event JSON carries cwd. In a worktree (claude --worktree) that is the
// worktree root while CLAUDE_PROJECT_DIR stays at the main checkout, so
// prefer cwd, walking up to the nearest package.json.
var INPUT = (function () {
  try { return JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch (e) { return {}; }
})();
function findRoot(start) {
  var dir = start;
  while (dir && fs.existsSync(dir)) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    var up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}
var ROOT = findRoot(INPUT.cwd) || process.env.CLAUDE_PROJECT_DIR || process.cwd();

function testFiles() {
  var dir = path.join(ROOT, "tests");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(function (f) { return /\.test\.js$/.test(f); }).map(function (f) { return "tests/" + f; });
}

// App files: .js and .html at the repo root, and anything under tests/.
function isAppFile(file) {
  if (!file) return false;
  var rel = path.relative(ROOT, path.resolve(ROOT, file)).replace(/\\/g, "/");
  if (rel.indexOf("..") === 0) return false;
  if (rel.indexOf("tests/") === 0) return true;
  return /^[^\/]+\.(js|html)$/.test(rel);
}

var input = INPUT;
var toolInput = input.tool_input || {};
var file = toolInput.file_path || toolInput.notebook_path || "";
if (!isAppFile(file)) process.exit(0);
if (!testFiles().length) process.exit(0);   // nothing to run in this repo yet

var r = cp.spawnSync("node", ["--test"].concat(testFiles()), { cwd: ROOT, encoding: "utf8" });
if (r.status !== 0) {
  var rel = path.relative(ROOT, path.resolve(ROOT, file));
  process.stderr.write(
    "node --test tests/*.test.js is red after your edit to " + rel + ". Fix the cause; do not edit or skip the failing test.\n\n" +
    (r.stdout || "") + (r.stderr || "")
  );
  process.exit(2);
}
process.exit(0);
