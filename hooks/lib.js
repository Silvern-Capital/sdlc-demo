// Shared helpers for the hook scripts: stdin parsing, the audit log, and the
// pipeline state file. Plain Node, no dependencies.
//
// Audit log: audit/audit.jsonl. One JSON object per line, append only. Every
// tool call, every decision, every test run, and every stop lands here.
//
// Pipeline state: pipeline/state.json. The current picture of one change,
// stage by stage, which pipeline.html renders. The audit log is the record;
// the state file is the summary.
var fs = require("fs");
var path = require("path");

var REPO_ROOT = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, "..");
var AUDIT_PATH = path.join(REPO_ROOT, "audit", "audit.jsonl");
var STATE_PATH = path.join(REPO_ROOT, "pipeline", "state.json");

// Stage names in pipeline order. pipeline.js renders them in this order.
var STAGES = [
  "requirement",
  "branch",
  "changes",
  "tests",
  "gates",
  "pr",
  "ci",
  "review",
  "gate1",
  "merge"
];

var STAGE_LABELS = {
  requirement: "Requirement",
  branch: "Branch",
  changes: "Code + tests",
  tests: "Tests run",
  gates: "Hooks / gates",
  pr: "Pull request",
  ci: "CI",
  review: "Claude review",
  gate1: "Gate 1 (human)",
  merge: "Merge"
};

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

// Read all of stdin and parse it as JSON. Returns {} on empty or bad input so
// a hook never crashes the agent because of a malformed payload.
function readStdinJson() {
  var raw = "";
  try {
    raw = fs.readFileSync(0, "utf8");
  } catch (e) {
    raw = "";
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function ensureDir(p) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
  } catch (e) {
    // ignore
  }
}

// Append one event to the audit log. Returns the entry written.
function audit(event, fields) {
  var entry = { ts: nowIso(), event: event };
  var keys = Object.keys(fields || {});
  for (var i = 0; i < keys.length; i++) entry[keys[i]] = fields[keys[i]];
  ensureDir(AUDIT_PATH);
  fs.appendFileSync(AUDIT_PATH, JSON.stringify(entry) + "\n");
  return entry;
}

// Read the audit log as an array of objects. Bad lines are skipped.
function readAudit() {
  var out = [];
  var raw;
  try {
    raw = fs.readFileSync(AUDIT_PATH, "utf8");
  } catch (e) {
    return out;
  }
  var lines = raw.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch (e) {
      // skip
    }
  }
  return out;
}

function emptyState() {
  var state = { schema: 1, updated_at: nowIso(), run_id: null, session_id: null, stages: {} };
  for (var i = 0; i < STAGES.length; i++) {
    state.stages[STAGES[i]] = { status: "pending" };
  }
  return state;
}

function readState() {
  try {
    var data = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    if (!data.stages) data.stages = {};
    for (var i = 0; i < STAGES.length; i++) {
      if (!data.stages[STAGES[i]]) data.stages[STAGES[i]] = { status: "pending" };
    }
    return data;
  } catch (e) {
    return emptyState();
  }
}

function writeState(state) {
  state.updated_at = nowIso();
  ensureDir(STATE_PATH);
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
  return state;
}

// Merge fields into one stage and save. status is one of
// pending | running | done | failed | skipped.
function setStage(name, status, fields) {
  var state = readState();
  var stage = state.stages[name] || {};
  var keys = Object.keys(fields || {});
  for (var i = 0; i < keys.length; i++) stage[keys[i]] = fields[keys[i]];
  stage.status = status;
  stage.updated_at = nowIso();
  state.stages[name] = stage;
  return writeState(state);
}

// The files the policy treats as "the app". Editing one of these means the
// tests have to run again before the agent may stop.
function isAppFile(rel) {
  if (!rel) return false;
  rel = String(rel).replace(/\\/g, "/");
  if (rel.indexOf("tests/") === 0 || rel.indexOf("qa/") === 0) return true;
  return /^[^\/]+\.(html|js|css)$/.test(rel);
}

// Classify a shell command as a test run, if it is one.
function testCommandKind(command) {
  var c = String(command || "");
  if (/\bplaywright\s+test\b/.test(c) || /\bnpm\s+run\s+test(:e2e(:headed)?)?\b/.test(c) || /\bnpm\s+test\b/.test(c)) return "playwright";
  if (/\bnode\s+qa\/check_migration\.js\b/.test(c)) return "migration";
  if (/\bnode\s+-e\b[^\n]*require\(["']\.\/data\.js["']\)/.test(c)) return "sanity";
  return null;
}

// Read a pass or fail verdict out of a test command's output.
function testVerdict(kind, stdout) {
  var s = String(stdout || "");
  if (kind === "playwright") {
    var failed = /(\d+)\s+failed/.exec(s);
    var passed = /(\d+)\s+passed/.exec(s);
    if (failed && Number(failed[1]) > 0) return { passed: false, summary: failed[0] + (passed ? ", " + passed[0] : "") };
    if (passed) return { passed: true, summary: passed[0] };
    if (/Error:|error TS|Cannot find module/.test(s)) return { passed: false, summary: "run errored" };
    return { passed: null, summary: "no summary line found" };
  }
  if (kind === "migration") {
    if (/\[[a-z\-\/]+\]/.test(s) && /discrepanc/i.test(s) && !/0 discrepanc/i.test(s)) return { passed: false, summary: "discrepancies reported" };
    if (/PASS|confirmed|no discrepancies/i.test(s)) return { passed: true, summary: "row count confirmed" };
    return { passed: null, summary: "no verdict line found" };
  }
  if (kind === "sanity") {
    if (/data\.js OK/.test(s)) return { passed: true, summary: (/data\.js OK[^\n]*/.exec(s) || ["data.js OK"])[0] };
    if (/Error/.test(s)) return { passed: false, summary: "sanity check threw" };
    return { passed: null, summary: "no verdict line found" };
  }
  return { passed: null, summary: "" };
}

function currentBranch() {
  try {
    var head = fs.readFileSync(path.join(REPO_ROOT, ".git", "HEAD"), "utf8").trim();
    var m = /^ref: refs\/heads\/(.+)$/.exec(head);
    return m ? m[1] : head.slice(0, 12);
  } catch (e) {
    return null;
  }
}

module.exports = {
  REPO_ROOT: REPO_ROOT,
  AUDIT_PATH: AUDIT_PATH,
  STATE_PATH: STATE_PATH,
  STAGES: STAGES,
  STAGE_LABELS: STAGE_LABELS,
  nowIso: nowIso,
  readStdinJson: readStdinJson,
  audit: audit,
  readAudit: readAudit,
  emptyState: emptyState,
  readState: readState,
  writeState: writeState,
  setStage: setStage,
  isAppFile: isAppFile,
  testCommandKind: testCommandKind,
  testVerdict: testVerdict,
  currentBranch: currentBranch
};
