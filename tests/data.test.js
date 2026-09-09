// Plain Node tests, no browser: node --test tests/*.test.js
// data.js is the single source of truth for the dashboard, so these check
// its shape the same way CI does before anything renders it.
var test = require("node:test");
var assert = require("node:assert");

global.window = {};
require("../data.js");
var STORES = global.window.STORES;
var VALID = ["ok", "warn", "down"];

test("data.js exposes six sites with valid statuses", function () {
  assert.ok(Array.isArray(STORES), "window.STORES must be an array");
  assert.strictEqual(STORES.length, 6);
  STORES.forEach(function (s) {
    assert.ok(VALID.indexOf(s.posStatus) !== -1, s.name + " posStatus " + s.posStatus);
    assert.ok(VALID.indexOf(s.netStatus) !== -1, s.name + " netStatus " + s.netStatus);
    assert.strictEqual(typeof s.fillRate, "number", s.name + " fillRate");
    assert.strictEqual(s.runRate7d.length, 7, s.name + " runRate7d");
  });
});

test("site ids are unique", function () {
  var ids = STORES.map(function (s) { return s.id; });
  assert.strictEqual(new Set(ids).size, ids.length, "duplicate ids: " + ids.join(", "));
});
