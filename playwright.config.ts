import { defineConfig, devices } from "@playwright/test"

const PORT = Number(process.env.E2E_PORT ?? 3100)
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_SITE_URL: baseURL,
      ENABLE_E2E_TEST_ROUTES: process.env.ENABLE_E2E_TEST_ROUTES ?? "true",
      E2E_TEST_SECRET: process.env.E2E_TEST_SECRET ?? "local-e2e-secret",
      AI_PROVIDER_MOCK: "true",
      AI_BUDGET_FAIL_OPEN: process.env.AI_BUDGET_FAIL_OPEN ?? "true",
      ALLOW_AI_WITHOUT_REDIS: process.env.ALLOW_AI_WITHOUT_REDIS ?? "1",
      WAF_DRY_RUN: process.env.WAF_DRY_RUN ?? "true",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
