// Beacon Site Health gated SDLC demo. The policy, in one readable file.
//
// A hook is a small program Claude Code runs at a fixed point in the agent's
// work. This file is the policy the hooks enforce. It answers one question:
// "may this tool call run?" It is plain Node with no dependencies so it is
// easy to read on a call and easy to unit test.
//
// Two rules:
//   1. File edits may only land on the app, its tests, QA fixtures, assets,
//      docs, and the agent's own skills and agents (.claude/skills,
//      .claude/agents). The policy itself (hooks, workflows, the settings
//      files that wire the hooks, package files), the audit log, and the
//      pipeline state are protected.
//   2. Shell commands that destroy work or skip the human gate are denied:
//      force pushes, pushes to main, merges, history rewrites, recursive
//      deletes, and merging a pull request from the command line.
//
// Everything else is allowed. Read only tools are always allowed.
var path = require("path");

// Tools that write files. The path they touch is checked against the rules.
var FILE_WRITE_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit"];

// Tools that only read. Always allowed.
var READ_ONLY_TOOLS = ["Read", "Glob", "Grep", "LS", "TodoWrite", "WebFetch", "WebSearch", "Task"];

// Top level directories the agent may write inside.
var ALLOWED_DIRS = ["tests", "qa", "assets", "docs", ".claude"];

// File extensions the agent may create or edit at the repo root.
var ALLOWED_ROOT_EXT = [".html", ".js", ".css", ".md", ".svg"];

// Paths the agent may never write, even though they match a rule above.
// These are the policy, the evidence, and the dependency manifest.
var PROTECTED = [
  ".github/",
  ".claude/settings.json",
  ".claude/settings.local.json",
  ".claude/launch.json",
  ".claude/.cc-writes/",
  ".git/",
  "hooks/",
  "scripts/",
  "audit/",
  "pipeline/",
  "agent-sdk/",
  "node_modules/",
  "qa-agent-plugin/",
  "package.json",
  "package-lock.json",
  "CLAUDE.md",
  "REVIEW.md",
  ".gitignore"
];

// Shell commands that are never allowed. Each entry is [regex, reason].
var FORBIDDEN_SHELL = [
  [/\bgit\s+push\b[^\n;&|]*(--force|-f\b|--force-with-lease|\+\S)/, "force push rewrites shared history"],
  [/\bgit\s+push\b[^\n;&|]*--delete\b/, "deleting remote branches is not allowed"],
  [/\bgit\s+push\b[^\n;&|]*\b(origin\s+)?(main|master)\b/, "pushing to main is reserved for the merge after Gate 1 approval"],
  [/\bgit\s+merge\b/, "merging is the human approval step (Gate 1), not the agent's"],
  [/\bgit\s+rebase\b/, "history rewrites are not allowed"],
  [/\bgit\s+reset\s+--hard\b/, "destructive reset is not allowed"],
  [/\bgit\s+clean\b/, "git clean deletes files"],
  [/\bgit\s+branch\s+(-d|-D|--delete)\b/, "branch deletion is not allowed"],
  [/\bgit\s+filter-branch\b/, "history rewrites are not allowed"],
  [/\bgh\s+pr\s+merge\b/, "merging a pull request is the human approval step (Gate 1)"],
  [/\bgh\s+repo\s+delete\b/, "repository deletion is not allowed"],
  [/(^|[\s;&|])rm\s+(-[a-zA-Z]*[rRf][a-zA-Z]*\s+)+/, "recursive or forced delete is not allowed"],
  [/(^|[\s;&|])rmdir\b/, "rmdir deletes directories"],
  [/\bsudo\b/, "privilege escalation is not allowed"],
  [/\b(curl|wget)\b[^\n]*\|\s*(ba|z|k)?sh\b/, "piping a download into a shell is not allowed"],
  [/\bnpm\s+publish\b/, "publishing packages is not allowed"],
  [/\bchmod\s+(-R\s+)?[0-7]*777\b/, "world writable permissions are not allowed"]
];

function normalize(p) {
  return String(p || "").replace(/\\/g, "/");
}

