/**
 * @vitest-environment jsdom
 *
 * Battle modes tests (MASTER_PLAN 2D, tasks 58-67).
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  BIOME_LABEL,
  applyModifiers,
  CHALLENGE_MODIFIERS,
  createArena,
  createBookmaker,
  createModesMenu,
  createTournament,
  customBattle,
  dailyChallenge,
  dailyLeaderboard,
  dailySeed,
  decimalOdds,
  defaultFighters,
  forceSize,
  generateSkirmish,
  HISTORICAL_SCENARIOS,
  payout,
  PRESET_FORCES,
  quickBattle,
  recordDailyScore,
  TOURNAMENT_PRIZES,
  winProbability,
  type BattleConfig,
  type BattleLauncher,
} from "../index.js";

function launcherSpy(): BattleLauncher & { configs: BattleConfig[] } {
  const configs: BattleConfig[] = [];
  return { configs, launch: (c) => configs.push(c) };
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("quick battle (task 58)", () => {
  it("picks two forces and launches immediately", () => {
    const launcher = launcherSpy();
    const menu = createModesMenu({ launcher, onExit: () => {} });
    document.body.appendChild(menu);
    (menu.querySelector('[data-mode="quick"]') as HTMLButtonElement).click();
    (menu.querySelector(".modes-fight") as HTMLButtonElement).click();
    expect(launcher.configs).toHaveLength(1);
    expect(launcher.configs[0]!.mode).toBe("quick");
    expect(forceSize(launcher.configs[0]!.player)).toBeGreaterThan(0);
    expect(forceSize(launcher.configs[0]!.enemy)).toBeGreaterThan(0);
  });

  it("rejects the same force on both sides", () => {
    expect(() => quickBattle({ playerForceId: "militia", enemyForceId: "militia" })).toThrow();
  });
});

describe("skirmish generator (task 59)", () => {
  it("is deterministic on the same seed", () => {
    const a = generateSkirmish(42);
    const b = generateSkirmish(42);
    expect(a).toEqual(b);
  });

  it("gives a different setup on every default click", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const c = generateSkirmish();
      seen.add(JSON.stringify([c.player.units, c.enemy.units, c.biome]));
    }
    expect(seen.size).toBe(10);
  });
});

describe("arena (task 60)", () => {
  it("crowd excitement scales with performance", () => {
    const arena = createArena();
    const before = arena.crowdLevel();
    arena.recordResult({
      config: generateSkirmish(1),
      playerWon: true,
      playerKills: 40,
      playerLosses: 5,
      durationS: 120,
    });
    expect(arena.crowdLevel()).toBeGreaterThan(before);
    const rec = arena.record();
    expect(rec.wins).toBe(1);
    expect(rec.streak).toBe(1);
    const afterWin = arena.crowdLevel();
    arena.recordResult({ config: generateSkirmish(1), playerWon: false, playerKills: 2, playerLosses: 30 });
    expect(arena.crowdLevel()).toBeLessThan(afterWin);
    expect(arena.record().streak).toBe(0);
  });

  it("persists the record across instances", () => {
    const a = createArena();
    a.recordResult({ config: generateSkirmish(1), playerWon: true, playerKills: 10, playerLosses: 2 });
    expect(createArena().record().wins).toBe(1);
  });
});

describe("tournament (task 61)", () => {
  it("a 16-fighter bracket completes", () => {
    const t = createTournament(defaultFighters());
    expect(t.rounds()).toHaveLength(4);
    expect(t.rounds()[0]).toHaveLength(8);
    let guard = 0;
    while (!t.isComplete() && guard++ < 32) {
      for (const round of t.rounds()) {
        for (const m of round) {
          if (!m.winnerId && m.a && m.b) t.reportWinner(m.id, m.a.id);
        }
      }
    }
    expect(t.isComplete()).toBe(true);
    expect(t.champion()).not.toBeNull();
  });

  it("persists across rounds", () => {
    const t = createTournament(defaultFighters());
    const first = t.rounds()[0]![0]!;
    t.reportWinner(first.id, first.a!.id);
    const t2 = createTournament(defaultFighters());
    expect(t2.rounds()[0]![0]!.winnerId).toBe(first.a!.id);
    expect(t2.rounds()[1]![0]!.a!.id).toBe(first.a!.id);
  });
});

describe("betting (task 62)", () => {
  it("payout math is correct on an upset", () => {
    const favorite = { id: "f1", name: "Fav", rating: 1800 };
    const underdog = { id: "f2", name: "Dog", rating: 1200 };
    expect(winProbability(underdog, favorite)).toBeLessThan(0.5);
    const odds = decimalOdds(underdog, favorite);
    expect(odds).toBeGreaterThan(2);
    const book = createBookmaker();
    const start = book.purse();
    const bet = book.placeBet("f2", 100, odds);
    expect(book.purse()).toBe(start - 100);
    const returned = book.settle([bet], "f2");
    expect(returned).toBe(payout(bet));
    expect(returned).toBeGreaterThan(200);
    expect(book.purse()).toBe(start - 100 + returned);
  });

  it("losing bets are not returned", () => {
    const book = createBookmaker();
    const bet = book.placeBet("f1", 50, 2);
    expect(book.settle([bet], "f2")).toBe(0);
  });
});

describe("prizes (task 63)", () => {
  it("lists prizes with stats", () => {
    expect(TOURNAMENT_PRIZES.length).toBeGreaterThan(0);
    for (const p of TOURNAMENT_PRIZES) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(Object.keys(p.stats).length).toBeGreaterThan(0);
    }
  });
});

describe("historical battles (task 64)", () => {
  it("ships 3 scenarios with briefing text", () => {
    expect(HISTORICAL_SCENARIOS).toHaveLength(3);
    for (const s of HISTORICAL_SCENARIOS) {
      expect(s.briefing.length).toBeGreaterThanOrEqual(2);
      expect(s.briefing.every((p) => p.length > 20)).toBe(true);
      expect(s.config.mode).toBe("historical");
    }
  });
});

describe("challenge modifiers (task 65)", () => {
  it("has at least 5 modifiers and they all combine", () => {
    expect(CHALLENGE_MODIFIERS.length).toBeGreaterThanOrEqual(5);
    const ids = CHALLENGE_MODIFIERS.map((m) => m.id);
    const config = generateSkirmish(7);
    const enemyBefore = forceSize(config.enemy);
    const playerBefore = forceSize(config.player);
    applyModifiers(config, ids);
    expect(config.modifiers).toEqual(ids);
    expect(forceSize(config.enemy)).toBeGreaterThan(enemyBefore); // outnumbered
    expect(forceSize(config.player)).toBeLessThan(playerBefore); // last stand
    expect(config.enemy.units.every((u) => u.kind !== "archers")).toBe(true); // no archers
  });
});

describe("daily challenge (task 66)", () => {
  it("same date gives the same setup, different dates differ", () => {
    const a = dailyChallenge(new Date(2026, 9, 1));
    const b = dailyChallenge(new Date(2026, 9, 1));
    const c = dailyChallenge(new Date(2026, 9, 2));
    expect(a.seed).toBe(b.seed);
    expect(a).toEqual(b);
    expect(c.seed).not.toBe(a.seed);
    expect(dailySeed(new Date(2026, 9, 1))).toBe(20261001);
  });

  it("scores persist in a local leaderboard", () => {
    recordDailyScore({ date: 20261001, name: "Del", score: 1500, won: true });
    recordDailyScore({ date: 20261001, name: "Pax", score: 900, won: false });
    const board = dailyLeaderboard();
    expect(board).toHaveLength(2);
    expect(board[0]!.name).toBe("Del");
    expect(dailyLeaderboard()[0]!.score).toBe(1500);
  });
});

describe("custom battle (task 67)", () => {
  it("any combination launches", () => {
    const launcher = launcherSpy();
    const biomes = Object.keys(BIOME_LABEL) as (keyof typeof BIOME_LABEL)[];
    let launched = 0;
    for (const biome of biomes) {
      for (const mods of [[], ["night"], ["outnumbered", "elite-foe"]]) {
        launcher.launch(
          customBattle({
            playerForceId: PRESET_FORCES[0]!.id,
            enemyForceId: PRESET_FORCES[1]!.id,
            biome,
            modifierIds: mods,
          }),
        );
        launched++;
      }
    }
    expect(launched).toBe(biomes.length * 3);
    expect(launcher.configs.every((c) => c.mode === "custom")).toBe(true);
  });
});
