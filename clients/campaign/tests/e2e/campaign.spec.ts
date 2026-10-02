/**
 * The Phase 2 exit criterion, driven through a real browser:
 *
 *   "a player can walk a party across the map, enter a town, buy and sell goods, see
 *    real stats, and watch prices and unrest respond over time, with the Why panel
 *    explaining at least one real event."
 *
 * The build under test is `vite build --mode fixtures`, which is a production-shaped
 * bundle with the test double swapped in. The world data in it is the real public
 * data: the terrain tiles, the OSM roads and the Census populations. The world state
 * is the test double, because the simulation has not landed. The banner says so, and
 * one assertion checks that it is on screen, so a screenshot of this run cannot be
 * mistaken for the finished game.
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
  // Step 1: the side selection screen, once the world has loaded.
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

  // Faction select is followed by the character maker, which only requires a name;
  // every later step can be accepted as-is.
  await expect(page.getByTestId("char-first-name")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("char-first-name").fill("Dax");
  await page.getByTestId("char-last-name").fill("Rurik");
  for (let i = 0; i < 7; i += 1) await page.getByTestId("maker-next").click();
  await page.getByTestId("maker-done").click();
  await expect(page.getByTestId("open-settings")).toBeVisible({ timeout: 60_000 });
}

/** The canvas renders real WebGL; if it is blank the map did not draw. */
async function expectMapDrew(page: Page): Promise<void> {
  type FrameSample =
    | { ok: false; reason: string }
    | { ok: true; nonBlack: number; total: number; range: number; distinct: number };

  const drawn: FrameSample = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#map");
    if (!canvas) return { ok: false as const, reason: "no canvas" };
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return { ok: false as const, reason: "no webgl context" };
    // Read the framebuffer back. preserveDrawingBuffer is on, so this is the last
    // painted frame rather than a cleared buffer.
    const w = 220;
    const h = 140;
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(
      Math.floor((canvas.width - w) / 2),
      Math.floor((canvas.height - h) / 2),
      w,
      h,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    let nonBlack = 0;
    let min = 255;
    let max = 0;
    const hues = new Set<string>();
    for (let i = 0; i < pixels.length; i += 4) {
      const l = (pixels[i]! + pixels[i + 1]! + pixels[i + 2]!) / 3;
      if (l > 8) nonBlack++;
      min = Math.min(min, pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
      max = Math.max(max, pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
      hues.add(`${pixels[i]! >> 4},${pixels[i + 1]! >> 4},${pixels[i + 2]! >> 4}`);
    }
    return { ok: true as const, nonBlack, total: w * h, range: max - min, distinct: hues.size };
  });
  if (!drawn.ok) {
    throw new Error(`the 3D map did not render: ${drawn.reason}`);
  }
  // Not a black screen.
  expect(drawn.nonBlack / drawn.total).toBeGreaterThan(0.9);
  // Real tonal range, so it is not a flat fill either.
  expect(drawn.range).toBeGreaterThan(40);
  // Enough distinct colour buckets to be terrain, not a grey wash.
  expect(drawn.distinct).toBeGreaterThan(8);
}

test.describe("Phase 2 campaign map client", () => {
  test("loads real terrain, roads and towns, and says where the data came from", async ({ page }) => {
    await openAndStart(page);

    // The campaign map is up, with the HUD on it.
    await expect(page.getByTestId("top-bar")).toBeVisible();
    await expect(page.getByTestId("party-rail")).toBeVisible();
    await expect(page.getByTestId("res-money")).toBeVisible();
    await expect(page.getByTestId("res-food")).toBeVisible();

    await expectMapDrew(page);

    // The data-source panel separates what is real from what is a test double.
    await page.getByTestId("open-data-source").click();
    const panel = page.getByTestId("data-source-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Northern Colorado Front Range");
    await expect(panel).toContainText("OpenStreetMap");
    await expect(panel).toContainText("US Census Bureau");
    await expect(panel).toContainText("SRTM");
    // The honest gap, stated rather than hidden.
    await expect(page.getByTestId("data-source-fixture-note")).toBeVisible();
    await expect(panel.getByTestId("data-source-provider")).toContainText(/fixture/i);
  });

  test("opens a town and shows real stats, with skeletons before data", async ({ page }) => {
    await openAndStart(page);

    // The map opens on the worst town, which is the one with a chain to walk.
    const town = page.getByTestId("town-panel");
    await expect(town).toBeVisible();
    await expect(town).toContainText("Golden");

    // Every gauge the UI_UX.md section 6 list asks for.
    await expect(town.getByTestId("town-food-gauge")).toBeVisible();
    await expect(town.getByTestId("town-infection-gauge")).toBeVisible();
    await expect(town.getByTestId("town-unrest-gauge")).toBeVisible();
    await expect(town.getByTestId("town-loyalty-gauge")).toBeVisible();
    await expect(town.getByTestId("town-road-gauge")).toBeVisible();

    // "Days until problem", which a bar chart cannot give you.
    await expect(town).toContainText(/empties in about/i);
    // No skeleton is left behind once the data is in.
    await expect(page.locator("[aria-busy='true']")).toHaveCount(0);
  });

  test("trades goods, and prices and unrest respond over time", async ({ page }) => {
    await openAndStart(page);

    // Select Golden, the starving town.
    await page.getByTestId("step-0").count().catch(() => 0);
    // The map opens on the worst town already; go straight to the market.
    await expect(page.getByTestId("town-panel")).toContainText("Golden");
    await page.getByTestId("open-market").first().click();

    const market = page.getByTestId("market-panel");
    await expect(market).toBeVisible();

    const priceBefore = Number(await market.getByTestId("price-grain").innerText());
    expect(Number.isFinite(priceBefore)).toBe(true);
    const stockBefore = Number(await market.locator("[data-testid='market-table'] tbody tr", { hasText: "Grain" }).locator("td").nth(3).innerText());
    expect(Number.isFinite(stockBefore)).toBe(true);

    // Buy a load. The market's stock falls and its price rises.
    await market.locator("#market-quantity").fill("20");
    await market.getByTestId("buy-grain").click();
    await expect(market.getByTestId("market-message")).toBeVisible({ timeout: 15_000 });
    await expect(market.getByTestId("market-message")).toContainText(/Bought 20 at/);

    const priceAfterBuy = Number(await market.getByTestId("price-grain").innerText());
    expect(priceAfterBuy, "buying from a market must raise its price").toBeGreaterThan(priceBefore);

    const stockAfterBuy = Number(
      await market.locator("[data-testid='market-table'] tbody tr", { hasText: "Grain" }).locator("td").nth(3).innerText(),
    );
    expect(stockAfterBuy, "buying must draw the market's stock down").toBeLessThan(stockBefore);

    // Sell it back. The price comes down, because the market now has more.
    await market.getByTestId("sell-grain").click();
    await expect(market.getByTestId("market-message")).toContainText(/Sold 20 at/);
    const priceAfterSell = Number(await market.getByTestId("price-grain").innerText());
    expect(priceAfterSell).toBeLessThan(priceAfterBuy);
  });

  test("the Why panel walks a real multi-link chain", async ({ page }) => {
    await openAndStart(page);

    await page.getByTestId("town-panel").getByTestId("why-unrest").click();
    const why = page.getByTestId("why-panel");
    await expect(why).toBeVisible();
    await expect(why).toBeVisible({ timeout: 15_000 });

    const chain = why.getByTestId("why-chain");
    await expect(chain).toBeVisible();

    // A chain, not a sentence. Five or more links, each deeper than the last.
    const links = why.getByTestId("why-link");
    await expect(links.first()).toBeVisible();
    const count = await links.count();
    expect(count, "the Why panel must show a chain, not a single cause").toBeGreaterThanOrEqual(5);

    // Depth is shown by indentation, so the shape is visible before it is read.
    await expect(why.locator("[data-testid='why-link-depth-0']")).toHaveCount(1);
    expect(await why.locator("[data-testid='why-link-depth-1']").count()).toBeGreaterThan(0);
    expect(await why.locator("[data-testid='why-link-depth-2']").count()).toBeGreaterThan(0);
    expect(await why.locator("[data-testid='why-link-depth-3']").count()).toBeGreaterThan(0);

    // The cause arrows from UI_UX.md section 5 are on every non-first link.
    expect(await why.locator(".why__arrow").count()).toBeGreaterThanOrEqual(4);

    // Expanding a link shows the exact values and the system that wrote them, which
    // UI_UX.md section 5 requires.
    await links.nth(1).click();
    const detail = why.getByTestId("why-detail").first();
    await expect(detail).toBeVisible();
    await expect(detail).toContainText(/System:/);
    await expect(detail).toContainText(/cause c-\d+/);

    // And the chain can be drilled into, one field at a time.
    const drill = why.getByTestId("why-drill").first();
    if (await drill.count()) {
      const before = await why.innerText();
      await drill.click();
      await expect(why).not.toHaveText(before);
    }
  });

  test("prices and unrest change over time as the clock runs", async ({ page }) => {
    await openAndStart(page);

    const readUnrest = async (): Promise<number> => {
      const text = await page.getByTestId("town-unrest-gauge").locator(".gauge__number").innerText();
      return Number(text);
    };

    // Golden starts with a food shortfall, so unrest climbs on its own.
    const first = await readUnrest();
    expect(Number.isFinite(first)).toBe(true);

    // Let the clock run. Two in-game days per real second at normal speed.
    await page.getByTestId("time-3").click();
    await expect(page.getByTestId("time-3")).toHaveAttribute("aria-pressed", "true");

    await expect
      .poll(async () => readUnrest(), { timeout: 20_000, message: "unrest should move as the clock runs" })
      .not.toBe(first);

    // And the day counter advanced, so the movement was the simulation, not a jitter.
    const day1 = await page.getByTestId("hud-date").innerText();
    await expect.poll(async () => page.getByTestId("hud-date").innerText(), { timeout: 15_000 }).not.toBe(day1);
  });

  test("the march planner prices a march before the player commits", async ({ page }) => {
    await openAndStart(page);

    await page.getByTestId("open-march").first().click();
    const planner = page.getByTestId("march-planner");
    await expect(planner).toBeVisible();

    // The plan shows travel time, distance and arrival, before anything is committed.
    const summary = planner.getByTestId("march-summary");
    await expect(summary).toBeVisible({ timeout: 15_000 });
    await expect(summary).toContainText(/km/);
    await expect(summary).toContainText(/day/);
    await expect(summary).toContainText(/arrives day/);

    // Per-resource cost, and days of supply on arrival.
    await expect(planner.getByTestId("march-cost-food")).toBeVisible();
    await expect(planner.getByTestId("march-cost-money")).toBeVisible();
    await expect(planner.getByTestId("march-cost-metal")).toBeVisible();
    await expect(planner.getByTestId("march-supply")).toBeVisible();

    // Road danger, which is what makes a route a decision rather than a line.
    await expect(planner.getByTestId("march-danger")).toBeVisible();

    // And the commit button is the last thing, not the first.
    await expect(planner.getByTestId("march-commit")).toBeVisible();

    // Commit, and the party starts moving.
    await planner.getByTestId("march-commit").click();
    await expect(page.getByTestId("party-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("party-panel")).toContainText(/Marching on/i);
  });

  test("the ledger warns before a resource runs out, and explains why", async ({ page }) => {
    await openAndStart(page);

    await page.getByTestId("open-ledger").first().click();
    const ledger = page.getByTestId("ledger-panel");
    await expect(ledger).toBeVisible();

    // Income and expense lines, by source.
    await expect(ledger.getByTestId("ledger-income")).toBeVisible();
    await expect(ledger.getByTestId("ledger-expenses")).toBeVisible();
    await expect(ledger.getByTestId("ledger-net-table")).toBeVisible();

    // Warnings appear before zero, in words, with a route into the Why panel.
    const warnings = ledger.getByTestId("ledger-warnings");
    await expect(warnings).toBeVisible();
    await expect(warnings).toContainText(/FOOD|DAYS/);
    await expect(ledger.locator("[data-testid^='warning-why-']").first()).toBeVisible();
  });

  test("the ruler roster filters, and a ruler card explains its decisions", async ({ page }) => {
    await openAndStart(page);

    await page.getByTestId("open-roster").first().click();
    const roster = page.getByTestId("ruler-roster");
    await expect(roster).toBeVisible();

    const before = await roster.getByTestId("ruler-list").locator("button").count();
    expect(before).toBeGreaterThan(1);

    await roster.getByTestId("roster-relation-filter").selectOption("hostile");
    const after = await roster.getByTestId("ruler-list").locator("button").count();
    expect(after).toBeLessThan(before);

    await roster.getByTestId("roster-relation-filter").selectOption("all");
    await roster.getByTestId("ruler-list").locator("button").first().click();

    const card = page.getByTestId("ruler-card");
    await expect(card).toBeVisible();
    await expect(card.getByTestId("ruler-traits")).toBeVisible();
    await expect(card).toContainText(/Valor/);
    await expect(card).toContainText(/Influence/);
    await expect(card).toContainText(/Renown/);
  });

  test("is keyboard operable and has no horizontal overflow", async ({ page }) => {
    await openAndStart(page);
    await expect(page.getByTestId("town-panel")).toBeVisible();

    // Tab cycles settlements while the map has focus, and the selection is announced.
    const nameBefore = await page.getByTestId("town-panel").locator(".panel__title").innerText();
    await page.locator("#map").focus();
    await page.keyboard.press("Tab");
    await expect
      .poll(async () => page.getByTestId("town-panel").locator(".panel__title").innerText(), { timeout: 10_000 })
      .not.toBe(nameBefore);
    // The live region carries the new selection for a screen reader.
    await expect(page.locator("[role='status'][aria-live='polite']").first()).toContainText(/selected/i);

    // Outside the map, Tab is ordinary focus traversal: focus moves on to the next
    // control in the panel rather than jumping back to the map.
    await page.getByTestId("open-market").first().click();
    await expect(page.getByTestId("market-panel")).toBeVisible();
    await page.locator("#market-quantity").focus();
    await page.keyboard.press("Tab");
    const afterTab = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      insidePanel: Boolean(document.activeElement?.closest('[data-testid="market-panel"]')),
      onCanvas: document.activeElement?.id === "map",
    }));
    expect(afterTab.onCanvas, "Tab must not jump back to the map from inside a panel").toBe(false);
    expect(afterTab.insidePanel, "Tab should move to the next control in the panel").toBe(true);
    await page.keyboard.press("Escape");

    // Escape closes the context panel rather than stranding it.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("no-selection")).toBeVisible();

    // No horizontal page scroll, at whatever width this project is.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
