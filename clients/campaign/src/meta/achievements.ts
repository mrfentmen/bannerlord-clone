/**
 * Tasks 132-134: achievements, lifetime statistics, local leaderboards.
 *
 * 50+ achievements: the campaign layer reports deeds; this module matches
 * them to achievements and queues unlock toasts for the UI.
 */

import type { Achievement, LeaderboardEntry, LifetimeStats } from "./types.js";

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-blood", name: "First Blood", description: "Win your first battle.", deed: "win-1-battle" },
  { id: "unbroken-10", name: "Unbroken", description: "Win 10 battles.", deed: "win-10-battles" },
  { id: "unbroken-50", name: "Legend of War", description: "Win 50 battles.", deed: "win-50-battles" },
  { id: "bold", name: "Against the Odds", description: "Win a battle outnumbered 2:1.", deed: "win-outnumbered" },
  { id: "flawless", name: "Flawless", description: "Win a battle without losing a unit.", deed: "win-flawless" },
  { id: "siegebreaker", name: "Siegebreaker", description: "Win a siege attack.", deed: "win-siege-attack" },
  { id: "defender", name: "Defender", description: "Win a siege defense.", deed: "win-siege-defense" },
  { id: "tournament", name: "Champion", description: "Win a tournament.", deed: "win-tournament" },
  { id: "arena-10", name: "Arena Regular", description: "Win 10 arena bouts.", deed: "win-10-arena" },
  { id: "daily", name: "Daily Grind", description: "Complete a daily challenge.", deed: "complete-daily" },
  { id: "married", name: "Alliance by Blood", description: "Arrange a marriage.", deed: "arrange-marriage" },
  { id: "heir", name: "Secured Line", description: "Designate an heir.", deed: "designate-heir" },
  { id: "crisis", name: "Survivor", description: "Resolve a succession crisis.", deed: "resolve-crisis" },
  { id: "banner", name: "Heraldry", description: "Design your clan banner.", deed: "design-banner" },
  { id: "tutor", name: "Mentor", description: "Assign a tutor to a child.", deed: "assign-tutor" },
  { id: "feast", name: "Generous Host", description: "Host a feast.", deed: "host-feast" },
  { id: "edict", name: "Lawmaker", description: "Pass a realm edict.", deed: "pass-edict" },
  { id: "petition-10", name: "Just Ruler", description: "Resolve 10 petitions.", deed: "resolve-10-petitions" },
  { id: "trial", name: "Judge", description: "Judge a trial.", deed: "judge-trial" },
  { id: "spy", name: "Eyes Everywhere", description: "Place 5 spies.", deed: "place-5-spies" },
  { id: "scheme", name: "Schemer", description: "Complete a scheme.", deed: "complete-scheme" },
  { id: "scheme-10", name: "Mastermind", description: "Complete 10 schemes.", deed: "complete-10-schemes" },
  { id: "informant", name: "Whispers", description: "Recruit an informant.", deed: "recruit-informant" },
  { id: "cipher", name: "Codebreaker", description: "Decode a secret message.", deed: "decode-message" },
  { id: "assassin", name: "Silent Knife", description: "Complete an assassination plot.", deed: "complete-assassination" },
  { id: "caravan", name: "Merchant", description: "Fund a caravan.", deed: "fund-caravan" },
  { id: "workshop", name: "Industrialist", description: "Own 3 workshops.", deed: "own-3-workshops" },
  { id: "rich", name: "Golden", description: "Hold 50,000 coin.", deed: "amass-50000-coin" },
  { id: "loan", name: "Borrowed Time", description: "Take a loan.", deed: "take-loan" },
  { id: "debt-free", name: "Debt Free", description: "Repay a loan in full.", deed: "repay-loan" },
  { id: "tribute", name: "Tribute Paid", description: "Pay tribute.", deed: "pay-tribute" },
  { id: "envoy", name: "Diplomat", description: "Send an envoy.", deed: "send-envoy" },
  { id: "alliance", name: "Allied", description: "Sign an alliance.", deed: "sign-alliance" },
  { id: "pact", name: "Peacekeeper", description: "Sign a non-aggression pact.", deed: "sign-pact" },
  { id: "vassal", name: "Overlord", description: "Gain a vassal.", deed: "gain-vassal" },
  { id: "summit", name: "Summitry", description: "Hold a summit.", deed: "hold-summit" },
  { id: "gift", name: "Generous", description: "Send a diplomatic gift.", deed: "send-gift" },
  { id: "treaty-3", name: "Peacemaker", description: "Sign 3 treaties.", deed: "sign-3-treaties" },
  { id: "oath", name: "Sworn", description: "Swear a banner oath.", deed: "swear-oath" },
  { id: "nickname", name: "Named", description: "Earn a nickname.", deed: "earn-nickname" },
  { id: "pose", name: "Showboat", description: "Unlock a victory pose.", deed: "unlock-pose" },
  { id: "photo", name: "Photographer", description: "Capture a photo-mode shot.", deed: "capture-photo" },
  { id: "fiefs-5", name: "Steadfast", description: "Hold 5 fiefs.", deed: "hold-5-fiefs" },
  { id: "grace", name: "Graduate", description: "Survive the 10-season grace period.", deed: "survive-grace" },
  { id: "ironman", name: "Iron Will", description: "Win a campaign in ironman mode.", deed: "win-ironman" },
  { id: "sandbox", name: "Godmode", description: "Open the cheats panel.", deed: "open-cheats" },
  { id: "scenario", name: "Worldbuilder", description: "Save a custom scenario.", deed: "save-scenario" },
  { id: "mod", name: "Modded", description: "Enable a mod.", deed: "enable-mod" },
  { id: "chronicle-10", name: "Historian", description: "Write 10 chronicle chapters.", deed: "write-10-chapters" },
  { id: "helpful", name: "Well Read", description: "Open the help overlay 10 times.", deed: "open-help-10" },
  { id: "glossary", name: "Scholar", description: "Look up 10 glossary terms.", deed: "lookup-10-terms" },
  { id: "war-council", name: "War Planner", description: "Carry a war council vote.", deed: "carry-war-vote" },
];

