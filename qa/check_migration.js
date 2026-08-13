// Migration QA check — validates qa/data_migrated.json against data.js
// (the source of truth). Reports every discrepancy with the check that
// proves it; exits 1 if any are found.
//
// Usage: node qa/check_migration.js
var path = require("path");

global.window = {};
require(path.join(__dirname, "..", "data.js"));
var SOURCE = global.window.SITES;
var MIGRATED = require(path.join(__dirname, "data_migrated.json"));

var VALID_STATUSES = ["ok", "warn", "down"];
var STATUS_FIELDS = ["posStatus", "netStatus"];
var FIELDS = ["name", "region", "fillRate", "posStatus", "netStatus", "openTickets", "daysOfSupply", "runRate7d"];

var discrepancies = [];

function byId(rows) {
  var map = {};
  rows.forEach(function (r) { map[r.id] = r; });
  return map;
}

var srcById = byId(SOURCE);
var migById = byId(MIGRATED);

// Check 1 — row count + id integrity (missing / unexpected / duplicate ids)
var missingIds = SOURCE.filter(function (s) { return !migById[s.id]; }).map(function (s) { return s.id + " (" + s.name + ")"; });
var extraIds = MIGRATED.filter(function (m) { return !srcById[m.id]; }).map(function (m) { return m.id; });
var dupIds = MIGRATED.map(function (m) { return m.id; }).filter(function (id, i, all) { return all.indexOf(id) !== i; });

if (MIGRATED.length !== SOURCE.length || missingIds.length || extraIds.length) {
  discrepancies.push(
    "[row-count/id-integrity] expected " + SOURCE.length + " rows, found " + MIGRATED.length +
    (missingIds.length ? " — missing: " + missingIds.join(", ") : "") +
    (extraIds.length ? " — unexpected: " + extraIds.join(", ") : "")
  );
}
if (dupIds.length) {
  discrepancies.push("[id-integrity] duplicate ids in migrated data: " + dupIds.join(", "));
}

// Check 2 — status vocabulary on migrated rows
MIGRATED.forEach(function (m) {
  STATUS_FIELDS.forEach(function (f) {
    if (VALID_STATUSES.indexOf(m[f]) === -1) {
      discrepancies.push(
        "[status-vocabulary] " + m.name + " (id " + m.id + ") " + f + " = \"" + m[f] +
        "\" — not in ok|warn|down"
      );
    }
  });
});

// Check 3 — per-field value drift for rows present in both sets.
// Status fields with an INVALID migrated value are already reported by the
// vocabulary check and are skipped here so each defect is reported once.
MIGRATED.forEach(function (m) {
  var s = srcById[m.id];
  if (!s) return;
  FIELDS.forEach(function (f) {
    if (STATUS_FIELDS.indexOf(f) !== -1 && VALID_STATUSES.indexOf(m[f]) === -1) return;
    var same = f === "runRate7d"
      ? JSON.stringify(s[f]) === JSON.stringify(m[f])
      : s[f] === m[f];
    if (!same) {
      discrepancies.push(
        "[field-drift] " + s.name + " (id " + s.id + ") " + f + ": source " +
        JSON.stringify(s[f]) + " → migrated " + JSON.stringify(m[f])
      );
    }
  });
});

if (discrepancies.length === 0) {
  console.log("MIGRATION QA: PASS — " + MIGRATED.length + " rows match data.js");
  process.exit(0);
}

console.log("MIGRATION QA: FAIL — " + discrepancies.length + " discrepancies found\n");
discrepancies.forEach(function (d, i) {
  console.log("  " + (i + 1) + ". " + d);
});
process.exit(1);
