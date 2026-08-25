#!/usr/bin/env node
// Commit the current change, push it on a uniquely named branch, and open a
// pull request whose body lists the gates the change passed.
//
// Usage:
//   node scripts/open_pr.js                       # push + gh pr create
//   node scripts/open_pr.js --dry-run             # print the commands, change nothing remote
//   node scripts/open_pr.js --title "Add header tagline"
//   node scripts/open_pr.js --branch feat/tagline # use this branch name instead of generating one
//
// What it does:
//   1. Reads pipeline/state.json for the requirement, the files edited, the
//      test result, and the hook decision counts.
//   2. If the repo is on main (or --branch is given), creates a new branch
//      named agent/<slug>-<yyyymmdd-hhmmss>. A fresh name every time, on
//      purpose: the demo runs the same feature request many times.
//   3. git add -A, git commit with Requirement-Id / Tests / Audit-Run trailers.
//   4. git push -u origin <branch> and gh pr create --base main.
//   5. Writes the pr stage into pipeline/state.json.
//
// Falls back to a dry run when --dry-run is passed, when gh is missing, or
// when there is no origin remote. Merging is never done here: that is Gate 1,
// a person on GitHub.
var fs = require("fs");
var path = require("path");
var cp = require("child_process");

var lib = require(path.join(__dirname, "..", "hooks", "lib"));
var ROOT = lib.REPO_ROOT;

function arg(name, dflt) {
  var i = process.argv.indexOf(name);
  if (i === -1) return dflt;
  var v = process.argv[i + 1];
  return v === undefined || v.charAt(0) === "-" ? true : v;
}

function git(args, opts) {
  opts = opts || {};
  var r = cp.spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0 && !opts.soft) {
    throw new Error("git " + args.join(" ") + " failed: " + (r.stderr || r.stdout).trim());
  }
  return opts.raw ? (r.stdout || "") : (r.stdout || "").trim();
}

// Changed and untracked paths from git status, ignoring what .gitignore hides.
function changedFiles() {
  var raw = git(["status", "--porcelain"], { soft: true, raw: true });
  return raw.split("\n").filter(Boolean).map(function (l) { return l.slice(3).trim(); }).filter(Boolean);
}

function which(bin) {
  var r = cp.spawnSync(bin, ["--version"], { encoding: "utf8" });
  return !r.error && r.status === 0;
}

function slugify(s) {
  return String(s || "change").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "change";
}