// Return the path relative to the repo root, or null if it is outside.
function relativeToRepo(filePath, repoRoot) {
  var abs = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
  var rel = normalize(path.relative(repoRoot, path.normalize(abs)));
  if (rel === "" || rel === "." ) return null;
  if (rel.indexOf("../") === 0 || rel === ".." || path.isAbsolute(rel)) return null;
  return rel;
}

function isProtected(rel) {
  for (var i = 0; i < PROTECTED.length; i++) {
    var p = PROTECTED[i];
    if (p.charAt(p.length - 1) === "/") {
      if (rel.indexOf(p) === 0) return true;
    } else if (rel === p) {
      return true;
    }
  }
  return false;
}

// Decide one file write. Returns { decision: "allow"|"deny", reason }.
function decideFilePath(filePath, repoRoot) {
  var rel = relativeToRepo(filePath, repoRoot);
  if (rel === null) {
    return { decision: "deny", reason: filePath + " is outside the repository" };
  }
  if (isProtected(rel)) {
    return { decision: "deny", reason: rel + " is a protected path (policy, evidence, or package files); a person changes these" };
  }
  var top = rel.split("/")[0];
  if (rel.indexOf("/") !== -1) {
    if (ALLOWED_DIRS.indexOf(top) !== -1) {
      return { decision: "allow", reason: rel + " is inside " + top + "/" };
    }
    return { decision: "deny", reason: rel + " is outside the allowed directories (" + ALLOWED_DIRS.join("/, ") + "/)" };
  }
  var ext = path.extname(rel).toLowerCase();
  if (ALLOWED_ROOT_EXT.indexOf(ext) !== -1) {
    return { decision: "allow", reason: rel + " is an app, doc, or asset file at the repo root" };
  }
  return { decision: "deny", reason: rel + " is not an allowed root file type (" + ALLOWED_ROOT_EXT.join(", ") + ")" };
}

// Decide one shell command. Returns { decision, reason }.
function decideShell(command) {
  var cmd = String(command || "");
  for (var i = 0; i < FORBIDDEN_SHELL.length; i++) {
    if (FORBIDDEN_SHELL[i][0].test(cmd)) {
      return { decision: "deny", reason: FORBIDDEN_SHELL[i][1] };
    }
  }
  return { decision: "allow", reason: "command passed the shell rules" };
}

// Decide any tool call. toolInput is the object Claude Code passes to the tool.
function decide(toolName, toolInput, repoRoot) {
  toolInput = toolInput || {};
  if (READ_ONLY_TOOLS.indexOf(toolName) !== -1) {
    return { decision: "allow", reason: "read only tool" };
  }
  if (FILE_WRITE_TOOLS.indexOf(toolName) !== -1) {
    var target = toolInput.file_path || toolInput.notebook_path || "";
    if (!target) return { decision: "deny", reason: toolName + " call has no file_path" };
    return decideFilePath(target, repoRoot);
  }
  if (toolName === "Bash") {
    return decideShell(toolInput.command);
  }
  // Unknown tools (MCP tools and so on) are allowed but recorded in the audit log.
  return { decision: "allow", reason: "tool is not covered by the policy; recorded only" };
}

// A short, human readable view of what a tool call targets.
function summarizeTarget(toolName, toolInput) {
  toolInput = toolInput || {};
  if (toolName === "Bash") return String(toolInput.command || "").slice(0, 160);
  var t = toolInput.file_path || toolInput.notebook_path || toolInput.pattern || toolInput.path || "";
  return String(t).slice(0, 160);
}

module.exports = {
  FILE_WRITE_TOOLS: FILE_WRITE_TOOLS,
  READ_ONLY_TOOLS: READ_ONLY_TOOLS,
  ALLOWED_DIRS: ALLOWED_DIRS,
  ALLOWED_ROOT_EXT: ALLOWED_ROOT_EXT,
  PROTECTED: PROTECTED,
  FORBIDDEN_SHELL: FORBIDDEN_SHELL,
  relativeToRepo: relativeToRepo,
  decideFilePath: decideFilePath,
  decideShell: decideShell,
  decide: decide,
  summarizeTarget: summarizeTarget
};