export interface AchievementState {
  unlocked(): string[];
  /** Report a deed; returns newly unlocked achievements for toasts. */
  report(deed: string): Achievement[];
  progress(): { total: number; unlocked: number };
}

export function createAchievements(): AchievementState {
  const unlockedSet = new Set<string>();
  return {
    unlocked: () => [...unlockedSet],
    report(deed) {
      const fresh = ACHIEVEMENTS.filter((a) => a.deed === deed && !unlockedSet.has(a.id));
      for (const a of fresh) unlockedSet.add(a.id);
      return fresh;
    },
    progress: () => ({ total: ACHIEVEMENTS.length, unlocked: unlockedSet.size }),
  };
}

// --- Lifetime statistics ---

export function emptyStats(): LifetimeStats {
  return { battlesWon: 0, battlesLost: 0, seasonsPlayed: 0, coinEarned: 0, treatiesSigned: 0, schemesCompleted: 0 };
}

export function mergeStats(a: LifetimeStats, b: LifetimeStats): LifetimeStats {
  return {
    battlesWon: a.battlesWon + b.battlesWon,
    battlesLost: a.battlesLost + b.battlesLost,
    seasonsPlayed: a.seasonsPlayed + b.seasonsPlayed,
    coinEarned: a.coinEarned + b.coinEarned,
    treatiesSigned: a.treatiesSigned + b.treatiesSigned,
    schemesCompleted: a.schemesCompleted + b.schemesCompleted,
  };
}

// --- Local leaderboards ---

export interface Leaderboard {
  entries(board: string): LeaderboardEntry[];
  submit(board: string, entry: LeaderboardEntry): void;
  best(board: string): LeaderboardEntry | null;
}

export function createLeaderboard(): Leaderboard {
  const boards = new Map<string, LeaderboardEntry[]>();
  return {
    entries: (board) => [...(boards.get(board) ?? [])].sort((a, b) => b.score - a.score).slice(0, 10),
    submit(board, entry) {
      boards.set(board, [...(boards.get(board) ?? []), entry]);
    },
    best(board) {
      const list = boards.get(board) ?? [];
      return list.length > 0 ? list.reduce((a, b) => (b.score > a.score ? b : a)) : null;
    },
  };
}
