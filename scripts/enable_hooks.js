// Wire the two hooks into .claude/settings.json (step 5 of the workshop).
// Usage: node scripts/enable_hooks.js            adds the "hooks" block
//        node scripts/enable_hooks.js --disable  removes it again
// Reads the block from .claude/hooks/hooks.json so the file you looked at is
// the file that gets applied, but only accepts the two commands this repo
// ships: anything else in that file is refused. Hooks are loaded when a
// session starts, so restart Claude Code afterwards (claude --continue keeps
// the conversation).
var fs = require("fs");
var path = require("path");
var ROOT = path.join(__dirname, "..");
var SETTINGS = path.join(ROOT, ".claude", "settings.json");
var HOOKS = path.join(ROOT, ".claude", "hooks", "hooks.json");

// The only hooks this script will ever install.
var ALLOWED = {
  PostToolUse: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/test-changed.js"',
  Stop: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/stop-check.js"'
};

var settings = JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
if (process.argv.indexOf("--disable") !== -1) {
  delete settings.hooks;
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + "\n");
  console.log("hooks removed from .claude/settings.json");
  process.exit(0);
}

var block = JSON.parse(fs.readFileSync(HOOKS, "utf8")).hooks || {};
var events = Object.keys(block).sort();
if (events.join(",") !== "PostToolUse,Stop") {
  console.error("refusing: hooks.json must define exactly PostToolUse and Stop, got: " + events.join(", "));
  process.exit(1);
}
events.forEach(function (ev) {
  var entries = block[ev];
  if (!Array.isArray(entries) || entries.length !== 1 || !Array.isArray(entries[0].hooks) || entries[0].hooks.length !== 1) {
    console.error("refusing: " + ev + " must have exactly one entry with one command");
    process.exit(1);
  }
  var h = entries[0].hooks[0];
  if (h.type !== "command" || h.command !== ALLOWED[ev]) {
    console.error("refusing: " + ev + " command is not the one this repo ships:\n  " + h.command);
    process.exit(1);
  }
  var matcher = entries[0].matcher;
  if (ev === "PostToolUse" && matcher !== "Edit|Write|MultiEdit") {
    console.error("refusing: PostToolUse matcher must be Edit|Write|MultiEdit, got: " + matcher);
    process.exit(1);
  }
});

settings.hooks = block;
fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + "\n");
console.log("hooks added to .claude/settings.json; these commands will run:");
events.forEach(function (ev) {
  var e = block[ev][0];
  console.log("  " + ev + (e.matcher ? " on " + e.matcher : "") + ":  " + e.hooks[0].command);
});
console.log("restart Claude Code to load them:  exit, then  claude --continue");
