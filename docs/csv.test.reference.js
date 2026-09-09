// Reference version of tests/csv.test.js, the test Claude writes first in
// step 3 of the workshop. Fallback only: copy it to tests/csv.test.js if a
// live run goes sideways. Plain Node, no browser: node --test tests/*.test.js
var test = require("node:test");
var assert = require("node:assert");

global.window = {};
require("../data.js");
require("../csv.js");

var COLUMNS = ["id", "name", "region", "fillRate", "posStatus", "netStatus", "openTickets", "daysOfSupply"];

// A small CSV parser that understands quoted fields (commas and doubled
// quotes inside them). Splitting on commas alone would pass a broken export.
function parseCsv(text) {
  var rows = [], row = [], field = "", inQuotes = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

test("toCsv matches window.STORES", function () {
  var stores = window.STORES;
  var rows = parseCsv(window.toCsv(stores));
  assert.deepStrictEqual(rows[0], COLUMNS);
  assert.strictEqual(rows.length, stores.length + 1);
  stores.forEach(function (s, i) {
    var r = rows[i + 1];
    assert.strictEqual(r.length, COLUMNS.length, s.name + " has " + r.length + " cells");
    COLUMNS.forEach(function (c, j) {
      assert.strictEqual(r[j], String(s[c]), s.name + " " + c);
    });
  });
});
