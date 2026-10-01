/**
 * Deterministic quest seed (MASTER_PLAN task 114).
 *
 * 120 quests, generated from category templates with no randomness: every
 * entry is a pure function of its index, so the roster is identical on every
 * load and in every test. Gritty, not cute — the locked geographies are
 * NYC, Los Angeles, Houston and Miami.
 */

import type { Quest, QuestCategory, QuestStatus } from "./types.js";

const SETTLEMENTS = [
  "the Bronx",
  "Queens",
  "Harlem",
  "Red Hook",
  "South Central",
  "East LA",
  "Long Beach",
  "the Heights",
  "Fifth Ward",
  "Little Havana",
  "Overtown",
  "Hialeah",
] as const;

const GIVERS = [
  "Vic the Fence",
  "Marisol Vega",
  "Deacon Pryce",
  "Big Sal",
  "Odessa Kane",
  "Rook",
  "Father Amaro",
  "Lena Cross",
  "Tommy Wires",
  "Auntie Pearl",
  "Marcus Holt",
  "The Dispatcher",
] as const;

interface Template {
  category: QuestCategory;
  title: (s: string, g: string, i: number) => string;
  summary: (s: string, g: string, i: number) => string;
  objectives: (s: string, g: string) => string[];
  reward: (i: number) => string;
}

const GOODS = ["rifle crates", "antibiotics", "diesel", "canned food", "radio parts", "boots", "bandages"];

