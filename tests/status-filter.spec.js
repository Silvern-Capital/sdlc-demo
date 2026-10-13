// Status dropdown e2e — a site's status is its worst of posStatus / netStatus
// (down > warn > ok), and the dropdown ANDs with the text filter.
var test = require("@playwright/test").test;
var expect = require("@playwright/test").expect;

global.window = {};
require("../data.js");
var STORES = global.window.STORES;
var RANK = { ok: 0, warn: 1, down: 2 };

function siteStatus(s) {
  return RANK[s.netStatus] > RANK[s.posStatus] ? s.netStatus : s.posStatus;
}

function namesWhere(fn) {
  return STORES.filter(fn).map(function (s) { return s.name; });
}

test.describe("status filter dropdown", function () {

  test("defaults to All statuses and shows every site", async function ({ page }) {
    await page.goto("/");
    var select = page.getByLabel("Filter by status");
    await expect(select).toHaveValue("");
    await expect(page.locator("#grid .card:visible")).toHaveCount(STORES.length);
  });

  test("each status shows exactly the sites whose worst status matches", async function ({ page }) {
    await page.goto("/");
    var visibleNames = page.locator("#grid .card:visible .store-name");

    var statuses = ["ok", "warn", "down"];
    for (var i = 0; i < statuses.length; i++) {
      var status = statuses[i];
      await page.selectOption("#status-filter", status);
      var expected = namesWhere(function (s) { return siteStatus(s) === status; });
      expect(expected.length, "data.js should have a site that is " + status).toBeGreaterThan(0);
      await expect(visibleNames).toHaveText(expected);
    }

    await page.selectOption("#status-filter", "");
    await expect(visibleNames).toHaveCount(STORES.length);
  });

  test("combines with the text filter", async function ({ page }) {
    await page.goto("/");
    var visibleNames = page.locator("#grid .card:visible .store-name");

    await page.selectOption("#status-filter", "ok");
    await page.fill("#store-search", " us · ");
    await expect(visibleNames).toHaveText(namesWhere(function (s) { return siteStatus(s) === "ok"; }));

    await page.fill("#store-search", "austin");
    await expect(visibleNames).toHaveCount(0);

    await page.selectOption("#status-filter", "down");
    await expect(visibleNames).toHaveText(["Silvern Capital — Austin"]);

    await page.fill("#store-search", "");
    await page.selectOption("#status-filter", "");
    await expect(visibleNames).toHaveCount(STORES.length);
  });
});
