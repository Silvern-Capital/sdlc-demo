// Beacon Site Health dashboard e2e — asserts the rendered UI against data.js
// (window.SITES is the single source of truth).
var test = require("@playwright/test").test;
var expect = require("@playwright/test").expect;

global.window = {};
require("../data.js");
var SITES = global.window.SITES;
var VALID_STATUSES = ["ok", "warn", "down"];

test.describe("Beacon Site Health dashboard", function () {

  test("page loads, all store cards render, no console errors", async function ({ page }) {
    var consoleErrors = [];
    page.on("console", function (msg) {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", function (err) {
      consoleErrors.push(String(err));
    });

    await page.goto("/");
    await expect(page.locator("#grid .card")).toHaveCount(SITES.length);
    expect(SITES.length).toBe(6);
    expect(consoleErrors).toEqual([]);
  });

  test("Avg fill-rate KPI matches the value computed from window.SITES", async function ({ page }) {
    var sum = SITES.reduce(function (a, s) { return a + s.fillRate; }, 0);
    var expected = (sum / SITES.length).toFixed(1) + "%";

    await page.goto("/");
    var kpi = page.locator(".kpi", { hasText: "Avg uptime" });
    await expect(kpi.locator(".kpi-value")).toHaveText(expected);
  });

  test("every status pill has exactly one valid status class matching data.js", async function ({ page }) {
    await page.goto("/");
    var cards = page.locator("#grid .card");
    await expect(cards).toHaveCount(SITES.length);

    for (var i = 0; i < SITES.length; i++) {
      var store = SITES[i];
      var pills = cards.nth(i).locator(".pill");

      // First pill = POS, second = network (render order in index.html).
      var expectedByPill = [store.posStatus, store.netStatus];
      for (var p = 0; p < 2; p++) {
        var classAttr = await pills.nth(p).getAttribute("class");
        var statusClasses = classAttr.split(/\s+/).filter(function (c) {
          return c !== "pill" && c !== "";
        });

        expect(
          statusClasses,
          store.name + " pill " + p + " must carry exactly one status class, got: " + JSON.stringify(statusClasses)
        ).toHaveLength(1);
        expect(
          VALID_STATUSES,
          store.name + " pill " + p + " class '" + statusClasses[0] + "' is not in the ok|warn|down vocabulary"
        ).toContain(statusClasses[0]);
        expect(
          statusClasses[0],
          store.name + " pill " + p + " does not match data.js status '" + expectedByPill[p] + "'"
        ).toBe(expectedByPill[p]);
      }
    }
  });

  test("search filters by name/region and trims padded input", async function ({ page }) {
    await page.goto("/");
    var visibleCards = page.locator("#grid .card:visible");

    await page.fill("#store-search", "austin");
    await expect(visibleCards).toHaveCount(1);
    await expect(visibleCards.first().locator(".store-name")).toHaveText("Silvern Capital — Austin");

    await page.fill("#store-search", " austin ");
    await expect(visibleCards).toHaveCount(1);

    await page.fill("#store-search", "");
    await expect(visibleCards).toHaveCount(SITES.length);
  });
});
