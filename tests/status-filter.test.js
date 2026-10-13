// Plain Node tests, no browser: the status dropdown in index.html must sit
// before the text filter and only offer the fixed status vocabulary.
var test = require("node:test");
var assert = require("node:assert");
var fs = require("fs");
var path = require("path");

var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
var row = (html.match(/<div class="searchrow">([\s\S]*?)<\/div>/) || [])[1] || "";

test("status dropdown sits left of the text filter in the search row", function () {
  var select = row.indexOf('id="status-filter"');
  var input = row.indexOf('id="store-search"');
  assert.ok(select !== -1, "#status-filter missing from .searchrow");
  assert.ok(input !== -1, "#store-search missing from .searchrow");
  assert.ok(select < input, "#status-filter must come before #store-search");
  assert.ok(/<select[^>]*id="status-filter"[^>]*aria-label="Filter by status"/.test(row), "select needs aria-label=\"Filter by status\"");
});

test("status dropdown offers All plus ok | warn | down", function () {
  var options = [];
  var re = /<option value="([^"]*)">([^<]*)<\/option>/g;
  var m;
  while ((m = re.exec(row)) !== null) options.push([m[1], m[2]]);
  assert.deepStrictEqual(options, [
    ["", "All statuses"],
    ["ok", "Operational"],
    ["warn", "Degraded"],
    ["down", "Down"]
  ]);
});
