// Plain Node tests, no browser: node --test tests/*.test.js
// csv.js exposes window.toCsv(stores) for the header's "Export CSV" button.
// These parse its output as CSV and check it against window.STORES exactly.
var test = require("node:test");
var assert = require("node:assert");

global.window = {};
require("../data.js");
require("../csv.js");
var STORES = global.window.STORES;
var toCsv = global.window.toCsv;

var COLUMNS = ["id", "name", "region", "fillRate", "posStatus", "netStatus", "openTickets", "daysOfSupply"];

// Minimal RFC 4180 parser: handles quoted fields, "" escapes, CRLF or LF rows.
function parseCsv(text) {
  var rows = [];
  var row = [];
  var field = "";
  var inQuotes = false;
  var i = 0;
  while (i < text.length) {
    var ch = text.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === ",") { row.push(field); field = ""; i += 1; continue; }
    if (ch === "\r") { i += 1; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i += 1; continue; }
    field += ch; i += 1;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

test("csv.js exposes window.toCsv as a function", function () {
  assert.strictEqual(typeof toCsv, "function", "window.toCsv must be a function");
});

test("toCsv header row lists the eight export columns in order", function () {
  var rows = parseCsv(toCsv(STORES));
  assert.deepStrictEqual(rows[0], COLUMNS, "header row");
});

test("toCsv emits one row per site with values equal to the data", function () {
  var rows = parseCsv(toCsv(STORES));
  assert.strictEqual(rows.length, STORES.length + 1, "header + one row per site");
  STORES.forEach(function (s, i) {
    var row = rows[i + 1];
    assert.strictEqual(row.length, COLUMNS.length, s.name + " column count");
    COLUMNS.forEach(function (col, c) {
      assert.strictEqual(row[c], String(s[col]), s.name + " " + col);
    });
  });
});

test("toCsv does not mutate window.STORES", function () {
  var before = JSON.stringify(STORES);
  toCsv(STORES);
  assert.strictEqual(JSON.stringify(STORES), before, "STORES changed");
});