const TEMPLATES: Template[] = [
  {
    category: "war",
    title: (s) => `Purge the ${s} raiders`,
    summary: (s, g) => `${g} is done paying tribute. Drive the raider crew out of ${s} and make sure they don't come back bleeding on the doorstep.`,
    objectives: (s) => [`Find the raider camp near ${s}`, `Break their crew in a fight`, `Report back alive`],
    reward: (i) => `$${800 + (i % 9) * 150}`,
  },
  {
    category: "war",
    title: (s) => `Hold the ${s} overpass`,
    summary: (s, g) => `A rival crew wants the overpass at ${s} because whoever holds it taxes everything that rolls through. ${g} wants it held.`,
    objectives: (s) => [`Take the overpass at ${s}`, `Hold it until the convoy passes`, `Leave a crew to keep it`],
    reward: () => `toll rights for a month`,
  },
  {
    category: "trade",
    title: (s, _g, i) => `Move ${GOODS[i % GOODS.length]} to ${s}`,
    summary: (s, g, i) => `${g} has buyers in ${s} and goods that won't move themselves. Get ${GOODS[i % GOODS.length]} across without losing the load to thieves or tolls.`,
    objectives: (s, g) => [`Load up at ${g}'s warehouse`, `Reach ${s} with the load intact`, `Collect payment`],
    reward: (i) => `$${500 + (i % 7) * 100}`,
  },
  {
    category: "trade",
    title: (s) => `Break the ${s} blockade`,
    summary: (s, g) => `Someone is choking the road into ${s} and ${g}'s margins are dying with it. Find who's running the blockade and end it — quiet or loud, your call.`,
    objectives: (s) => [`Scout the blockade at ${s}`, `Remove whoever runs it`, `Reopen the road`],
    reward: () => `a cut of every caravan for a season`,
  },
  {
    category: "bounty",
    title: (_s, _g, i) => `Collect on ${GIVERS[(i + 5) % GIVERS.length]}`,
    summary: (s, g, i) => `${GIVERS[(i + 5) % GIVERS.length]} skipped out on a debt to ${g} and was last seen near ${s}. Bring them in breathing — dead pays half and starts a feud.`,
    objectives: (s) => [`Track the mark to ${s}`, `Take them alive`, `Deliver them for payment`],
    reward: (i) => `$${1000 + (i % 6) * 200} alive, half dead`,
  },
  {
    category: "bounty",
    title: (s) => `The ${s} arsonist`,
    summary: (s, g) => `Three warehouses burned in ${s} this month. ${g} wants the arsonist's name and their hands, in that order.`,
    objectives: (s, g) => [`Find who burned the warehouses in ${s}`, `Bring proof to ${g}`, `Settle it`],
    reward: () => `$1,500 and a favor owed`,
  },
  {
    category: "escort",
    title: (s, _g, i) => `Walk ${GIVERS[(i + 3) % GIVERS.length]} through ${s}`,
    summary: (s, g, i) => `${GIVERS[(i + 3) % GIVERS.length]} has to cross ${s} and has made enemies doing it. ${g} is paying for a quiet walk, not a war — but be ready for one.`,
    objectives: (s) => [`Meet the client`, `Cross ${s} without losing them`, `Get paid`],
    reward: (i) => `$${600 + (i % 5) * 120}`,
  },
  {
    category: "escort",
    title: (_s, _g, i) => `Convoy the ${GOODS[(i + 2) % GOODS.length]} shipment`,
    summary: (s, g, i) => `${g}'s ${GOODS[(i + 2) % GOODS.length]} shipment rolls at dawn and every crew between here and ${s} knows it. Ride shotgun.`,
    objectives: (s) => [`Join the convoy at dawn`, `Get the shipment to ${s}`, `Drive off any ambush`],
    reward: () => `$900 plus first pick of the load`,
  },
  {
    category: "intrigue",
    title: (_s, g) => `Find who sold out ${g}`,
    summary: (s, g) => `Somebody talked and ${g}'s people bled for it in ${s}. Find the rat. Proof first — ${g} doesn't hang the wrong neck twice.`,
    objectives: (s) => [`Ask around ${s} without spooking anyone`, `Get proof of the betrayal`, `Name the rat`],
    reward: () => `a seat at the table`,
  },
  {
    category: "intrigue",
    title: (s) => `Plant the ledger in ${s}`,
    summary: (s, g) => `${g} needs a rival's books to surface in the wrong hands in ${s}. Get in, plant the ledger where it'll be found, get out unseen.`,
    objectives: (s) => [`Case the drop site in ${s}`, `Plant the ledger`, `Leave no trace`],
    reward: () => `$1,100, no questions`,
  },
  {
    category: "exploration",
    title: (s) => `Map the ${s} tunnels`,
    summary: (s, g) => `Nobody knows the full tunnel map under ${s} and ${g} is tired of surprises. Go down, map it, come back with something worth the risk.`,
    objectives: (s) => [`Enter the tunnels under ${s}`, `Chart the main passages`, `Mark the dangers`],
    reward: (i) => `$${700 + (i % 4) * 100}`,
  },
  {
    category: "exploration",
    title: (s) => `Scout the ${s} perimeter`,
    summary: (s, g) => `${g} wants to know what's really holding ${s} before committing people to it: numbers, guns, walls, weak points. Eyes only — don't start anything.`,
    objectives: (s) => [`Circle the perimeter of ${s}`, `Count guns and walls`, `Report the weak points`],
    reward: () => `$650 and a warm bed`,
  },
  {
    category: "aid",
    title: (s) => `Get medicine to ${s}`,
    summary: (s, g) => `Fever's moving through ${s} and ${g}'s clinic is dry. The medicine exists; the road doesn't. Make the road exist.`,
    objectives: (s) => [`Secure the medicine`, `Get it to ${s} before more die`, `Don't get robbed on the way`],
    reward: () => `the clinic's eternal gratitude (and free patching)`,
  },
  {
    category: "aid",
    title: (s) => `Rebuild the ${s} well`,
    summary: (s, g) => `The well in ${s} is fouled and people are drinking ditch water. ${g} has parts and hands but no one to keep the crews alive while they work. That's you.`,
    objectives: (s) => [`Guard the work crew in ${s}`, `Keep the parts from walking off`, `See the well running`],
    reward: (i) => `$${400 + (i % 5) * 80} and clean water`,
  },
  {
    category: "war",
    title: (s) => `Silence the ${s} guns`,
    summary: (s, g) => `A rooftop crew in ${s} is taxing ${g}'s people with sniper fire. Take the roof, take the rifles, end the tax.`,
    objectives: (s) => [`Find the sniper nest in ${s}`, `Take the roof`, `Bring back the rifles`],
    reward: () => `the rifles, keep them`,
  },
  {
    category: "trade",
    title: (s, _g, i) => `Smuggle ${GOODS[(i + 4) % GOODS.length]} past the ${s} checkpoint`,
    summary: (s, g, i) => `The checkpoint at ${s} skims everything. ${g} wants ${GOODS[(i + 4) % GOODS.length]} through without paying the skim. Bribe, sneak, or go around — just don't get caught.`,
    objectives: (s) => [`Get past the ${s} checkpoint`, `Deliver the goods unskimmed`, `Keep your name out of it`],
    reward: (i) => `$${750 + (i % 6) * 125}`,
  },
  {
    category: "bounty",
    title: (s) => `The ${s} poisoner`,
    summary: (s, g) => `Someone's been dosing the wells around ${s} to soften it up. ${g} wants them found before the next dose — the town's already half sick with fear.`,
    objectives: (s) => [`Find the poison source near ${s}`, `Stop the poisoner`, `Prove it's over`],
    reward: () => `$1,300`,
  },
  {
    category: "escort",
    title: (s) => `Get the doctor to ${s}`,
    summary: (s, g) => `There's one surgeon ${g} trusts and she's on the wrong side of ${s}. Get her through the bad streets to the clinic. She's worth more than all of us.`,
    objectives: (s) => [`Find the surgeon`, `Escort her through ${s}`, `Deliver her to the clinic`],
    reward: () => `free surgery, forever`,
  },
  {
    category: "intrigue",
    title: (_s, _g, i) => `Turn ${GIVERS[(i + 7) % GIVERS.length]}`,
    summary: (s, g, i) => `${GIVERS[(i + 7) % GIVERS.length]} works for ${g}'s rival in ${s} and has debts. Debts are handles. Turn them into an ear inside the rival's camp.`,
    objectives: (s) => [`Find leverage on the mark in ${s}`, `Make the offer they can't refuse`, `Get the first report`],
    reward: () => `$1,000 and a permanent ear`,
  },
  {
    category: "exploration",
    title: (s) => `Chart the wreck yards past ${s}`,
    summary: (s, g) => `The wreck yards past ${s} are full of salvage nobody's claimed because nobody's mapped the hazards. ${g} wants the map; you get a cut of what it finds.`,
    objectives: (s) => [`Survey the wreck yards past ${s}`, `Mark hazards and salvage`, `Bring back the chart`],
    reward: () => `a third of the first salvage run`,
  },
];

