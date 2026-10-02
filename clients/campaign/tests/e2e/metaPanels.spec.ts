/**
 * Browser smoke test for the lifetime statistics page (task 138) and the
 * local leaderboards (task 141), plus screenshots for the report.
 *
 * These panels only do anything if they render and read their stores in a
 * real browser, which unit tests under jsdom cannot show: the CSS is never
 * laid out, and a panel can throw on mount in ways jsdom's happy path hides.
 *
 * The data here is written through the panels' own public APIs
 * (`recordLifetimeBattle`, `submitScore`) rather than by hand-writing
 * localStorage, so a change to either store's key or shape surfaces here
 * instead of quietly rendering an empty panel.
 */

import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  addPlaySeconds,
  battleScore,
  bestScore,
  loadLifetimeStats,
  recordCampaignStart,
  recordLifetimeBattle,
  recordLifetimeScheme,
  recordLifetimeSeasons,
  recordLifetimeTreaty,
  submitScore,
  topScores,
  tournamentScore,
} from "../../src/meta/index";
import type { LifetimeStatsRecord } from "../../src/meta/lifetimeStats";

const OUT = "screenshots";

/**
 * The stores take an injectable Storage, so the seed is built with the very
 * code the client runs and then handed to the page as one localStorage write.
 * Hand-writing the JSON here would let the storage key or record shape drift
 * without this test noticing.
 */
function seedPayload(): { stats: LifetimeStatsRecord; boards: string } {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;

  // Three "campaigns", won and lost, with real kills and loot.
  for (let c = 0; c < 3; c += 1) {
    recordCampaignStart(storage);
    addPlaySeconds(3600 * (2 + c), storage);
    for (let b = 0; b < 7; b += 1) {
      const won = (b + c) % 3 !== 0;
      recordLifetimeBattle(
        {
          won,
          kills: 8 + b * 3 + c,
          losses: 2 + b,
          goldEarned: won ? 120 + b * 25 : 0,
        },
        storage,
      );
    }
  }
  recordLifetimeSeasons(14, storage);
  recordLifetimeTreaty(storage);
  recordLifetimeScheme(storage);

  // Boards: 14 quick battles (so the top-10 cut actually evicts), an arena
  // set, and a tournament champion.
  for (let i = 1; i <= 14; i += 1) {
    submitScore(
      "quick-battle",
      {
        name: `Commander ${i}`,
        score: battleScore(5 + i, i % 4, true),
        detail: `${5 + i} kills · victory`,
      },
      storage,
    );
  }
  for (let i = 1; i <= 5; i += 1) {
    submitScore(
      "arena",
      {
        name: `Gladiator ${i}`,
        score: battleScore(4 + i * 2, 1, i % 2 === 0),
        detail: `${4 + i * 2} kills · ${i % 2 === 0 ? "victory" : "defeat"}`,
      },
      storage,
    );
  }
  submitScore(
    "tournament",
    {
      name: "Ilsa of the Vale",
      score: tournamentScore(4, 1840),
      detail: "Tournament champion · rating 1840",
    },
    storage,
  );

  return {
    stats: loadLifetimeStats(storage),
    boards: [...map.entries()].find(([k]) => k.startsWith("fentmen.leaderboards"))?.[1] ?? "",
  };
}

/** A throwaway Storage over the seeded payload, for read-back assertions. */
function mem(payload?: Record<string, string>): Storage {
  const map = new Map<string, string>(Object.entries(payload ?? {}));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

/**
 * The HUD is absolutely positioned inside a fixed shell. If anything gives the
 * document a scroll range -- an over-tall rail, say -- the page scrolls and every
 * panel opens half off the top of the window, which screenshots happily record as
 * "rendered". So the shell is asserted unpanned and the panel on screen.
 */
async function expectFullyOnScreen(page: Page, testId: string): Promise<void> {
  const box = await page.getByTestId(testId).boundingBox();
  expect(box, `${testId} has a box`).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(box!.y, `${testId} is not clipped above the viewport`).toBeGreaterThanOrEqual(0);
  expect(
    box!.y + box!.height,
    `${testId} is not clipped below the viewport`,
  ).toBeLessThanOrEqual(viewport.height);
  expect(await page.evaluate(() => window.scrollY), "the page itself never scrolls").toBe(0);
}

async function boot(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("side-grid")).toBeVisible({ timeout: 180_000 });
}

