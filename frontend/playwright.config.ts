import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure", screenshot: "only-on-failure", channel: "msedge", timezoneId: "Asia/Seoul" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Edge"], viewport: { width: 1440, height: 1100 } } }],
  webServer: { command: `${process.platform === "win32" ? "npm.cmd" : "npm"} run dev`, url: "http://127.0.0.1:3000", reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
