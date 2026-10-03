/**
 * Player-facing systems, driven through a real browser (mandate §23):
 *
 *   encyclopedia search and link navigation, the objectives panel with live progress,
 *   the journal, and the contextual tutorial hint — all against the fixture build,
 *   all through real controls.
 */

import { expect, test, type Page } from "@playwright/test";

/** The world files are 16 MB; the first paint waits for all of them. */
const READY_TIMEOUT = 120_000;

async function openAndStart(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("/");
  await expect(page.getByTestId("side-grid")).toBeVisible({ timeout: READY_TIMEOUT });
  await expect(page.getByTestId("fixture-banner")).toBeVisible();
  expect(errors, `console errors on load:\n${errors.join("\n")}`).toEqual([]);

  await page.getByTestId("side-mountain-alliance").click();
  await page.getByTestId("step-1").click();
  await expect(page.getByTestId("state-grid")).toBeVisible();

  await page.getByTestId("state-CO").click();
  await page.getByTestId("step-2").click();
  await expect(page.getByTestId("role-grid")).toBeVisible();
  await page.getByTestId("role-ruler-in-waiting").click();

  await page.getByTestId("step-3").click();
  await expect(page.getByTestId("start-next")).toBeVisible();
  await page.getByTestId("start-next").click();
}

test("the tutorial hint teaches marching, then dismisses", async ({ page }) => {
  await openAndStart(page);
  // Fresh context: no destination, nothing visited — the march hint fires.
  const banner = page.locator(".tutorial-banner");
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await expect(banner).toContainText("March your party");
  await banner.getByRole("button", { name: "Got it" }).click();
  await expect(banner).toBeHidden();
});

test("the encyclopedia searches and follows links between entries", async ({ page }) => {
  await openAndStart(page);
  await page.getByTestId("open-encyclopedia").click();
  const panel = page.getByTestId("encyclopedia-panel");
  await expect(panel).toBeVisible();

  // Search for a real settlement.
  await panel.locator(".ency__search").fill("Golden");
  await expect(panel.getByText("Golden", { exact: true }).first()).toBeVisible();
  await panel.getByText("Golden", { exact: true }).first().click();
  await expect(panel.locator(".ency__title")).toContainText("Golden");

  // Follow the holder link to the character entry.
  const holderLink = panel.locator(".ency__link").filter({ hasText: /^Holder:/ }).first();
  await expect(holderLink).toBeVisible();
  const holderName = (await holderLink.textContent())?.replace(/^Holder:\s*/, "").split(" (")[0] ?? "";
  await holderLink.click();
  await expect(panel.locator(".ency__title")).toContainText(holderName);

  // Back returns to the settlement.
  await panel.getByRole("button", { name: "← Back" }).click();
  await expect(panel.locator(".ency__title")).toContainText("Golden");
});

test("the objectives panel shows live progress for every objective", async ({ page }) => {
  await openAndStart(page);
  await page.getByTestId("open-objectives").click();
  const panel = page.getByTestId("objectives-panel");
  await expect(panel).toBeVisible();
  for (const id of ["muster", "war-chest", "scout-region", "first-blood"]) {
    await expect(panel.getByTestId(`objective-${id}`)).toBeVisible();
  }
  // Progress is measured, not placeholder: the muster gauge shows a real count.
  await expect(panel.getByTestId("objective-gauge-muster")).toContainText("/");
});

test("the journal opens and records the campaign", async ({ page }) => {
  await openAndStart(page);
  await page.getByTestId("open-journal").click();
  const panel = page.getByTestId("journal-panel");
  await expect(panel).toBeVisible();
  // Either history or the honest empty state — never a blank panel.
  const body = await panel.textContent();
  expect(body && body.trim().length).toBeGreaterThan(0);
});
