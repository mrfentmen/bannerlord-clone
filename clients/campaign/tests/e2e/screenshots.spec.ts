/**
 * Screenshots at both widths, for the report.
 *
 * Kept as a Playwright spec rather than a shell script so the same navigation the
 * tests use produces the images, and so a failure here is a failure someone sees.
 * Writes into screenshots/, which is checked in so the direction lock can be
 * reviewed against what the client actually looks like.
 */

import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const OUT = "screenshots";

async function boot(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("side-grid")).toBeVisible({ timeout: 180_000 });
}

async function start(page: Page): Promise<void> {
  for (const id of ["side-mountain-alliance", "step-1", "state-CO", "step-2", "role-ruler-in-waiting", "step-3", "start-next"]) {
    await page.getByTestId(id).click();
  }
  // Faction select is followed by the character maker, which only requires a name;
  // every later step can be accepted as-is.
  await expect(page.getByTestId("char-first-name")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("char-first-name").fill("Dax");
  await page.getByTestId("char-last-name").fill("Rurik");
  for (let i = 0; i < 7; i += 1) await page.getByTestId("maker-next").click();
  await page.getByTestId("maker-done").click();
  await expect(page.getByTestId("town-panel")).toBeVisible({ timeout: 60_000 });
}

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

// Each project writes its own width, so a 390 px shot is never taken at 1440 px.
test("desktop screenshots", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop widths only");
  const shot = async (name: string): Promise<void> => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  };

  await boot(page);
  await shot("01-desktop-start-screen");

  await start(page);
  await shot("02-desktop-town-golden");

  await page.getByTestId("town-panel").getByTestId("why-unrest").click();
  await expect(page.getByTestId("why-chain")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("why-link").nth(1).click();
  await shot("03-desktop-why-chain");

  // Back to the town panel, which is where the action buttons live.
  await page.getByRole("button", { name: "Close Why" }).click();
  await expect(page.getByTestId("open-market")).toBeVisible();
  await page.getByTestId("open-market").first().click();
  await expect(page.getByTestId("market-table")).toBeVisible();
  await page.locator("#market-quantity").fill("20");
  await page.getByTestId("buy-grain").click();
  await expect(page.getByTestId("market-message")).toBeVisible({ timeout: 20_000 });
  await shot("04-desktop-market-after-trade");

  await page.getByTestId("open-march").first().click();
  await expect(page.getByTestId("march-costs")).toBeVisible({ timeout: 20_000 });
  await shot("05-desktop-march-planner");

  await page.getByTestId("open-ledger").first().click();
  await expect(page.getByTestId("ledger-net-table")).toBeVisible();
  await shot("06-desktop-ledger");

  await page.getByTestId("open-roster").first().click();
  await expect(page.getByTestId("ruler-list")).toBeVisible();
  await page.getByTestId("ruler-list").locator("button").first().click();
  await expect(page.getByTestId("ruler-card")).toBeVisible();
  await shot("07-desktop-ruler-card");

  await page.getByTestId("open-data-source").first().click();
  await expect(page.getByTestId("data-source-panel")).toBeVisible();
  await shot("08-desktop-data-sources");

  // A wide shot of the map on its own, so the terrain and the grade can be judged
  // without the panels over it.
  await page.getByTestId("data-source-close").click();
  await page.keyboard.press("Escape");
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(1200);
  await shot("09-desktop-map");
});

test("small-screen screenshots", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "small-screen", "small-screen widths only");
  const shot = async (name: string): Promise<void> => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  };

  await boot(page);
  await shot("10-small-start-screen");

  await start(page);
  await shot("11-small-town-golden");

  await page.getByTestId("town-panel").getByTestId("why-unrest").click();
  await expect(page.getByTestId("why-chain")).toBeVisible({ timeout: 20_000 });
  await shot("12-small-why-chain");

  await page.getByRole("button", { name: "Close Why" }).click();
  await expect(page.getByTestId("open-market")).toBeVisible();
  await page.getByTestId("open-market").first().click();
  await expect(page.getByTestId("market-table")).toBeVisible();
  await shot("13-small-market");

  await page.getByTestId("open-ledger").first().click();
  await expect(page.getByTestId("ledger-net-table")).toBeVisible();
  await shot("14-small-ledger");
});
