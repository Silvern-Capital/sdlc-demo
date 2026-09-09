// Plain Node tests, no browser: node --test tests/*.test.js
// csv.js exposes window.toCsv(stores); the "Export CSV" button in index.html
// downloads its output as beacon-sites.csv. These tests parse that text as
// CSV and check it against window.STORES, the single source of truth.
var test = require("node:test");
var assert = require("node:assert");

global.window = {};
require("../data.js");
require("../csv.js");
var STORES = global.window.STORES;
var toCsv = global.window.toCsv;

var COLUMNS = ["id", "name", "region", "fillRate",
  "posStatus", "netStatus", "openTickets", "daysOfSupply"];

// Minimal RFC 4180 parser: handles quoted fields, "" escapes, CRLF or LF.
function parseCsv(text) {
  var rows = [];
  var row = [];
  var field = "";
  var inQuotes = false;
  var i = 0;
  while (i < text.length) {
    var c = text.charAt(i);
    if (inQuotes) {
      if (c === '"') {
        if (text.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"') { inQuotes = true; i += 1; continue; }
    if (c === ",") { row.push(field); field = ""; i += 1; continue; }
    if (c === "\r" && text.charAt(i + 1) === "\n") { i += 1; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i += 1; continue; }
    field += c; i += 1;
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

test("toCsv writes one row per site with values equal to the data", function () {
  var rows = parseCsv(toCsv(STORES));
  assert.strictEqual(rows.length, STORES.length + 1, "header + one row per site");
  STORES.forEach(function (s, i) {
    var expected = COLUMNS.map(function (col) { return String(s[col]); });
    assert.deepStrictEqual(rows[i + 1], expected, "row for site " + s.id);
  });
});

test("toCsv quotes fields that contain commas, quotes or newlines", function () {
  var tricky = [{
    id: "9",
    name: 'Silvern "HQ", Annex',
    region: "Line1\nLine2",
    fillRate: 50,
    posStatus: "ok",
    netStatus: "ok",
    openTickets: 0,
    daysOfSupply: 1
  }];
  var rows = parseCsv(toCsv(tricky));
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(rows[1], ["9", 'Silvern "HQ", Annex', "Line1\nLine2", "50", "ok", "ok", "0", "1"]);
});

test("toCsv of an empty fleet is just the header row", function () {
  var rows = parseCsv(toCsv([]));
  assert.deepStrictEqual(rows, [COLUMNS]);
});
