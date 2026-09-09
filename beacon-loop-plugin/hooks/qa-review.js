#!/usr/bin/env node
// Stop hook: the QA review as a hook, the way the engineering team runs it.
//
// When Claude says it is done and the tests are green, start a separate run
// of the qa agent on the diff (`claude -p --agent qa`), once per diff. A
// blocking finding goes back into Claude's context (exit 2) before it can
// stop. Green is silence.
//
// Off by default, because each run is a separate billed session that takes
// about a minute, and a Stop hook fires at the end of every turn. Turn it
// on for a session with:   BEACON_QA_STOP=1 claude
// Dry run (prints what it would do, runs nothing):   BEACON_QA_STOP=dry
var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var crypto = require("crypto");

var MODE = process.env.BEACON_QA_STOP || "";
if (MODE !== "1" && MODE !== "dry") process.exit(0);

var INPUT = (function () {
  try { return JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch (e) { return {}; }
})();
if (INPUT.stop_hook_active) process.exit(0);

var PROJECT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
function gitOut(dir, args) {
  var r = cp.spawnSync("git", ["-C", dir].concat(args), { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}
function worktreeRoot(cwd) {
  if (!cwd || typeof cwd !== "string" || !fs.existsSync(cwd)) return null;
  if (cwd.split(path.sep).indexOf("node_modules") !== -1) return null;
  var projectCommon = gitOut(PROJECT, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  var cwdCommon = gitOut(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!projectCommon || !cwdCommon || projectCommon !== cwdCommon) return null;
  var top = gitOut(cwd, ["rev-parse", "--show-toplevel"]);
  return top && fs.existsSync(path.join(top, "package.json")) ? top : null;
}
var ROOT = worktreeRoot(INPUT.cwd) || PROJECT;

// App files: .js and .html at the repo root, and anything under tests/.
function isAppFile(rel) {
  if (rel.indexOf("..") === 0) return false;
  if (rel.indexOf("tests/") === 0) return true;
  return rel.indexOf("/") === -1 && /\.(js|html)$/.test(rel);
}
var status = gitOut(ROOT, ["status", "--porcelain"]) || "";
var changed = status.split("\n").filter(Boolean)
  .map(function (l) { return l.slice(3).trim(); }).filter(isAppFile);
if (!changed.length) process.exit(0);   // nothing to review

// Only review a green tree; stop-check.js handles red.
var files = fs.existsSync(path.join(ROOT, "tests"))
  ? fs.readdirSync(path.join(ROOT, "tests")).filter(function (f) { return /\.test\.js$/.test(f); }).map(function (f) { return "tests/" + f; })
  : [];
if (!files.length) process.exit(0);
var tests = cp.spawnSync("node", ["--test"].concat(files), { cwd: ROOT, encoding: "utf8" });
if (tests.status !== 0) process.exit(0);

// Once per diff: hash tracked changes plus untracked app files.
var h = crypto.createHash("sha1");
h.update(gitOut(ROOT, ["diff", "HEAD"]) || "");
changed.forEach(function (f) {
  var p = path.join(ROOT, f);
  if (fs.existsSync(p)) h.update(f + "\n" + fs.readFileSync(p, "utf8"));
});
var diffHash = h.digest("hex");
// The marker lives inside this repo's own git directory, not in a shared
// temp folder, so nobody else can pre-create or redirect it.
var gitDir = gitOut(ROOT, ["rev-parse", "--path-format=absolute", "--git-dir"]);
if (!gitDir) process.exit(0);
var marker = path.join(gitDir, "beacon-qa-reviewed");
try {
  if (fs.lstatSync(marker).isFile() && fs.readFileSync(marker, "utf8").trim() === diffHash) process.exit(0);
} catch (e) { /* no marker yet */ }
function markReviewed() {
  try { if (fs.existsSync(marker) && !fs.lstatSync(marker).isFile()) fs.unlinkSync(marker); } catch (e) {}
  fs.writeFileSync(marker, diffHash, { mode: 0o600 });
}

// A fixed instruction. The agent finds the changed files itself with git
// status, so nothing from the working tree is interpolated into the prompt.
var prompt = "Review the current working-tree diff of this repo as QA. Run git status to see what changed. " +
  "Use the running API on localhost:8000 if it answers, otherwise read data.js. " +
  "Report findings the way your instructions say and end with the closing line.";
// Only what the qa agent needs: read the tree, run node one-liners and the
// tests, look at the diff, and curl the local API. No bare Bash.
var ALLOWED_TOOLS = [
  "Read", "Grep", "Glob",
  "Bash(node:*)", "Bash(git diff:*)", "Bash(git status:*)",
  "Bash(curl -sf http://localhost:8000/*)", "Bash(curl -s http://localhost:8000/*)",
  "Bash(curl -sf localhost:8000/*)", "Bash(curl -s localhost:8000/*)"
].join(",");
var args = ["-p", "--agent", "qa", "--allowedTools", ALLOWED_TOOLS, "--max-turns", "25", "--output-format", "text", prompt];
// A minimal environment for the child: enough to find claude and sign in,
// nothing else from this process.
var childEnv = { BEACON_QA_STOP: "" };
["PATH", "HOME", "USER", "LANG", "TMPDIR", "SHELL", "ANTHROPIC_API_KEY", "CLAUDE_CONFIG_DIR", "ANTHROPIC_BASE_URL", "CLAUDE_CODE_OAUTH_TOKEN"]
  .forEach(function (k) { if (process.env[k] !== undefined) childEnv[k] = process.env[k]; });

if (MODE === "dry") {
  process.stderr.write("qa-review (dry run): would run  claude " + args.slice(0, -1).join(" ") + " \"<prompt>\"\n  in " + ROOT + "\n  diff " + diffHash.slice(0, 12) + "\n");
  markReviewed();
  process.exit(0);
}

var run = cp.spawnSync("claude", args, { cwd: ROOT, encoding: "utf8", timeout: 170000, killSignal: "SIGKILL", env: childEnv });
var out = String(run.stdout || "") + String(run.stderr || "");
var completed = !run.error && run.status === 0 && /no blocking findings|\bblocking:/i.test(out);
if (!completed) {
  // Did not finish, timed out, or produced no verdict: do not mark the diff
  // reviewed, so the next Stop tries again. Say so, without blocking.
  var why = run.error ? run.error.message : ("exit " + run.status + ", no verdict line");
  process.stderr.write("qa-review: the qa agent run did not complete (" + why + "). Not blocking; it will run again at the next stop.\n");
  process.exit(0);
}
markReviewed();
if (/\bblocking:/i.test(out) && !/no blocking findings/i.test(out)) {
  process.stderr.write("QA (a separate claude -p --agent qa run) found a blocking issue in your change. Fix it before finishing; do not edit or skip a test to get past it.\n\n" + out.trim().slice(-3000) + "\n");
  process.exit(2);
}
process.exit(0);
