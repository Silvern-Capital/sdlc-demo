// Beacon Site Health dashboard e2e — asserts the rendered UI against data.js
// (window.STORES is the single source of truth).
var test = require("@playwright/test").test;
var expect = require("@playwright/test").expect;

global.window = {};
require("../data.js");
var STORES = global.window.STORES;
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
    await expect(page.locator("#grid .card")).toHaveCount(STORES.length);
    expect(STORES.length).toBe(6);
    expect(consoleErrors).toEqual([]);
  });

  test("Avg fill-rate KPI matches the value computed from window.STORES", async function ({ page }) {
    var sum = STORES.reduce(function (a, s) { return a + s.fillRate; }, 0);
    var expected = (sum / STORES.length).toFixed(1) + "%";

    await page.goto("/");
    var kpi = page.locator(".kpi", { hasText: "Avg uptime" });
    await expect(kpi.locator(".kpi-value")).toHaveText(expected);
  });

  test("every status pill has exactly one valid status class matching data.js", async function ({ page }) {
    await page.goto("/");
    var cards = page.locator("#grid .card");
    await expect(cards).toHaveCount(STORES.length);

    for (var i = 0; i < STORES.length; i++) {
      var store = STORES[i];
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

  test("header shows the tagline directly under the title", async function ({ page }) {
    await page.goto("/");
    var tagline = page.locator(".htext .htagline");
    await expect(tagline).toHaveText("Fleet health at a glance");

    // Tagline sits below the title in the header text block.
    var titleBox = await page.locator(".htext .htitle").boundingBox();
    var taglineBox = await tagline.boundingBox();
    expect(taglineBox.y).toBeGreaterThan(titleBox.y);
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
    await expect(visibleCards).toHaveCount(STORES.length);
  });
});