/** Deterministic status: ~60% active, ~20% completed, ~20% failed. */
function statusFor(i: number): QuestStatus {
  const r = i % 10;
  if (r < 6) return "active";
  if (r < 8) return "completed";
  return "failed";
}

export const SEED_QUEST_COUNT = 120;

/** The full deterministic quest roster. Pure function of nothing but the templates. */
export function seedQuests(): Quest[] {
  const out: Quest[] = [];
  for (let i = 0; i < SEED_QUEST_COUNT; i++) {
    const t = TEMPLATES[i % TEMPLATES.length]!;
    const s = SETTLEMENTS[i % SETTLEMENTS.length]!;
    const g = GIVERS[(i * 5 + 1) % GIVERS.length]!;
    const status = statusFor(i);
    const objTexts = t.objectives(s, g);
    const objectives = objTexts.map((text, oi) => ({
      id: `q${i + 1}-o${oi + 1}`,
      text,
      // Completed quests have all objectives done; failed have some; active have few.
      done: status === "completed" || (status === "failed" ? oi < objTexts.length - 1 : oi === 0 && i % 3 === 0),
    }));
    out.push({
      id: `q-${String(i + 1).padStart(3, "0")}`,
      title: t.title(s, g, i),
      summary: t.summary(s, g, i),
      giver: g,
      settlement: s,
      category: t.category,
      status,
      objectives,
      reward: t.reward(i),
      daysLeft: i % 4 === 0 ? null : ((i * 7) % 14) + 1,
      startedDay: 1000 + i,
    });
  }
  return out;
}
