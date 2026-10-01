/**
 * Tasks 135-137: challenge mode, ironman mode, sandbox mode.
 *
 * Challenge: weekly modifiers from the ISO week — the same week always
 * yields the same modifiers, so the leaderboard is fair.
 *
 * Ironman: a single save slot and run permadeath — if the ruler dies
 * without an heir, the run ends and the save is marked dead. The save
 * itself is PAX's lane; this module owns the rules.
 *
 * Sandbox: free play with a cheats panel — grant coin, troops, or instant
 * buildings. Cheats are data commands the campaign layer applies.
 */

export interface ChallengeWeek {
  /** e.g. "2026-W40". */
  id: string;
  modifiers: string[];
}

const CHALLENGE_MODIFIERS = [
  "double-wages",
  "half-recruits",
  "fierce-raiders",
  "rich-trade",
  "plague-season",
  "loyal-towns",
  "restless-towns",
  "cheap-mercs",
];

function isoWeek(date: Date): string {
  // Shift to the Thursday of this week; the ISO week-year is its year.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3);
  // Thursday of ISO week 1 = Thursday of the week containing Jan 4.
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const jan4day = (jan4.getUTCDay() + 6) % 7;
  jan4.setUTCDate(jan4.getUTCDate() - jan4day + 3);
  const week = 1 + Math.round((d.getTime() - jan4.getTime()) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function challengeFor(date: Date = new Date()): ChallengeWeek {
  const id = isoWeek(date);
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const count = 2 + (Math.abs(h) % 2); // 2 or 3 modifiers
  const modifiers: string[] = [];
  let seed = Math.abs(h);
  while (modifiers.length < count) {
    const m = CHALLENGE_MODIFIERS[seed % CHALLENGE_MODIFIERS.length]!;
    if (!modifiers.includes(m)) modifiers.push(m);
    seed = Math.floor(seed / CHALLENGE_MODIFIERS.length) + 1;
  }
  return { id, modifiers };
}

export interface IronmanRun {
  active: boolean;
  dead: boolean;
  seasons: number;
  /** True while the run can still continue. */
  alive(rulerAlive: boolean, hasHeir: boolean): boolean;
}

export function createIronmanRun(): IronmanRun & { seasonTick(): void; end(): void } {
  let active = true;
  let dead = false;
  let seasons = 0;
  return {
    get active() {
      return active;
    },
    get dead() {
      return dead;
    },
    get seasons() {
      return seasons;
    },
    alive: (rulerAlive, hasHeir) => active && !dead && (rulerAlive || hasHeir),
    seasonTick() {
      seasons += 1;
    },
    end() {
      dead = true;
      active = false;
    },
  };
}

export type CheatCommand =
  | { kind: "grant-coin"; amount: number }
  | { kind: "grant-troops"; count: number }
  | { kind: "instant-building"; building: string }
  | { kind: "reveal-map" };

export const CHEATS: { kind: CheatCommand["kind"]; label: string }[] = [
  { kind: "grant-coin", label: "Grant 10,000 coin" },
  { kind: "grant-troops", label: "Grant 100 troops" },
  { kind: "instant-building", label: "Instant building" },
  { kind: "reveal-map", label: "Reveal map" },
];

export function describeCheat(cheat: CheatCommand): string {
  switch (cheat.kind) {
    case "grant-coin":
      return `Grant ${cheat.amount} coin`;
    case "grant-troops":
      return `Grant ${cheat.count} troops`;
    case "instant-building":
      return `Instantly complete: ${cheat.building}`;
    case "reveal-map":
      return "Reveal the whole map";
  }
}
