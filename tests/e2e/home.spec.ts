import { expect, test } from "@playwright/test"

test("pricing explains AI credits and writing power levels", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByText("Learn & Explore")).toBeVisible()
  await expect(page.getByText("Build & Create")).toBeVisible()
  await expect(page.getByText("Produce & Scale")).toBeVisible()
  await expect(page.getByText("AI credits are used based on content length and complexity")).toBeVisible()
  await expect(page.getByText("Need more? Add 100K AI credits for ₹99").first()).toBeVisible()
})
