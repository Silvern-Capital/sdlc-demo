#!/usr/bin/env node
// PreToolUse hook on Bash: refuse a force push before it runs.
//
// Claude Code passes the tool call as JSON on stdin. Exit 2 blocks the
// command and puts whatever this script printed to stderr into Claude's
// context. Exit 0 lets it run. Not part of the workshop flow; it is here as
// the example of a guard on an action rather than a check on a result.
var fs = require("fs");

var input;
try {
  input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
} catch (e) {
  input = {};
}
var cmd = String((input.tool_input && input.tool_input.command) || "");

// git push --force, git push -f, --force-with-lease, and the same through
// any chained or piped command line.
var forcePush = /\bgit\b[^\n;&|]*\bpush\b[^\n;&|]*(\s--force(-with-lease)?\b|\s-f\b|\s-[a-zA-Z]*f[a-zA-Z]*\b)/;
if (forcePush.test(cmd)) {
  process.stderr.write(
    "Blocked: force push. This repo never rewrites shared history.\n" +
    "Open a new commit instead, or ask a person to do it deliberately.\n" +
    "Command was: " + cmd + "\n"
  );
  process.exit(2);
}
process.exit(0);
