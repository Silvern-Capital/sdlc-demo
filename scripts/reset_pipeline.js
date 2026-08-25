#!/usr/bin/env node
// Start a fresh demo run: empty the audit log and reset pipeline/state.json.
// Usage: node scripts/reset_pipeline.js
var fs = require("fs");
var path = require("path");
var lib = require(path.join(__dirname, "..", "hooks", "lib"));

fs.mkdirSync(path.dirname(lib.AUDIT_PATH), { recursive: true });
fs.writeFileSync(lib.AUDIT_PATH, "");
var state = lib.emptyState();
state.stages.branch.name = lib.currentBranch();
lib.writeState(state);
console.log("reset " + lib.AUDIT_PATH + " and " + lib.STATE_PATH);