async function start(page: Page): Promise<void> {
  for (const id of ["side-mountain-alliance", "step-1", "state-CO", "step-2", "role-ruler-in-waiting", "step-3", "start-next"]) {
    await page.getByTestId(id).click();
  }
  // Faction select is followed by the character maker, which only requires a
  // name; every later step can be accepted as-is.
  await expect(page.getByTestId("char-first-name")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("char-first-name").fill("Dax");
  await page.getByTestId("char-last-name").fill("Rurik");
  for (let i = 0; i < 7; i += 1) await page.getByTestId("maker-next").click();
  await page.getByTestId("maker-done").click();
  // The campaign mounts with the HUD rail visible; the town panel is one
  // click away and is not what these two panels sit behind.
  await expect(page.getByTestId("open-lifetime-stats")).toBeVisible({ timeout: 60_000 });
}

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

test("lifetime statistics and leaderboards render with real data", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop widths only");
  const shot = async (name: string): Promise<void> => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  };

  // Seed before the client boots, so the panels read real data on first open.
  const seeded = seedPayload();
  await page.addInitScript(
    ([stats, boards]) => {
      localStorage.setItem("fentmen.lifetimestats.v1", stats as string);
      localStorage.setItem("fentmen.leaderboards.v1", boards as string);
      // The first-launch quality probe in main.ts reloads the page when it
      // changes a construction-time graphics key, which drops the campaign that
      // was just started (it lives only in memory). Settle that probe first so
      // this test measures the panels rather than racing a reload.
      const raw = localStorage.getItem("campaign.settings");
      const current = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      localStorage.setItem("campaign.settings", JSON.stringify({ ...current, autoQualityDone: true }));
    },
    [JSON.stringify(seeded.stats), seeded.boards] as const,
  );

  await boot(page);
  await start(page);

  // The store really did keep everything, and the board really is capped.
  expect(seeded.stats.battlesFought).toBe(21);
  expect(seeded.stats.campaignsStarted).toBe(3);
  expect(seeded.stats.kills).toBeGreaterThan(0);
  expect(seeded.stats.goldEarned).toBeGreaterThan(0);
  const seededBoards = mem({ "fentmen.leaderboards.v1": seeded.boards });
  expect(topScores("quick-battle", seededBoards).length).toBe(10);
  expect(topScores("arena", seededBoards).length).toBe(5);
  expect(topScores("tournament", seededBoards).length).toBe(1);

  // -- Lifetime statistics (task 138) --
  await page.getByTestId("open-lifetime-stats").click();
  await expect(page.getByTestId("lifetime-stats-panel")).toBeVisible();

  // Kills and gold must render as measured numbers, not the old
  // "awaiting battle reports" placeholders.
  await expect(page.getByTestId("lifetime-stat-kills")).toContainText(
    seeded.stats.kills.toLocaleString("en-US"),
  );
  await expect(page.getByTestId("lifetime-stat-gold")).toContainText(
    seeded.stats.goldEarned.toLocaleString("en-US"),
  );
  await expect(page.getByTestId("lifetime-stat-battles")).toContainText("21");
  // Derived, not hardcoded: the seed plays 2 + 3 + 4 hours.
  await expect(page.getByTestId("lifetime-stat-hours")).toContainText(
    `${(seeded.stats.playSeconds / 3600).toFixed(1)} hours`,
  );
  await expect(page.getByTestId("lifetime-grid")).not.toContainText("awaiting battle reports");
  await expectFullyOnScreen(page, "lifetime-stats-panel");
  await shot("20-desktop-lifetime-stats");

  // Two-step reset must not fire on the first click.
  await page.getByTestId("lifetime-reset").click();
  await expect(page.getByTestId("lifetime-stat-battles")).toContainText("21");
  await shot("21-desktop-stats-reset-armed");

  // -- Leaderboards (task 141) --
  await page.getByRole("button", { name: "Close Lifetime statistics" }).click();
  await page.getByTestId("open-leaderboards").click();
  await expect(page.getByTestId("leaderboards-panel")).toBeVisible();

  // Quick battle is the default tab and now has a real producer.
  await expect(page.getByTestId("boards-tab-quick-battle")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("boards-row-0")).toBeVisible();
  await expect(page.getByTestId("boards-row-9")).toBeVisible();
  await expect(page.getByTestId("boards-row-10")).toHaveCount(0);
  await expect(page.getByTestId("boards-best")).toContainText(
    bestScore("quick-battle", seededBoards)?.name ?? "Commander 14",
  );
  await expectFullyOnScreen(page, "leaderboards-panel");
  await shot("22-desktop-leaderboards-quick-battle");

  // Every mode renders its own board.
  await page.getByTestId("boards-tab-arena").click();
  await expect(page.getByTestId("boards-tab-arena")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("boards-row-4")).toBeVisible();
  await expect(page.getByTestId("boards-row-5")).toHaveCount(0);
  await shot("23-desktop-leaderboards-arena");

  await page.getByTestId("boards-tab-tournament").click();
  await expect(page.getByTestId("boards-table")).toContainText("Ilsa of the Vale");
  await expect(page.getByTestId("boards-table")).toContainText("1,940");
  await shot("24-desktop-leaderboards-tournament");
});