// Plain Node tests, no browser: node --test tests/*.test.js
// csv.js exposes window.toCsv(stores); it must render the fixed header row
// and one row per site with values equal to data.js.
var test = require("node:test");
var assert = require("node:assert");

global.window = {};
require("../data.js");
require("../csv.js");
var STORES = global.window.STORES;
var toCsv = global.window.toCsv;

var COLUMNS = [
  "id", "name", "region", "fillRate",
  "posStatus", "netStatus", "openTickets", "daysOfSupply", "avgRunRate7d"
];

// Minimal CSV field parser: handles double-quoted fields with "" escapes.
function parseLine(line) {
  var fields = [];
  var cur = "";
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line.charAt(i);
    if (inQuotes) {
      if (ch === '"' && line.charAt(i + 1) === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

test("toCsv is a function on window", function () {
  assert.strictEqual(typeof toCsv, "function", "csv.js must expose window.toCsv");
});

test("toCsv(window.STORES) has the fixed header row", function () {
  var lines = toCsv(STORES).split(/\r?\n/).filter(function (l) { return l !== ""; });
  assert.deepStrictEqual(parseLine(lines[0]), COLUMNS);
});

test("missing fields export as empty cells, not 'undefined'", function () {
  var lines = toCsv([{ id: "1", name: "NoRegion" }]).split(/\r?\n/);
  assert.strictEqual(lines[1], "1,NoRegion,,,,,,," );
});

test("toCsv(window.STORES) has one row per site with matching values", function () {
  var lines = toCsv(STORES).split(/\r?\n/).filter(function (l) { return l !== ""; });
  assert.strictEqual(lines.length, STORES.length + 1,
    "expected header + " + STORES.length + " rows, got " + lines.length);
  STORES.forEach(function (s, idx) {
    var row = parseLine(lines[idx + 1]);
    assert.strictEqual(row.length, COLUMNS.length, s.name + " column count");
    COLUMNS.forEach(function (col, c) {
      if (col === "avgRunRate7d") {
        // Skip the dynamic avgRunRate7d check in this loop; test separately below
        return;
      }
      assert.strictEqual(row[c], String(s[col]), s.name + " " + col);
    });
  });
});

test("toCsv avgRunRate7d column has correct average of runRate7d for each store", function () {
  var lines = toCsv(STORES).split(/\r?\n/).filter(function (l) { return l !== ""; });
  STORES.forEach(function (s, idx) {
    var row = parseLine(lines[idx + 1]);
    var avgIndex = COLUMNS.indexOf("avgRunRate7d");
    assert.strictEqual(avgIndex, 8, "avgRunRate7d should be at index 8");

    // Calculate expected average of runRate7d array
    var sum = 0;
    for (var i = 0; i < s.runRate7d.length; i++) {
      sum += s.runRate7d[i];
    }
    var expectedAvg = sum / s.runRate7d.length;
    var expectedAvgStr = String(expectedAvg);

    assert.strictEqual(row[avgIndex], expectedAvgStr,
      s.name + " avgRunRate7d should be " + expectedAvgStr);
  });
});
