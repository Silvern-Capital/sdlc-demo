#!/usr/bin/env node
// Pull the pull request's CI, review, approval, and merge state from GitHub
// into pipeline/state.json so the pipeline page shows stages 7 to 10.
//
// Usage:
//   node scripts/sync_pr.js            # uses the PR number from the pr stage
//   node scripts/sync_pr.js 12         # a specific PR number
//
// Needs the gh command line tool, signed in. Read only: it never approves,
// merges, or comments. Run it again whenever you want the page refreshed.
var path = require("path");
var cp = require("child_process");
var lib = require(path.join(__dirname, "..", "hooks", "lib"));

var state = lib.readState();
var number = process.argv[2] || (state.stages.pr && state.stages.pr.number);
if (!number) {
  console.error("no pull request number. Pass one, or run scripts/open_pr.js first.");
  process.exit(1);
}

var fields = "number,url,title,state,mergedAt,mergedBy,headRefName,reviews,comments,statusCheckRollup,reviewDecision";
var r = cp.spawnSync("gh", ["pr", "view", String(number), "--json", fields], { cwd: lib.REPO_ROOT, encoding: "utf8" });
if (r.status !== 0) {
  console.error("gh pr view failed: " + (r.stderr || "").trim());
  process.exit(1);
}
var pr = JSON.parse(r.stdout);

lib.setStage("pr", "done", { number: pr.number, url: pr.url, title: pr.title, branch: pr.headRefName, state: String(pr.state || "").toLowerCase(), dry_run: false });

// CI: one row per check from the status rollup.
var checks = (pr.statusCheckRollup || []).map(function (c) {
  var conclusion = String(c.conclusion || c.state || "pending").toLowerCase();
  return { name: c.name || c.context || "check", conclusion: conclusion, detail: c.workflowName || "", url: c.detailsUrl || c.targetUrl || null };
});
var ciStatus = !checks.length ? "pending"
  : checks.some(function (c) { return c.conclusion === "failure"; }) ? "failed"
  : checks.every(function (c) { return c.conclusion === "success" || c.conclusion === "skipped" || c.conclusion === "neutral"; }) ? "done"
  : "running";
var triage = (pr.comments || []).filter(function (c) { return /CI triage \(automated\)/.test(c.body || ""); });
lib.setStage("ci", ciStatus, { checks: checks, run_url: checks.length ? checks[0].url : null, triage: triage.length ? triage[triage.length - 1].body.split("\n").slice(0, 6).join(" ").slice(0, 300) : null });

// Claude review: the comment whose first line starts with "Verdict:".
var verdicts = (pr.comments || []).filter(function (c) { return /Verdict:/.test(c.body || ""); });
if (verdicts.length) {
  var last = verdicts[verdicts.length - 1];
  var m = /Verdict:\s*([^\n]+)/.exec(last.body);
  lib.setStage("review", "done", { verdict: m ? m[1].trim() : "posted", reviewer: (last.author && last.author.login) || "claude-code-review", comments: verdicts.length, summary: last.body.replace(/\s+/g, " ").slice(0, 240), url: last.url || pr.url });
} else {
  lib.setStage("review", "pending", { comments: 0 });
}

// Gate 1: an approving review from a person.
var approvals = (pr.reviews || []).filter(function (rv) { return rv.state === "APPROVED"; });
if (approvals.length) {
  var a = approvals[approvals.length - 1];
  lib.setStage("gate1", "done", { decision: "approved", by: (a.author && a.author.login) || "reviewer", at: a.submittedAt || lib.nowIso() });
} else if (pr.reviewDecision === "CHANGES_REQUESTED") {
  lib.setStage("gate1", "failed", { decision: "changes requested" });
} else {
  lib.setStage("gate1", "pending", { decision: null });
}

// Merge.
if (pr.mergedAt) {
  lib.setStage("merge", "done", { decision: "merged", by: (pr.mergedBy && pr.mergedBy.login) || null, at: pr.mergedAt });
} else if (String(pr.state).toLowerCase() === "closed") {
  lib.setStage("merge", "skipped", { decision: "closed without merge" });
} else {
  lib.setStage("merge", "pending", { decision: null });
}

console.log("synced PR #" + pr.number + ": ci=" + ciStatus + ", review=" + (verdicts.length ? "posted" : "pending") + ", gate1=" + (approvals.length ? "approved" : "pending") + ", merge=" + (pr.mergedAt ? "merged" : "pending"));
console.log("pipeline page updated: " + lib.STATE_PATH);