function stamp() {
  var d = new Date();
  function p(n) { return (n < 10 ? "0" : "") + n; }
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

function prBody(state, branch, files, testsLine) {
  var st = state.stages || {};
  var req = st.requirement || {};
  var ga = st.gates || {};
  var te = st.tests || {};
  var lines = [
    "## Change",
    "",
    req.text ? req.text.split("\n")[0].slice(0, 200) : "Agent implemented change",
    "",
    "Requirement-Id: " + (state.run_id || "local"),
    "Audit-Run: " + (state.run_id || "local"),
    "Branch: `" + branch + "`",
    "",
    "## Gates passed before this PR was opened",
    "",
    "- [x] Hooks: " + (ga.allowed || 0) + " tool calls allowed, " + (ga.denied || 0) + " denied (PreToolUse policy in hooks/policy.js)",
    "- [" + (te.passed === true ? "x" : " ") + "] Tests: " + testsLine,
    "- [x] Audit log: every tool call recorded in audit/audit.jsonl",
    "- [ ] CI (ci workflow: sanity, e2e, qa-test-gap)",
    "- [ ] Claude code review (claude-code-review workflow, advice only)",
    "- [ ] Gate 1: human approval on this pull request",
    "",
    "## Files changed",
    "",
    files.length ? files.map(function (f) { return "- `" + f + "`"; }).join("\n") : "- (none recorded)",
    "",
    "Opened by scripts/open_pr.js. Branch protection requires CI and a human review before merge. The agent cannot merge: git merge and gh pr merge are denied by the hooks."
  ];
  return lines.join("\n");
}

function main() {
  var dryRun = arg("--dry-run", false) === true;
  var base = arg("--base", "main");
  var state = lib.readState();
  var st = state.stages || {};
  var req = st.requirement || {};
  var te = st.tests || {};

  var current = git(["rev-parse", "--abbrev-ref", "HEAD"], { soft: true }) || "HEAD";
  var branch = arg("--branch", null);
  if (!branch) {
    branch = (current === base || current === "HEAD" || current === "master")
      ? "agent/" + slugify(req.text ? req.text.split("\n")[0] : "change") + "-" + stamp()
      : current;
  }
  var title = arg("--title", null) || (req.text ? req.text.split("\n")[0].slice(0, 72) : "Agent change " + stamp());

  var testsLine = te.command
    ? (te.passed === true ? "pass" : te.passed === false ? "FAIL" : "ran") + " (" + te.command + (te.summary ? ": " + te.summary : "") + ")"
    : "not run in this session";

  if (branch !== current) {
    console.log("creating branch " + branch);
    if (!dryRun) git(["checkout", "-b", branch]);
    lib.setStage("branch", "done", { name: branch, at: lib.nowIso() });
  }

  var files = changedFiles();
  var changes = st.changes || {};
  var recorded = changes.files || [];
  var allFiles = files.slice();
  for (var i = 0; i < recorded.length; i++) if (allFiles.indexOf(recorded[i]) === -1) allFiles.push(recorded[i]);

  var message = title + "\n\n" +
    "Requirement-Id: " + (state.run_id || "local") + "\n" +
    "Tests: " + testsLine + "\n" +
    "Audit-Run: " + (state.run_id || "local") + "\n";

  var body = prBody(state, branch, allFiles, testsLine);
  var remote = git(["remote", "get-url", "origin"], { soft: true });
  var reasons = [];
  if (dryRun) reasons.push("--dry-run was passed");
  if (!remote) reasons.push("no git remote named origin");
  if (!which("gh")) reasons.push("the gh command line tool is not installed");

  if (reasons.length) {
    var note = "dry run: " + reasons.join("; ");
    console.log(note);
    console.log("would run, in " + ROOT + ":");
    console.log("  git add -A");
    console.log("  git commit -m " + JSON.stringify(title) + " (with Requirement-Id / Tests / Audit-Run trailers)");
    console.log("  git push -u origin " + branch);
    console.log("  gh pr create --base " + base + " --head " + branch + " --title " + JSON.stringify(title) + " --body ...");
    console.log("");
    console.log("pull request body would be:");
    console.log(body);
    lib.setStage("pr", "done", { branch: branch, base: base, number: null, url: null, state: "dry-run", dry_run: true, title: title, note: note, at: lib.nowIso() });
    console.log("");
    console.log("recorded a dry run pr stage in " + lib.STATE_PATH);
    return 0;
  }

  git(["add", "-A"]);
  if (changedFiles().length) {
    git(["commit", "-m", message]);
    console.log("committed on " + branch);
  } else {
    console.log("nothing new to commit on " + branch + "; pushing what is there");
  }
  console.log("pushing " + branch + " to " + remote);
  git(["push", "-u", "origin", branch]);

  var tmp = path.join(ROOT, "pipeline", "pr-body.md");
  fs.writeFileSync(tmp, body);
  var r = cp.spawnSync("gh", ["pr", "create", "--base", base, "--head", branch, "--title", title, "--body-file", tmp], { cwd: ROOT, encoding: "utf8" });
  try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
  if (r.status !== 0) {
    lib.setStage("pr", "failed", { branch: branch, base: base, dry_run: false, title: title, note: String(r.stderr || "").trim().slice(0, 500), at: lib.nowIso() });
    console.error("gh pr create failed:\n" + r.stderr);
    return 1;
  }
  var out = String(r.stdout || "").trim().split("\n");
  var url = out[out.length - 1];
  var m = /\/pull\/(\d+)/.exec(url);
  lib.setStage("pr", "done", { branch: branch, base: base, number: m ? Number(m[1]) : null, url: url, state: "open", dry_run: false, title: title, at: lib.nowIso() });
  console.log("opened " + url);
  console.log("recorded the pr stage in " + lib.STATE_PATH);
  console.log("next: wait for CI and the Claude review, then approve on GitHub (Gate 1). Run node scripts/sync_pr.js to pull those results into the pipeline page.");
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
