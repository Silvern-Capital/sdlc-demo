#!/usr/bin/env node
// PreToolUse hook on Bash: only plain pushes get through.
//
// Claude Code passes the tool call as JSON on stdin. Exit 2 blocks the
// command and puts whatever this script printed to stderr into Claude's
// context. Exit 0 lets it run. Not part of the workshop flow; it is here as
// the example of a guard on an action rather than a check on a result.
//
// Deny by default: any command segment that runs `git push` must be a plain
// push to origin (`git push`, `git push origin <branch>`, optionally -u).
// Anything else that pushes (--force, -f, --force-with-lease, --mirror,
// --delete, a +refspec, quoting, substitution, git -c tricks) is refused.
// The real guard is branch protection on GitHub; this one just stops the
// agent from trying.
var fs = require("fs");

var input;
try {
  input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
} catch (e) {
  process.stderr.write("Blocked: could not read the tool call.\n");
  process.exit(2);
}
var cmd = String((input.tool_input && input.tool_input.command) || "");

// Split into simple commands on ; && || | and newlines, then judge each.
var segments = cmd.split(/\n|;|&&|\|\||\|/);
var allowed = /^\s*git\s+push(\s+(-u|--set-upstream))?(\s+origin(\s+[A-Za-z0-9._\/-]+)?)?\s*$/;

for (var i = 0; i < segments.length; i++) {
  var seg = segments[i];
  var touchesPush = /\bgit\b/.test(seg) && /\bpush\b/.test(seg);
  var indirect = /\b(sh|bash|zsh|eval|xargs|env)\b/.test(seg) && /\bpush\b/.test(seg);
  if (!touchesPush && !indirect) continue;
  if (allowed.test(seg)) continue;
  process.stderr.write(
    "Blocked: only a plain `git push [-u] origin <branch>` is allowed here.\n" +
    "This repo never rewrites or deletes shared history.\n" +
    "Command was: " + cmd + "\n"
  );
  process.exit(2);
}
process.exit(0);
