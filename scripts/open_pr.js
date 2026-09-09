#!/usr/bin/env node
// Commit the current change, push it on a uniquely named branch, and open a
// pull request whose body carries the evidence: the node test run and the
// lint run, pasted verbatim.
//
// Usage:
//   node scripts/open_pr.js                        # push + gh pr create
//   node scripts/open_pr.js --dry-run              # print the commands, change nothing remote
//   node scripts/open_pr.js --title "Add CSV export"
//   node scripts/open_pr.js --branch feat/export   # use this branch name instead of generating one
//
// A new branch named agent/<slug>-<yyyymmdd-hhmmss> is created from wherever
// you are. A fresh name every time, on purpose: the workshop runs the same
// feature many times, on many laptops, against one remote. Merging is never done here; a person does that
// on GitHub after reading the diff and the reports.
var fs = require("fs");
var path = require("path");
var cp = require("child_process");

var ROOT = path.resolve(__dirname, "..");

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
  return (r.stdout || "").trim();
}

function run(cmd, args) {
  var r = cp.spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8" });
  return { ok: r.status === 0, out: ((r.stdout || "") + (r.stderr || "")).trim() };
}

function testFiles() {
  return fs.readdirSync(path.join(ROOT, "tests")).filter(function (f) { return /\.test\.js$/.test(f); }).map(function (f) { return "tests/" + f; });
}

function changedFiles() {
  var r = cp.spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" });
  return String(r.stdout || "").split("\n").filter(Boolean)
    .map(function (l) { return l.slice(3).trim(); }).filter(Boolean);
}

function which(bin) {
  var r = cp.spawnSync(bin, ["--version"], { encoding: "utf8" });
  return !r.error && r.status === 0;
}

// The node test runner prints TAP; the PR only needs the failures and the
// summary lines, not the per-test YAML.
function tapSummary(out) {
  var lines = String(out || "").split("\n");
  var keep = lines.filter(function (l) {
    return /^not ok /.test(l) || /^# (tests|suites|pass|fail|cancelled|skipped|todo)\b/.test(l);
  });
  return keep.length ? keep.join("\n") : lines.slice(-12).join("\n");
}

function slugify(s) {
  return String(s || "change").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "change";
}

function stamp() {
  var d = new Date();
  function p(n) { return (n < 10 ? "0" : "") + n; }
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

function main() {
  var dryRun = arg("--dry-run", false) === true;
  var base = arg("--base", "main");
  var current = git(["rev-parse", "--abbrev-ref", "HEAD"], { soft: true }) || "HEAD";
  var title = arg("--title", null) || "Add CSV export of the site fleet";
  // A fresh branch every time unless --branch is given: a room full of
  // people pushing the same branch name would reject each other's pushes.
  var branch = arg("--branch", null) || ("agent/" + slugify(title) + "-" + stamp());

  var tests = run("node", ["--test"].concat(testFiles()));
  var lint = run("node", ["scripts/lint.js"]);
  var files = changedFiles();

  var body = [
    "## Change",
    "",
    title,
    "",
    "Branch: `" + branch + "`",
    "",
    "## Evidence, pasted from the run that opened this PR",
    "",
    "- [" + (tests.ok ? "x" : " ") + "] `node --test tests/*.test.js`",
    "",
    "```",
    tapSummary(tests.out),
    "```",
    "",
    "- [" + (lint.ok ? "x" : " ") + "] `node scripts/lint.js`",
    "",
    "```",
    lint.out.split("\n").slice(-6).join("\n"),
    "```",
    "",
    "## Still to come on this PR",
    "",
    "- [ ] CI: node tests, lint, the Playwright browser suite",
    "- [ ] Claude code review comment (advice only)",
    "- [ ] /verify screenshot attached by the author",
    "- [ ] A person approves and merges",
    "",
    "## Files changed",
    "",
    files.length ? files.map(function (f) { return "- `" + f + "`"; }).join("\n") : "- (none)",
    "",
    "Opened by scripts/open_pr.js. Nobody merges from the command line; that is your call on GitHub."
  ].join("\n");

  var remote = git(["remote", "get-url", "origin"], { soft: true });
  var reasons = [];
  if (dryRun) reasons.push("--dry-run was passed");
  if (!remote) reasons.push("no git remote named origin");
  if (!which("gh")) reasons.push("the gh command line tool is not installed");

  if (branch !== current) {
    console.log("creating branch " + branch);
    if (!dryRun) git(["checkout", "-b", branch]);
  }

  if (reasons.length) {
    console.log("dry run: " + reasons.join("; "));
    console.log("would run, in " + ROOT + ":");
    console.log("  git add -A && git commit -m " + JSON.stringify(title));
    console.log("  git push -u origin " + branch);
    console.log("  gh pr create --base " + base + " --head " + branch + " --title " + JSON.stringify(title) + " --body ...");
    console.log("\npull request body would be:\n");
    console.log(body);
    return 0;
  }

  git(["add", "-A"]);
  if (changedFiles().length) {
    git(["commit", "-m", title + "\n\nTests: " + (tests.ok ? "node --test tests/*.test.js green" : "node --test tests/*.test.js RED") + "\nLint: " + (lint.ok ? "clean" : "warnings")]);
    console.log("committed on " + branch);
  } else {
    console.log("nothing new to commit on " + branch + "; pushing what is there");
  }
  console.log("pushing " + branch + " to " + remote);
  git(["push", "-u", "origin", branch]);

  var tmp = path.join(ROOT, ".pr-body.md");
  fs.writeFileSync(tmp, body);
  var r = cp.spawnSync("gh", ["pr", "create", "--base", base, "--head", branch, "--title", title, "--body-file", tmp], { cwd: ROOT, encoding: "utf8" });
  try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
  if (r.status !== 0) {
    console.error("gh pr create failed:\n" + r.stderr);
    return 1;
  }
  var out = String(r.stdout || "").trim().split("\n");
  console.log("opened " + out[out.length - 1]);
  console.log("next: /loop 2m to watch the checks, /code-review high, and the security scan, while CI runs.");
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
