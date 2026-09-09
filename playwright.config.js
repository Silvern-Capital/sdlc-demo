// Playwright config — chromium only, headless, auto-starts serve.js on :8000.
var defineConfig = require("@playwright/test").defineConfig;

module.exports = defineConfig({
  testDir: "./tests",
  // Only the Playwright specs; *.test.js files are node:test and run with node --test.
  testMatch: /.*\.spec\.js$/,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:8000",
    headless: true,
    // Local runs drive the installed Google Chrome (zero download);
    // CI downloads playwright chromium instead.
    channel: process.env.CI ? undefined : "chrome",
    // Demo mode (npm run test:e2e:headed): slow every action down so the
    // audience can watch Playwright drive the browser.
    launchOptions: { slowMo: process.env.SLOWMO ? Number(process.env.SLOWMO) : 0 }
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } }
  ],
  webServer: {
    command: "node serve.js",
    url: "http://localhost:8000",
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});
