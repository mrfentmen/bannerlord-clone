/**
 * Codex corpus (MASTER_PLAN task 123). Part 2: command, campaign, economy.
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

export const COMMAND_ENTRIES: CodexEntry[] = [
  e(
    "mechanic-command-radial",
    "Command radial",
    "command",
    "Hold Space, flick toward an order, release to issue it.",
    [
      "The radial is the fast path for orders in battle: hold the menu key, flick the pointer toward attack, follow, hold, or retreat, and release. The order goes to whatever is selected.",
      "The wedge math has a dead zone around the center, so small pointer drift does not misfire an order. Arrow keys plus Enter work as a full keyboard path, and releasing without a flick cancels cleanly.",
      "The commander talks to the battle scene through a narrow command surface — the radial never touches the simulation directly, which is why it stays responsive when the battle gets heavy.",
    ],
    ["radial", "command menu", "orders"],
    ["action-battle-command-menu", "mechanic-unit-selection", "mechanic-deployment"],
  ),
  e(
    "mechanic-unit-selection",
    "Unit selection",
    "command",
    "Click, Shift+click, drag a box, or select all — then give orders.",
    [
      "Click selects the nearest unit, Shift+click toggles units in and out of the selection, and dragging a marquee box selects everything inside it. The select-all action grabs the whole force.",
      "Selection is the precondition for everything else: orders from the radial or the order keys go to the current selection. An empty selection means the radial has nobody to command.",
      "Assign selections to control groups (Ctrl+1..4) to get them back with a single digit in the middle of a fight.",
    ],
    ["selection", "select", "units"],
    ["action-battle-select-all", "mechanic-control-groups", "mechanic-command-radial"],
  ),
  e(
    "mechanic-deployment",
    "Deployment map",
    "command",
    "Top-down battlefield preview: read the terrain, place your units, then fight.",
    [
      "Before a battle you get the deployment map: a top-down rendering of the actual battlefield terrain — elevation shading, biome tint, water, cover objects, and your spawn zone — with a north arrow and scale bar.",
      "Pick a unit card from the roster, click inside your deployment zone to place it. Drag placed units to reposition; invalid drops (off-map, outside the zone, in water, inside cover) roll back with the reason shown.",
      "Keyboard works too: arrows nudge the selected unit, Delete removes it. Confirm when the formation reads right — the map emits placements and gets out of the way.",
    ],
    ["deployment", "battlefield", "terrain", "spawn zone", "placement"],
    ["mechanic-battle-basics", "mechanic-command-radial"],
  ),
  e(
    "mechanic-battle-basics",
    "Battle: the basics",
    "command",
    "Deploy, fight, live with the result. The flow, not the simulation.",
    [
      "Battles run deploy, then fight, then result. Deployment sets your starting formation on real terrain; the fight itself is the simulation's business; the result screen settles experience, loot, and consequences.",
      "Orders during the fight go through the radial or the order keys to your current selection. The four orders are attack, hold, follow, and retreat — learn what each costs before you need it.",
      "After the action, experience is awarded to the troops who earned it and the campaign moves on. Battles are how wars are decided; the campaign is how you decide which battles are worth fighting.",
    ],
    ["battle", "combat", "fight"],
    ["mechanic-deployment", "mechanic-command-radial", "mechanic-troop-xp"],
  ),
];

export const CAMPAIGN_ENTRIES: CodexEntry[] = [
  e(
    "mechanic-time-controls",
    "Time controls",
    "campaign",
    "Pause, run the clock faster or slower, or skip to your arrival.",
    [
      "The campaign clock runs in real time scaled to game days. The time controls pause it outright or run it at different speeds — pausing is free and there is no penalty for thinking.",
      "Skip to arrival jumps the clock to the end of your party's current march. Useful when the road is safe and the destination is the whole point; less useful when the road is the point.",
    ],
    ["time", "pause", "speed", "skip", "clock"],
    ["mechanic-marching"],
  ),
  e(
    "mechanic-marching",
    "Marching",
    "campaign",
    "Plan a route in the march planner, pay the cost, commit, walk.",
    [
      "The march planner shows the route, the distance, and what the march will cost before you commit. Committing sets the destination and deducts the cost up front — no credit on the road.",
      "Your party moves along the route as the clock runs. You can skip to arrival, but a march through contested ground deserves your attention, not your fast-forward key.",
    ],
    ["march", "travel", "route", "movement"],
    ["mechanic-time-controls", "mechanic-upkeep"],
  ),
  e(
    "mechanic-settlements",
    "Settlements",
    "campaign",
    "Towns and cities are where everything happens: markets, notables, recruits.",
    [
      "The campaign plays out across the four metro regions — New York City, Los Angeles, Houston, Miami — and the settlements inside them. Each settlement has its own market prices, its own notables, and its own troubles.",
      "Use next/previous settlement to hop the camera between them when you are comparing opportunities. What a settlement offers depends on who runs it and how they feel about you.",
    ],
    ["settlement", "town", "city", "map"],
    ["mechanic-markets", "mechanic-notables", "lore-the-world"],
  ),
  e(
    "mechanic-quest-journal",
    "Quest journal",
    "campaign",
    "Active, completed, and failed quests with filters. On the HUD rail.",
    [
      "Every job you take lands in the journal with its giver, location, objectives, reward, and deadline. Status tabs split active, completed, and failed; the category dropdown and search narrow the list.",
      "Failed quests stay in the journal. That is deliberate — a failed job is information about who not to trust and what not to attempt twice.",
      "New quests arrive from notables and from the world. The journal only records what you have been told; it does not generate work on its own.",
    ],
    ["quest", "journal", "objectives"],
    ["mechanic-notables"],
  ),
  e(
    "mechanic-why-chains",
    '"Why?" explanations',
    "campaign",
    "Every number in the UI can explain itself. Click it.",
    [
      "Numbers with a why-action open a chain showing exactly how the figure was computed — which sources fed it, in what order. When the ledger surprises you, the chain is the receipt.",
      "This is the antidote to black-box simulation: if the game claims you owe wages or a march costs what it costs, the arithmetic is inspectable on the spot.",
    ],
    ["why", "explanation", "transparency"],
    ["mechanic-ledger", "mechanic-marching"],
  ),
  e(
    "mechanic-data-source",
    "Where the data comes from",
    "campaign",
    "The HUD rail's data-source button tells you what is live and what is fixture.",
    [
      "The client can run against the live simulation or against a local fixture. The data-source panel says which one you are looking at, because decisions made on fixture data should know they are.",
      "Fixture mode exists for development and testing. If the panel says fixture, treat prices, troop counts, and notables as stand-ins.",
    ],
    ["data source", "fixture", "simulation"],
    [],
  ),
];

export const ECONOMY_ENTRIES: CodexEntry[] = [
  e(
    "mechanic-ledger",
    "Ledger",
    "economy",
    "Every credit and debit, by source, with warnings before you hit zero.",
    [
      "The ledger lists every income and expense line by source, with the net change per day per resource and how long each resource lasts at current burn.",
      "Warnings fire before a resource reaches zero, not after. 'You are out of money' is a state, and by the time it is a state there is nothing left to do about it — the ledger's job is to make sure you see it coming.",
    ],
    ["ledger", "economy", "income", "expense", "warnings"],
    ["mechanic-upkeep", "mechanic-why-chains"],
  ),
  e(
    "mechanic-upkeep",
    "Upkeep and wages",
    "economy",
    "Your party burns money and supplies every day. Unpaid wages become debt.",
    [
      "Each day ticks upkeep off your purse and your stores: troop wages, food, and the general cost of keeping an armed company on the road.",
      "If you cannot pay, wages do not go negative — they become wages owed, a debt on the books. Debt is honest, but troops who are owed too long start asking questions you do not want to answer.",
    ],
    ["upkeep", "wages", "debt", "daily"],
    ["mechanic-ledger", "mechanic-party"],
  ),
  e(
    "mechanic-markets",
    "Markets and trade",
    "economy",
    "Buy low where it is cheap, sell where it is not. Prices are local.",
    [
      "Every settlement runs its own market with its own prices. Trade is the honest loop: buy goods where they are plentiful, haul them where they are scarce, pocket the difference.",
      "Relations matter at the market stall. Notables who like you open better prices; the ones who do not will still sell to you, at the stranger's rate.",
    ],
    ["market", "trade", "prices", "goods"],
    ["mechanic-settlements", "mechanic-notables", "mechanic-marching"],
  ),
  e(
    "mechanic-notables",
    "Notables and relations",
    "economy",
    "Local powers with a -100 to +100 opinion of you. Gifts and favors move it.",
    [
      "Notables run their settlements: the fixer, the quartermaster, the priest, the boss. Each tracks relations with you from -100 to +100, and relations unlock prices, recruits, and quests.",
      "Gifts and favors raise relations. Asking for recruits or work spends the goodwill you have built — the ask-quest and ask-recruits options are there when you have earned them.",
      "Talk to them. The map shows you places; notables tell you what is happening in them.",
    ],
    ["notable", "relations", "reputation", "gifts", "favors", "recruit"],
    ["mechanic-recruitment", "mechanic-markets", "mechanic-quest-journal"],
  ),
  e(
    "mechanic-recruitment",
    "Recruitment",
    "economy",
    "Hire troops through notables. More mouths, more wages, more strength.",
    [
      "Troops come from notables who have people to spare — the ask-recruits action, unlocked by good relations. You do not hire an army from a menu; you convince someone to lend you their people.",
      "Every recruit adds daily wages to your burn. Recruit for the war you are actually going to fight, not the one that flatters you.",
    ],
    ["recruit", "troops", "hire"],
    ["mechanic-notables", "mechanic-upkeep", "mechanic-troop-xp"],
  ),
  e(
    "mechanic-troop-xp",
    "Troop experience and upgrades",
    "economy",
    "Battles award experience; experience buys better troops.",
    [
      "After a battle, experience is awarded to the troops who fought it. Veterans hit harder and break later than fresh hires with the same equipment.",
      "Upgrading troops converts experience and resources into better fighters. It is the slowest, most reliable way to get stronger — no single battle will do what a season of upgrades does.",
    ],
    ["experience", "xp", "upgrade", "veterans", "troops"],
    ["mechanic-recruitment", "mechanic-battle-basics"],
  ),
  e(
    "mechanic-taxes",
    "Taxes",
    "economy",
    "Set tax rates per town and per state. Revenue now, resentment later.",
    [
      "If you hold towns, you can set their tax rates — per town, or per state for the whole territory. Taxes are the steadiest income in the game and the fastest way to make a population hate you.",
      "The rate is a dial, not a switch. Squeeze too hard and the revenue dries up along with the goodwill; too soft and you are funding an army on pocket change.",
    ],
    ["tax", "taxes", "revenue", "town"],
    ["mechanic-ledger", "mechanic-settlements"],
  ),
  e(
    "mechanic-construction",
    "Construction",
    "economy",
    "Start building projects in your towns. They cost now and pay later.",
    [
      "Towns you hold can start construction projects — walls, workshops, the unglamorous infrastructure that makes a place worth holding. Projects cost resources up front and take time.",
      "Build for the town you want in a season, not the battle you want tomorrow.",
    ],
    ["construction", "building", "town"],
    ["mechanic-taxes", "mechanic-settlements"],
  ),
  e(
    "mechanic-party",
    "Your party",
    "economy",
    "Your warband on the road: troops, stores, and the daily burn.",
    [
      "The party is you and everyone who marches with you — the unit that moves on the map, fights the battles, and eats the food. Everything in the campaign is something the party does or something done to it.",
      "The party panel shows troops, stores, and condition. Watch the daily burn there the way you watch the road ahead: both will kill you if you ignore them.",
    ],
    ["party", "warband", "troops", "stores"],
    ["mechanic-upkeep", "mechanic-marching", "mechanic-recruitment"],
  ),
];
