// Wire the two hooks into .claude/settings.json (step 5 of the workshop).
// Usage: node scripts/enable_hooks.js            adds the "hooks" block
//        node scripts/enable_hooks.js --disable  removes it again
// Reads the block from .claude/hooks/hooks.json so the file you looked at is
// the file that gets applied. Hooks are loaded when a session starts, so
// restart Claude Code afterwards (claude --continue keeps the conversation).
var fs = require("fs");
var path = require("path");
var ROOT = path.join(__dirname, "..");
var SETTINGS = path.join(ROOT, ".claude", "settings.json");
var HOOKS = path.join(ROOT, ".claude", "hooks", "hooks.json");

var settings = JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
if (process.argv.indexOf("--disable") !== -1) {
  delete settings.hooks;
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + "\n");
  console.log("hooks removed from .claude/settings.json");
  process.exit(0);
}
settings.hooks = JSON.parse(fs.readFileSync(HOOKS, "utf8")).hooks;
fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + "\n");
var events = Object.keys(settings.hooks);
console.log("hooks added to .claude/settings.json: " + events.join(", "));
console.log("restart Claude Code to load them:  exit, then  claude --continue");
