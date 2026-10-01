/**
 * Achievement catalog (MASTER_PLAN task 137). 100+ definitions.
 *
 * Written as tier families so the counts stay auditable: each family names
 * the event it listens to and the tiers above it. The test asserts the total
 * is >= 100 and every id is unique.
 */

import type { AchievementCategory, AchievementDef } from "./types.js";

interface Tier {
  count: number;
  title: string;
  description: string;
  points: number;
  hidden?: boolean;
}

interface Family {
  base: string;
  category: AchievementCategory;
  event: string;
  match?: Record<string, string>;
  tiers: Tier[];
}

const FAMILIES: Family[] = [
  {
    base: "quest-completed", category: "quests", event: "quest.completed",
    tiers: [
      { count: 1, title: "First Blood Money", description: "Complete your first quest.", points: 5 },
      { count: 5, title: "Reliable", description: "Complete 5 quests.", points: 10 },
      { count: 10, title: "Fixer's Favorite", description: "Complete 10 quests.", points: 15 },
      { count: 20, title: "Made Name", description: "Complete 20 quests.", points: 25 },
      { count: 35, title: "Corner Office", description: "Complete 35 quests.", points: 25 },
      { count: 50, title: "Neighborhood Legend", description: "Complete 50 quests.", points: 50 },
      { count: 75, title: "Myth", description: "Complete 75 quests.", points: 50 },
      { count: 100, title: "Untouchable", description: "Complete 100 quests.", points: 50 },
      { count: 150, title: "Institution", description: "Complete 150 quests.", points: 50 },
      { count: 200, title: "Kingpin", description: "Complete 200 quests. Nobody says no to you twice.", points: 50 },
    ],
  },
  {
    base: "quest-completed-war", category: "quests", event: "quest.completed", match: { category: "war" },
    tiers: [
      { count: 3, title: "War Dog", description: "Complete 3 war quests.", points: 10 },
      { count: 10, title: "Warlord", description: "Complete 10 war quests.", points: 25 },
    ],
  },
  {
    base: "quest-completed-trade", category: "quests", event: "quest.completed", match: { category: "trade" },
    tiers: [
      { count: 3, title: "Ledger Hand", description: "Complete 3 trade quests.", points: 10 },
      { count: 10, title: "Market Maker", description: "Complete 10 trade quests.", points: 25 },
    ],
  },
  {
    base: "quest-completed-bounty", category: "quests", event: "quest.completed", match: { category: "bounty" },
    tiers: [
      { count: 3, title: "Headhunter", description: "Complete 3 bounty quests.", points: 10 },
      { count: 10, title: "Reaper", description: "Complete 10 bounty quests.", points: 25 },
    ],
  },
  {
    base: "quest-completed-escort", category: "quests", event: "quest.completed", match: { category: "escort" },
    tiers: [
      { count: 3, title: "Shepherd", description: "Complete 3 escort quests.", points: 10 },
      { count: 10, title: "Guardian", description: "Complete 10 escort quests.", points: 25 },
    ],
  },
  {
    base: "quest-completed-intrigue", category: "quests", event: "quest.completed", match: { category: "intrigue" },
    tiers: [
      { count: 3, title: "Ear to the Ground", description: "Complete 3 intrigue quests.", points: 10 },
      { count: 10, title: "Spymaster", description: "Complete 10 intrigue quests.", points: 25 },
    ],
  },
  {
    base: "quest-completed-exploration", category: "quests", event: "quest.completed", match: { category: "exploration" },
    tiers: [
      { count: 3, title: "Trailblazer", description: "Complete 3 exploration quests.", points: 10 },
      { count: 10, title: "Pathfinder", description: "Complete 10 exploration quests.", points: 25 },
    ],
  },
  {
    base: "quest-completed-aid", category: "quests", event: "quest.completed", match: { category: "aid" },
    tiers: [
      { count: 3, title: "Good Neighbor", description: "Complete 3 aid quests.", points: 10 },
      { count: 10, title: "Saint of the Streets", description: "Complete 10 aid quests.", points: 25 },
    ],
  },
  {
    base: "quest-failed", category: "quests", event: "quest.failed",
    tiers: [
      { count: 1, title: "First Scar", description: "Fail your first quest. It happens.", points: 5, hidden: true },
      { count: 3, title: "Pattern Emerging", description: "Fail 3 quests.", points: 10, hidden: true },
      { count: 8, title: "Professional Victim", description: "Fail 8 quests.", points: 15, hidden: true },
      { count: 15, title: "Cautionary Tale", description: "Fail 15 quests. The journal remembers.", points: 25, hidden: true },
    ],
  },
  {
    base: "quest-objective", category: "quests", event: "quest.objective_done",
    tiers: [
      { count: 10, title: "Box Checker", description: "Finish 10 quest objectives.", points: 10 },
      { count: 50, title: "Thorough", description: "Finish 50 quest objectives.", points: 15 },
      { count: 150, title: "Meticulous", description: "Finish 150 quest objectives.", points: 25 },
      { count: 300, title: "Completionist", description: "Finish 300 quest objectives.", points: 50 },
    ],
  },
  {
    base: "battle-deployed", category: "command", event: "battle.deployed",
    tiers: [
      { count: 1, title: "Boots on the Ground", description: "Deploy for your first battle.", points: 5 },
      { count: 5, title: "Field Commander", description: "Deploy for 5 battles.", points: 10 },
      { count: 15, title: "Veteran", description: "Deploy for 15 battles.", points: 15 },
      { count: 30, title: "General", description: "Deploy for 30 battles.", points: 25 },
      { count: 50, title: "Warlord", description: "Deploy for 50 battles.", points: 50 },
      { count: 75, title: "Theater Command", description: "Deploy for 75 battles.", points: 50 },
    ],
  },
  {
    base: "deployment-opened", category: "command", event: "deployment.opened",
    tiers: [
      { count: 1, title: "Reading the Ground", description: "Open the deployment map.", points: 5 },
      { count: 10, title: "Terrain Scholar", description: "Open the deployment map 10 times.", points: 10 },
      { count: 25, title: "Cartographer's Eye", description: "Open the deployment map 25 times.", points: 15 },
    ],
  },
  {
    base: "deployment-placed", category: "command", event: "deployment.unit_placed",
    tiers: [
      { count: 10, title: "Set the Table", description: "Place 10 units on deployment maps.", points: 10 },
      { count: 40, title: "Order of Battle", description: "Place 40 units.", points: 15 },
      { count: 100, title: "Grand Tactician", description: "Place 100 units.", points: 25 },
      { count: 250, title: "Endless Formation", description: "Place 250 units.", points: 50 },
      { count: 500, title: "Army of Pieces", description: "Place 500 units.", points: 50 },
    ],
  },
  {
    base: "deployment-moved", category: "command", event: "deployment.unit_moved",
    tiers: [
      { count: 10, title: "Second Thoughts", description: "Reposition 10 placed units.", points: 10 },
      { count: 50, title: "Perfectionist", description: "Reposition 50 placed units.", points: 15 },
      { count: 150, title: "Never Satisfied", description: "Reposition 150 placed units.", points: 25 },
    ],
  },
  {
    base: "codex-read", category: "knowledge", event: "codex.entry_read",
    tiers: [
      { count: 1, title: "Curious", description: "Read your first codex entry.", points: 5 },
      { count: 5, title: "Student", description: "Read 5 codex entries.", points: 10 },
      { count: 15, title: "Scholar", description: "Read 15 codex entries.", points: 15 },
      { count: 30, title: "Lorekeeper", description: "Read 30 codex entries.", points: 25 },
      { count: 45, title: "Living Archive", description: "Read 45 codex entries.", points: 50 },
    ],
  },
  {
    base: "codex-read-controls", category: "knowledge", event: "codex.entry_read", match: { category: "controls" },
    tiers: [{ count: 3, title: "Control Freak", description: "Read 3 controls entries.", points: 10 }],
  },
  {
    base: "codex-read-settings", category: "knowledge", event: "codex.entry_read", match: { category: "settings" },
    tiers: [{ count: 3, title: "Tinkerer", description: "Read 3 settings entries.", points: 10 }],
  },
  {
    base: "codex-read-command", category: "knowledge", event: "codex.entry_read", match: { category: "command" },
    tiers: [{ count: 3, title: "Tactician", description: "Read 3 command entries.", points: 10 }],
  },
  {
    base: "codex-read-campaign", category: "knowledge", event: "codex.entry_read", match: { category: "campaign" },
    tiers: [{ count: 3, title: "Campaigner", description: "Read 3 campaign entries.", points: 10 }],
  },
  {
    base: "codex-read-economy", category: "knowledge", event: "codex.entry_read", match: { category: "economy" },
    tiers: [{ count: 3, title: "Accountant", description: "Read 3 economy entries.", points: 10 }],
  },
  {
    base: "codex-read-world", category: "knowledge", event: "codex.entry_read", match: { category: "world" },
    tiers: [{ count: 3, title: "Local", description: "Read 3 world entries.", points: 10 }],
  },
  {
    base: "codex-category-done", category: "knowledge", event: "codex.category_done",
    tiers: [
      { count: 1, title: "Well Read", description: "Read every entry in one codex category.", points: 15 },
      { count: 3, title: "Polymath", description: "Read every entry in 3 codex categories.", points: 25 },
      { count: 6, title: "Know-It-All", description: "Read every entry in all 6 codex categories.", points: 50 },
    ],
  },
  {
    base: "codex-opened", category: "knowledge", event: "codex.opened",
    tiers: [
      { count: 1, title: "Looked It Up", description: "Open the codex.", points: 5 },
      { count: 10, title: "Reference Desk", description: "Open the codex 10 times.", points: 10 },
      { count: 25, title: "Resident Expert", description: "Open the codex 25 times.", points: 15 },
    ],
  },
  {
    base: "codex-searched", category: "knowledge", event: "codex.search_used",
    tiers: [
      { count: 1, title: "Index Finger", description: "Search the codex.", points: 5 },
      { count: 10, title: "Researcher", description: "Search the codex 10 times.", points: 10 },
      { count: 30, title: "Archivist", description: "Search the codex 30 times.", points: 15 },
    ],
  },
  {
    base: "settings-changed", category: "customization", event: "settings.changed",
    tiers: [
      { count: 1, title: "Fiddler", description: "Change a setting.", points: 5 },
      { count: 5, title: "Tuner", description: "Change settings 5 times.", points: 10 },
      { count: 15, title: "Calibrated", description: "Change settings 15 times.", points: 15 },
      { count: 30, title: "Dialed In", description: "Change settings 30 times.", points: 25 },
    ],
  },
  {
    base: "settings-graphics", category: "customization", event: "settings.changed", match: { key: "graphicsQuality" },
    tiers: [{ count: 1, title: "Pixel Peeper", description: "Change the graphics quality.", points: 5 }],
  },
  {
    base: "settings-uiscale", category: "customization", event: "settings.changed", match: { key: "uiScale" },
    tiers: [{ count: 1, title: "Big Print", description: "Change the UI scale.", points: 5 }],
  },
  {
    base: "settings-camera", category: "customization", event: "settings.changed", match: { key: "cameraSpeed" },
    tiers: [{ count: 1, title: "Scout", description: "Change the camera speed.", points: 5 }],
  },
  {
    base: "settings-mastervol", category: "customization", event: "settings.changed", match: { key: "masterVolume" },
    tiers: [{ count: 1, title: "Volume Knob", description: "Change the master volume.", points: 5 }],
  },
  {
    base: "settings-musicvol", category: "customization", event: "settings.changed", match: { key: "musicVolume" },
    tiers: [{ count: 1, title: "Score Keeper", description: "Change the music volume.", points: 5 }],
  },
  {
    base: "settings-sfxvol", category: "customization", event: "settings.changed", match: { key: "sfxVolume" },
    tiers: [{ count: 1, title: "Ears Open", description: "Change the sound effects volume.", points: 5 }],
  },
  {
    base: "settings-language", category: "customization", event: "settings.changed", match: { key: "language" },
    tiers: [{ count: 1, title: "Polyglot", description: "Change the language.", points: 5 }],
  },
  {
    base: "settings-motion", category: "customization", event: "settings.changed", match: { key: "reduceMotion" },
    tiers: [{ count: 1, title: "Easy on the Eyes", description: "Toggle reduce motion.", points: 5 }],
  },
  {
    base: "settings-bindings", category: "customization", event: "settings.changed", match: { key: "keyBindings" },
    tiers: [{ count: 1, title: "Pianist", description: "Change the stored key bindings.", points: 5 }],
  },
  {
    base: "controls-rebound", category: "customization", event: "controls.rebound",
    tiers: [
      { count: 1, title: "My Own Keys", description: "Rebind an action.", points: 5 },
      { count: 3, title: "Touch Typist", description: "Rebind 3 actions.", points: 10 },
      { count: 8, title: "Chord Master", description: "Rebind 8 actions.", points: 15 },
      { count: 15, title: "Keyboard Royalty", description: "Rebind 15 actions.", points: 25 },
    ],
  },
  {
    base: "controls-rebound-interface", category: "customization", event: "controls.rebound", match: { category: "interface" },
    tiers: [{ count: 1, title: "Interface Tweaker", description: "Rebind an interface action.", points: 5 }],
  },
  {
    base: "controls-rebound-map", category: "customization", event: "controls.rebound", match: { category: "campaign-map" },
    tiers: [{ count: 1, title: "Map Tweaker", description: "Rebind a campaign-map action.", points: 5 }],
  },
  {
    base: "controls-rebound-battle", category: "customization", event: "controls.rebound", match: { category: "battle-command" },
    tiers: [{ count: 1, title: "Battle Tweaker", description: "Rebind a battle-command action.", points: 5 }],
  },
  {
    base: "achievements-unlocked", category: "meta", event: "achievements.unlocked",
    tiers: [
      { count: 1, title: "Collector", description: "Unlock your first achievement.", points: 5 },
      { count: 5, title: "Hoarder", description: "Unlock 5 achievements.", points: 10 },
      { count: 15, title: "Trophy Case", description: "Unlock 15 achievements.", points: 15 },
      { count: 30, title: "Hall of Fame", description: "Unlock 30 achievements.", points: 25 },
      { count: 50, title: "Gilded", description: "Unlock 50 achievements.", points: 50 },
      { count: 75, title: "Platinum Mind", description: "Unlock 75 achievements.", points: 50 },
    ],
  },
  {
    base: "achievements-opened", category: "meta", event: "achievements.opened",
    tiers: [
      { count: 1, title: "Checking the Mantel", description: "Open the achievements panel.", points: 5 },
      { count: 10, title: "Trophy Polisher", description: "Open the achievements panel 10 times.", points: 10 },
      { count: 25, title: "Bragging Rights", description: "Open the achievements panel 25 times.", points: 15 },
    ],
  },
  {
    base: "journal-opened", category: "meta", event: "journal.opened",
    tiers: [
      { count: 1, title: "Checking the Books", description: "Open the quest journal.", points: 5 },
      { count: 10, title: "Dutiful", description: "Open the quest journal 10 times.", points: 10 },
      { count: 25, title: "Paper Trail", description: "Open the quest journal 25 times.", points: 15 },
    ],
  },
  {
    base: "journal-searched", category: "meta", event: "journal.search_used",
    tiers: [
      { count: 1, title: "Needle Finder", description: "Search the quest journal.", points: 5 },
      { count: 10, title: "Bloodhound", description: "Search the quest journal 10 times.", points: 10 },
      { count: 30, title: "Haystack Conqueror", description: "Search the quest journal 30 times.", points: 15 },
    ],
  },
];

function buildCatalog(): AchievementDef[] {
  const defs: AchievementDef[] = [];
  for (const family of FAMILIES) {
    family.tiers.forEach((tier) => {
      defs.push({
        id: `${family.base}-${tier.count}`,
        title: tier.title,
        description: tier.description,
        category: family.category,
        event: family.event,
        count: tier.count,
        ...(family.match ? { match: { ...family.match } } : {}),
        points: tier.points,
        ...(tier.hidden ? { hidden: true } : {}),
      });
    });
  }
  return defs;
}

export const ACHIEVEMENT_DEFS: readonly AchievementDef[] = buildCatalog();

export const ACHIEVEMENT_COUNT = ACHIEVEMENT_DEFS.length;
