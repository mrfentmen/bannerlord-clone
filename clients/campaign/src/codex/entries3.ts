/**
 * Codex corpus (MASTER_PLAN task 123). Part 3: world lore.
 */

import type { CodexEntry } from "./types.js";

function e(
  id: string,
  title: string,
  category: CodexEntry["category"],
  summary: string,
  body: string[],
  tags: string[],
  related: string[] = [],
): CodexEntry {
  return { id, title, category, summary, body, tags, related };
}

export const WORLD_ENTRIES: CodexEntry[] = [
  e(
    "lore-the-world",
    "The world",
    "world",
    "Modern America, four metros, no kings — just people with leverage.",
    [
      "The campaign plays out across four metropolitan regions: New York City, Los Angeles, Houston, and Miami. No kingdoms, no banners in the medieval sense — the powers here are crews, firms, congregations, and families with territory and grudges.",
      "The tone is gritty on purpose. Deals are enforced by reputation and the credible threat of force, not by courts. Trust is the scarcest resource on the map, and it trades at a worse rate than anything in the markets.",
    ],
    ["lore", "world", "setting", "america"],
    ["lore-new-york", "lore-los-angeles", "lore-houston", "lore-miami", "lore-who-you-are"],
  ),
  e(
    "lore-new-york",
    "New York City",
    "world",
    "Density, money, and old grudges stacked vertically.",
    [
      "The densest ground in the game: more settlements per mile, more notables per settlement, more jobs and more people who want you dead for taking them.",
      "Power here is layered — the person you meet is rarely the person who decides. Relations in New York are an investment with compounding returns and sudden crashes.",
    ],
    ["lore", "new york", "nyc", "setting"],
    ["lore-the-world", "mechanic-notables"],
  ),
  e(
    "lore-los-angeles",
    "Los Angeles",
    "world",
    "Distance is the terrain. Everything is a drive away.",
    [
      "Los Angeles is spread thin: long marches between settlements, long sightlines, and ambush country in between. March costs bite harder here than anywhere else.",
      "The sprawl cuts both ways — room to maneuver, room to disappear, and room for a rival to do the same.",
    ],
    ["lore", "los angeles", "la", "setting"],
    ["lore-the-world", "mechanic-marching"],
  ),
  e(
    "lore-houston",
    "Houston",
    "world",
    "Industry, fuel, and people who work with their hands.",
    [
      "Houston runs on industry: goods are plentiful, prices for hardware are kind, and the people respect competence over pedigree.",
      "The trade loop is strongest here — buy where things are made, sell where they are wanted. The quartermasters remember who pays on time.",
    ],
    ["lore", "houston", "setting"],
    ["lore-the-world", "mechanic-markets"],
  ),
  e(
    "lore-miami",
    "Miami",
    "world",
    "Ports, cash, and everyone passing through.",
    [
      "Miami is the crossroads: ports bring goods and strangers in equal measure, cash moves fast, and today's ally is tomorrow's rumor.",
      "Information is the local currency. Notables here hear things first — if you are on good terms, you hear them second.",
    ],
    ["lore", "miami", "setting"],
    ["lore-the-world", "mechanic-notables"],
  ),
  e(
    "lore-who-you-are",
    "Who you are",
    "world",
    "A captain with a company, a reputation to build, and bills to pay.",
    [
      "You are the head of a small armed company in a country that has no use for the term. No titles, no lands to start — just troops who expect to be paid, notables who expect to be courted, and a map full of people with problems.",
      "Everything you become in this game is earned on the ledger of relations and the ledger of money. The codex can explain the mechanics. The rest is up to you.",
    ],
    ["lore", "player", "captain", "character"],
    ["lore-the-world", "lore-rook-reyes", "lore-origins", "mechanic-party", "mechanic-ledger"],
  ),
  e(
    "lore-the-codex",
    "About this codex",
    "world",
    "What this reference covers and what it does not.",
    [
      "The codex documents every mechanic in the client: the controls, the settings, the command layer, the campaign systems, and the economy. If the game lets you do it, there is an entry explaining it.",
      "It does not document the simulation's internals — damage formulas, AI behavior, exact numbers the server owns. Those belong to the simulation, and the codex is a player's reference, not a modder's manual.",
      "If a mechanic exists and has no entry, that is a bug in the codex. The coverage test enforces it: every input action and every setting must be tagged on an entry.",
    ],
    ["codex", "about", "help"],
    [],
  ),
];
