/**
 * Codex corpus (MASTER_PLAN task 123). Part 5: deep lore.
 *
 * This is the game's story bible, wired into the client: the Unraveling that
 * broke the country, the Front Range the client loads, all six factions as
 * lore, the figures who shape the map \u2014 including Rook Reyes, the NPC
 * company captain \u2014 and the life-path origins the player chooses in the
 * character maker (mirroring `data/backgrounds.ts`). Every entry is written
 * against the real data: faction entries mirror `data/sides.ts`
 * SIDE_DEFINITIONS, and the Front Range entry mirrors the region the client
 * actually loads.
 *
 * Note: there is no canon player character. The player is whoever they make
 * in the character maker \u2014 any name, any origin. Rook is a leader on the
 * map, not the player.
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

export const LORE_ENTRIES: CodexEntry[] = [
  e(
    "lore-families",
    "The families of the new country",
    "world",
    "Six kinds of family survived the Unraveling. Yours decides your first strengths.",
    [
      "The old country had classes; the new one has families. When the institutions fell, what you inherited was not money or titles but a trade, a temperament, and a name people recognized. Six family kinds cover nearly everyone you will meet.",
      "Badge families wore the uniform \u2014 cops, troopers, Guard. They raised children who stand straight and know how the system works, and they grant a commanding presence. Merchant families ran storefronts, trucking lines, warehouses; their children can smell a bad deal at fifty paces. Farm families worked their own land and answer to no one; their children do not scare easy. Trade families were mechanics, welders, machinists \u2014 the shop was the family church, and their children can fix anything with moving parts.",
      "Outdoors families were guides and trappers who never quite lived indoors; their children read sign and move quiet. Contractor families did private security and convoy guard work \u2014 war was the family business, and some of it rubbed off on the kids. Nobody chooses their family, but everyone chooses what to do with what it gave them.",
    ],
    ["lore", "family", "families", "background", "character", "origins"],
    ["lore-origins", "lore-who-you-are", "lore-the-unraveling"],
  ),
  e(
    "lore-origins",
    "Where you come from",
    "world",
    "Your past is yours to choose: family first, then childhood, youth, training, and profession.",
    [
      "Nobody in this country is born to anything anymore \u2014 which means everyone is the author of their own beginning. In the character maker you choose five chapters of your life, and each one leaves its mark on your skills and your starting purse.",
      "First comes family: the badge, the business, the farm, the shop, the wilds, or the war. Then childhood is where you grew up: the housing projects, the suburbs, a small town, or the foster system. Youth is what you did as a teenager: athletics, hustling, studying, or running with a crew. Training is how you learned to handle yourself: the military, the boxing gym, the street, or your own hard schooling. Profession is what you did before all this: turning wrenches, patching people up, moving product, or wearing a badge.",
      "None of these are destiny. A foster kid who became a medic commands the same respect as a suburban athlete who learned logistics \u2014 what matters is what you do with the company once the campaign starts. But people will read your past in your bearing, and the map remembers where everyone started.",
    ],
    ["lore", "origins", "background", "character", "family", "backstory"],
    ["lore-families", "lore-who-you-are", "lore-the-world", "lore-front-range"],
  ),
  e(
    "lore-rook-reyes",
    "Rook Reyes",
    "world",
    "Captain of the Rook Company. Pays on time. Remembers everything.",
    [
      "Sam Reyes ran transportation for the Colorado National Guard out of Fort Carson \u2014 fuel, spare parts, convoy schedules, the unglamorous arithmetic that keeps an army moving. When the Unraveling dissolved the chain of command, Reyes held the Pueblo depot for eleven months on paperwork, promises, and stubbornness, feeding whoever showed up with a truck and a useful skill.",
      "When the depot finally emptied, Reyes walked out with forty drivers, twelve working rigs, and a ledger of every favor owed in three counties. That ledger became the Rook Company. The callsign comes from the chess piece: not the strongest on the board, but the one that moves straight and hits hard along the lines everyone else forgets to watch.",
      "Reyes is in their late thirties, pragmatic to the bone, and famous for two things: paying on time, and remembering \u2014 exactly \u2014 who did not. Every faction on the map has tried to hire, buy, or bury the Rook Company. None of them have managed it yet. Cross Reyes on a contract and you will find out why.",
    ],
    ["lore", "rook", "reyes", "npc", "captain", "character"],
    ["lore-the-company", "lore-the-unraveling", "lore-front-range", "lore-who-you-are"],
  ),
  e(
    "lore-the-company",
    "The Rook Company",
    "world",
    "Forty drivers, twelve rigs, and a ledger of favors. Currently your competition.",
    [
      "The Rook Company started as a convoy outfit \u2014 guarding grain up I-25, running medicine through the passes, hauling fuel where the pipelines went quiet. It survived because Reyes understood something the warlords did not: in a broken country, logistics is a superpower. Anyone can seize a town. Few can keep it fed through winter.",
      "The company takes contracts from anyone whose money is good and whose cause does not require atrocities. That rule has cost Reyes work and earned something rarer: a reputation for keeping its word, which in the current market trades above gold.",
      "If you run convoys in the Front Range, you will cross the Rook Company \u2014 as a client, a rival, or an employer. Reyes does not hold grudges over honest competition. Dishonest competition is another matter, and the ledger remembers.",
    ],
    ["lore", "company", "rook company", "faction", "npc"],
    ["lore-rook-reyes", "lore-front-range", "mechanic-party", "mechanic-ledger"],
  ),
  e(
    "lore-the-unraveling",
    "The Unraveling",
    "world",
    "How the country broke: not with a war, but with a long series of quiet failures.",
    [
      "There was no single day the United States ended. There was a decade of grid failures, supply shocks, and a federal government that answered each crisis a little slower than the last \u2014 until one winter the answers stopped coming at all. Historians call it the Unraveling. Everyone who lived it calls it the Quiet Years.",
      "States did what states do when the center goes silent: they made their own arrangements. Governors became executives, executives became rulers, and the interstate compacts \u2014 first drawn up for disaster relief \u2014 hardened into the six factions that divide the map today.",
      "No kings, no constitutions worth the paper. Power now belongs to whoever can feed a town through winter, fuel a convoy across a state line, and make a promise that holds until spring. That is the entire political theory of the age, and it has held for twenty years.",
    ],
    ["lore", "unraveling", "history", "collapse", "setting"],
    ["lore-the-world", "lore-timeline", "lore-faction-mountain-alliance"],
  ),
  e(
    "lore-timeline",
    "A short history of the collapse",
    "world",
    "Twenty years from the first blackouts to the campaign's first day.",
    [
      "The Brownout Years \u2014 rolling grid failures across three summers. The federal response is slow but real, and most people assume it is temporary. It is not.",
      "The Quiet Winter \u2014 the winter the supply chains stopped recovering. Shelves empty in February and stay empty. States activate their guards and stop waiting for Washington.",
      "The Compact Era \u2014 the interstate compacts, written for disaster relief, become governments in fact. Six of them survive the decade. The rest are absorbed or dissolve.",
      "The Ledger Peace \u2014 no treaty, no surrender, just exhaustion. The factions stop trying to reunite the country and start trying to outlast each other. Caravan guards become companies. Companies become powers.",
      "Today \u2014 a new captain takes the field in the Front Range with a company to feed and a reputation to build. The map is full of people with problems, and every faction is hiring. What happens next is yours to write.",
    ],
    ["lore", "timeline", "history", "unraveling"],
    ["lore-the-unraveling", "lore-the-world", "lore-origins"],
  ),
  e(
    "lore-front-range",
    "The Front Range",
    "world",
    "Where the campaign begins: the I-25 corridor under the Rockies, and the reason it matters.",
    [
      "The Front Range is the urban corridor along Colorado's eastern slope \u2014 Fort Collins to Pueblo, with Denver and Colorado Springs in between \u2014 backed against high-country mines and thin cropland. This client loads that region: its cities, its passes, its problems.",
      "It matters for three reasons. First, the I-25 corridor is the only reliable north-south artery between the plains and the mountains, which makes every depot on it a toll booth. Second, the high country holds gold and metal mines that never stopped producing. Third, the water comes off the Rockies, and whoever controls the headwaters negotiates from strength in every dry year.",
      "The ghosts are military: Fort Carson, the old NORAD complex, a dozen Guard armories. The weapons mostly walked away years ago. What remained \u2014 the motor pools, the fuel farms, the people who know how logistics works \u2014 is worth more than the guns ever were. That is why the Rook Company is here, and why everyone else is watching.",
    ],
    ["lore", "front range", "colorado", "region", "setting"],
    ["lore-the-world", "lore-rook-reyes", "lore-faction-mountain-alliance"],
  ),
  e(
    "lore-faction-pacific-compact",
    "Pacific Compact",
    "world",
    "Rich ports, thin farms, and the best spies on the map.",
    [
      "California, Oregon, Washington, Hawaii, Alaska. The Compact is the richest faction on paper: ports, trade, and the tech industry that survived the Unraveling better than anyone expected. Its intelligence service is the finest on the continent \u2014 what it tells you about your rivals is usually true, which is more than anyone else can say.",
      "The weakness is food. Compact cities eat what they do not grow, and the inland farms they depend on know it. Cut the supply roads and the great coastal cities go hungry in weeks. The coastal counties and the inland ones have never liked each other, and water disputes between rulers flare every dry summer.",
      "Its way of war is the port: every harbor adds income, and every blockaded harbor bleeds the whole faction. The Compact does not need to win battles. It needs its ships to keep moving.",
    ],
    ["lore", "faction", "pacific compact", "pacific", "setting"],
    ["lore-the-world", "lore-los-angeles", "lore-the-unraveling"],
  ),
  e(
    "lore-faction-mountain-alliance",
    "Mountain Alliance",
    "world",
    "Eight mountain states, thin population, ground nobody can take.",
    [
      "Montana, Idaho, Wyoming, Utah, Colorado, Nevada, Arizona, New Mexico. The Alliance holds the hardest ground on the map: attackers lose speed and men in the passes, and the high-country mines pour out gold and metal to pay for mercenaries and equipment.",
      "The price is people. The Alliance has the smallest population of any faction \u2014 armies are small, losses are irreplaceable, and the settlements are far apart across hungry land. Its rulers are fiercely independent, which makes the Alliance nearly impossible to conquer piecemeal and painfully slow to unite behind anything.",
      "The Front Range sits in Alliance territory, which means the passes are your shield and the empty miles are your tax. Hold the high ground and nobody takes it from you. Try to project power past it and the mountains charge by the mile.",
    ],
    ["lore", "faction", "mountain alliance", "mountain", "setting"],
    ["lore-the-world", "lore-front-range", "lore-the-unraveling"],
  ),
  e(
    "lore-faction-great-lakes-union",
    "Great Lakes Union",
    "world",
    "The breadbasket. Everyone wants its grain, and everyone knows it.",
    [
      "The Dakotas, Nebraska, Kansas, Iowa, Minnesota, Wisconsin, Michigan, Illinois, Indiana, Ohio, Missouri. The Union grows the food that feeds the continent and forges the metal that arms it, with the deepest pool of recruits anywhere.",
      "That is also its curse. Every faction courts the Union and every faction plans to rob it. The flat open terrain is brutally hard to defend, the member rulers fight endlessly over selling grain versus stockpiling it, and one bad harvest can split the whole compact along the fault lines.",
      "The Union's dilemma is the continent's in miniature: sell the harvest for gold and go hungry, or keep it and make enemies of everyone at the table. Its quartermasters have been threading that needle for twenty years.",
    ],
    ["lore", "faction", "great lakes union", "lakes", "setting"],
    ["lore-the-world", "lore-the-unraveling"],
  ),
  e(
    "lore-faction-southern-compact",
    "Southern Compact",
    "world",
    "The fastest armies on the map, funded by the thinnest treasury.",
    [
      "Kentucky, Tennessee, Arkansas, Louisiana, Mississippi, Alabama, Georgia, Florida, the Carolinas. The Compact fields large, ready militaries from cheap recruits and mobilizes faster than anyone \u2014 when the call goes out, its armies are marching before the other factions finish their councils.",
      "The bill comes due fast. The tax base is the weakest on the map, so long wars bankrupt it. Member rulers nurse old grudges and obey orders selectively, and every storm season batters the food supply the armies march on.",
      "Southern wars are won quickly or not at all. Its captains know it, its rivals know it, and the whole faction runs on the gamble that speed beats money. Sometimes it does.",
    ],
    ["lore", "faction", "southern compact", "south", "setting"],
    ["lore-the-world", "lore-the-unraveling"],
  ),
  e(
    "lore-faction-lone-star-frontier",
    "Lone Star Frontier",
    "world",
    "Texas and Oklahoma: energy, horses, and a very long supply line.",
    [
      "Texas and Oklahoma. The Frontier runs on energy and industry, works vast farmland, and fields the finest horse riders on the continent \u2014 its cavalry and raiders are unmatched at striking far and vanishing.",
      "The distances are the enemy. The Frontier is enormous, its cities sprawl too wide to garrison evenly, and every march from home burns more food and money than the same march anywhere else. It borders many rivals and counts few friends.",
      "Frontier doctrine is the long raid: hit where the enemy is weak, take what the horses can carry, and be gone before the ledger catches up. It has worked for twenty years. The ledger is still catching up.",
    ],
    ["lore", "faction", "lone star frontier", "texas", "setting"],
    ["lore-the-world", "lore-houston", "lore-the-unraveling"],
  ),
  e(
    "lore-faction-atlantic-corridor",
    "Atlantic Corridor",
    "world",
    "The banks, the ports, the old federal city \u2014 and no farms at all.",
    [
      "Maine to Virginia, including D.C. The Corridor holds the continent's richest banks and busiest ports, the largest population, and the hollowed-out shell of the old federal institutions \u2014 which still counts for something in every negotiation. Its diplomats and factors are the best money can buy, because the Corridor has the most of it.",
      "It cannot feed itself. Almost no farmland, the fastest-spreading outbreaks, and a universal resentment from everyone who owes it money \u2014 which is everyone. A cut road out west is a famine by spring.",
      "The Corridor fights with the ledger: loans, debts, and bribes on a scale no other faction can match. But a faction that runs on debt can be broken by it, and more than one Corridor factor has learned that the hard way.",
    ],
    ["lore", "faction", "atlantic compact", "atlantic", "corridor", "setting"],
    ["lore-the-world", "lore-new-york", "lore-the-unraveling"],
  ),
  e(
    "lore-figures",
    "People who matter",
    "world",
    "Three names you will hear in every depot between Pueblo and Fort Collins.",
    [
      "Marshal June Okafor holds the Alliance's southern passes and does not forgive trespass. She commanded engineers before the Unraveling, which means she thinks in bridges, chokepoints, and winters \u2014 and she has decided every new company in her territory is either an asset or a problem, and judges each one herself.",
      "Silas Vane is the Corridor's factor in the region: a banker with a smile and a ledger full of other people's debts. He has offered Rook Reyes money three times. The offers get bigger and the terms get worse, and Reyes keeps a copy of each one framed in the company office as a reminder.",
      "Deke Marsh runs the Marsh Jackals, a rival company that undercuts everyone on every contract and blames everyone else for every failure. Marsh is cheaper, faster, and utterly without the rule about atrocities. The Jackals are the reason every honest company in the Front Range sleeps with its boots on.",
    ],
    ["lore", "characters", "npc", "okafor", "vane", "marsh"],
    ["lore-rook-reyes", "lore-the-company", "lore-faction-mountain-alliance", "lore-faction-atlantic-corridor"],
  ),
];
