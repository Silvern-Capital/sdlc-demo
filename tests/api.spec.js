// TreadNet stores API contract tests — validates /api/stores against the
// documented schema (README "Data shape").
var test = require("@playwright/test").test;
var expect = require("@playwright/test").expect;

var VALID_STATUSES = ["ok", "warn", "down"];

test.describe("stores API contract", function () {

  test("GET /api/stores returns 200 with a non-empty array", async function ({ request }) {
    var res = await request.get("/api/stores");
    expect(res.status()).toBe(200);
    var stores = await res.json();
    expect(Array.isArray(stores)).toBe(true);
    expect(stores.length).toBeGreaterThan(0);
  });

  test("every record matches the documented schema", async function ({ request }) {
    var stores = await (await request.get("/api/stores")).json();

    for (var i = 0; i < stores.length; i++) {
      var s = stores[i];
      var label = "store[" + i + "] (" + (s.name || "unnamed") + ")";

      expect(typeof s.name, label + ".name must be a string").toBe("string");
      expect(typeof s.id, label + ".id must be a string").toBe("string");
      expect(typeof s.region, label + ".region must be a string").toBe("string");
      expect(typeof s.fillRate, label + ".fillRate must be a number").toBe("number");
      expect(typeof s.openTickets, label + ".openTickets must be a number").toBe("number");
      expect(typeof s.daysOfSupply, label + ".daysOfSupply must be a number").toBe("number");

      expect(VALID_STATUSES, label + ".posStatus '" + s.posStatus + "' not in ok|warn|down").toContain(s.posStatus);
      expect(VALID_STATUSES, label + ".netStatus '" + s.netStatus + "' not in ok|warn|down").toContain(s.netStatus);

      expect(Array.isArray(s.runRate7d), label + ".runRate7d must be an array").toBe(true);
      expect(s.runRate7d, label + ".runRate7d must have length 7").toHaveLength(7);
      s.runRate7d.forEach(function (v, d) {
        expect(typeof v, label + ".runRate7d[" + d + "] must be a number").toBe("number");
      });
    }
  });

  test("store ids are unique", async function ({ request }) {
    var stores = await (await request.get("/api/stores")).json();
    var ids = stores.map(function (s) { return s.id; });
    expect(new Set(ids).size, "duplicate store ids found: " + ids.join(", ")).toBe(ids.length);
  });

  test("GET /api/stores/:id returns the matching store, 404 for unknown", async function ({ request }) {
    var stores = await (await request.get("/api/stores")).json();
    var first = stores[0];

    var res = await request.get("/api/stores/" + first.id);
    expect(res.status()).toBe(200);
    var store = await res.json();
    expect(store.id).toBe(first.id);
    expect(store.name).toBe(first.name);

    var missing = await request.get("/api/stores/no-such-store");
    expect(missing.status()).toBe(404);
  });
});
