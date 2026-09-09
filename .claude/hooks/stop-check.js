#!/usr/bin/env node
// Stop hook: Claude may not finish with untested app changes.
//
// Runs when Claude tries to end its turn. If app files are modified in the
// working tree, run the node tests and the linter. Red means exit 2 with the
// output, and Claude gets another turn with that message. stop_hook_active
// is true when this hook already sent Claude back once this turn; exit 0
// then, so a genuinely failing test can be reported to you instead of
// looping forever.
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

function isAppFile(rel) {
  rel = String(rel || "").replace(/\\/g, "/");
  if (rel.indexOf("tests/") === 0) return true;
  return /^[^\/]+\.(js|html)$/.test(rel);
}

var input = INPUT;
if (input.stop_hook_active) process.exit(0);

var status = cp.spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" });
var changed = String(status.stdout || "")
  .split("\n")
  .map(function (l) { return l.slice(3).trim(); })
  .filter(isAppFile);
if (!changed.length) process.exit(0);
if (!testFiles().length) process.exit(0);   // nothing to run in this repo yet

var tests = cp.spawnSync("node", ["--test"].concat(testFiles()), { cwd: ROOT, encoding: "utf8" });
var lint = cp.spawnSync("node", ["scripts/lint.js"], { cwd: ROOT, encoding: "utf8" });

if (tests.status !== 0 || lint.status !== 0) {
  var msg = "App files changed this session (" + changed.join(", ") + ") and the checks are not green. Fix the cause, then finish.\n\n";
  if (tests.status !== 0) msg += "node --test tests/*.test.js:\n" + (tests.stdout || "") + (tests.stderr || "") + "\n";
  if (lint.status !== 0) msg += "node scripts/lint.js:\n" + (lint.stdout || "") + (lint.stderr || "") + "\n";
  process.stderr.write(msg);
  process.exit(2);
}
process.exit(0);
