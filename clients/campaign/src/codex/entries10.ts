/**
 * Peoples and notable figures (del order 2026-10-04).
 *
 * The human landscape of the continent: the nomad bands, the regional
 * peoples, the new communities, and the figures whose names get spoken
 * in caravan camps and market halls.
 */

import type { CodexEntry } from "./types.js";

export const PEOPLE_ENTRIES: CodexEntry[] = [
  {
    id: "lore-people-highway-nomads",
    title: "The Highway Nomads",
    category: "world",
    tags: ["nomads", "highways", "peoples"],
    summary: "The clans that never stopped moving: truckers turned tribes on the interstate sea.",
    body: [
      "When the Unraveling broke the supply chains, the long-haul truckers kept driving — and never stopped. The Highway Nomads are their descendants: clan-convoys of rigs, buses, and jury-rigged haulers that live on the interstates permanently, trading transport for supplies, running goods between the cities, and answering to no faction. A nomad clan is part family, part company, part rolling town.",
      "Each clan runs a territory — a stretch of highway it knows better than anyone, with its fuel caches, its safe stops, its arrangements with the towns along the route. The clans trade with everyone and pledge to no one. Their neutrality is their business model: a faction that hires a clan gets the best drivers on the continent; a faction that robs one finds every clan on that highway suddenly unavailable.",
      "Nomad culture is the old trucker culture evolved: the CB slang became a dialect, the truck stops became holy ground, the logbooks became histories. The clans marry between convoys, raise their kids in sleeper cabs, and bury their dead at the mile markers. A nomad's word on a delivery date is better than most cities' contracts.",
      "For caravans, the nomads are the competition, the contractors, and sometimes the rescue. A merchant house that needs a load moved fast hires a clan. A caravan in trouble on a lonely highway prays a clan is running that stretch. And a young driver who wants to learn the roads signs on with a clan for a season — the education is worth more than the pay.",
    ],
    related: ["lore-state-texas", "lore-state-arizona"],
  },
  {
    id: "lore-people-riverfolk",
    title: "The Riverfolk",
    category: "world",
    tags: ["mississippi", "river", "peoples"],
    summary: "The barge clans of the Mississippi: the continent's oldest trade network, still floating.",
    body: [
      "The Mississippi never stopped being a highway. The Riverfolk — the barge clans, the towboat families, the dock crews — move more bulk cargo than all the caravans combined: grain down, fuel up, everything heavy and cheap riding the current. The river towns — Memphis, St. Louis, New Orleans — are their ports, and the clans treat the river like a nation treats its borders.",
      "Riverfolk culture is old: the towboat families go back generations, the dockworkers' unions survived the Unraveling intact, and the river's codes — right of way, distress signals, the obligations of the strong to the weak — are enforced by custom, not law. A barge captain's authority on their tow is absolute. A clan's feud with another clan can close a stretch of river until it's settled.",
      "The river's peoples are the South and Midwest mixed by water: Black deckhands from the Delta towns, white captains from the river counties, Vietnamese fishing families in the Louisiana marshes, the Cajun trappers of the bayous. The river doesn't care about your background; it cares whether you can work. The clans are the continent's most integrated communities because the water demands it.",
      "For land caravans, the riverfolk are the bulk alternative: anything too heavy for wagons goes by barge. The smart merchant houses run both — river for volume, road for speed and reach. A caravan driver who makes friends with a barge clan has a fallback when the roads close and a partner when the loads get big.",
    ],
    related: ["lore-city-new-orleans", "lore-state-tennessee"],
  },
  {
    id: "lore-people-desert-clans",
    title: "The Desert Clans",
    category: "world",
    tags: ["desert", "southwest", "peoples", "tribal"],
    summary: "The sovereign nations of the Southwest: Navajo, Hopi, Tohono O'odham, and the desert's old powers.",
    body: [
      "The desert was never empty, and the Unraveling reminded everyone. The tribal nations of the Southwest — the Navajo Nation, the Hopi, the Tohono O'odham, the Apache bands — are sovereign powers, not minorities. The Navajo Nation governs the largest reservation on the continent as a state in all but name, with its own police, its own courts, and its own foreign policy toward the surrounding states.",
      "The desert clans' power is water and land. The reservations hold the aquifers, the watersheds, and the corridors the highways need. Arizona's cities negotiate for water like nations negotiate for oil — because that's what it is. A tribal council's decision on a water compact shapes the fate of Phoenix more than any election.",
      "Desert culture is the continent's oldest: the ceremonies, the languages, the knowledge of the land that the newcomers are still learning. The clans took the Unraveling as confirmation — the old ways endure, the new ways break — and they've been generous with the lesson to those who listen. The trading posts on the reservation borders are where the desert's economy meets the continent's, and the clan traders drive hard bargains.",
      "For caravans, the desert nations are the powers you respect: their lands are crossed by arrangement, not by right. A merchant house that deals honestly with the clans — fair prices, kept promises, no trespass — finds reliable partners and safe passage. One that doesn't finds the desert very large and very empty, and the water very far away.",
    ],
    related: ["lore-state-arizona", "lore-city-phoenix"],
  },
  {
    id: "lore-people-rust-belt-makers",
    title: "The Rust Belt Makers",
    category: "world",
    tags: ["rust-belt", "makers", "peoples", "industrial"],
    summary: "The workshop culture of the old industrial heart: makers, fixers, and the pride of building.",
    body: [
      "The Rust Belt never stopped making things — it just stopped making them for the old economy. The Makers are the workshop culture of Pennsylvania, Ohio, and Michigan: the machinists, the fabricators, the engineers who stayed when the plants closed and rebuilt the industrial base one shop at a time. Their creed is simple: if it's broken, fix it; if it doesn't exist, build it.",
      "Maker culture is the old union culture evolved: the apprenticeships, the shop-floor codes, the pride in the work. The workshops are organized as cooperatives, family firms, and guild-like associations that set standards and settle disputes. A master maker's stamp on a repair is a warranty the continent trusts. The annual maker fairs — Pittsburgh's, Detroit's, Cleveland's — are the industry's high holidays.",
      "The makers' peoples are the old working class: the Polish and Slovak machinists, the Black tool-and-die men, the German engineers, the new immigrants learning the trades. The shops are the continent's most integrated workplaces because the work demands it — a tolerance for the person next to you is a job requirement when you're both holding the same hot steel.",
      "For caravans, the makers are the indispensable service: wagons repaired, weapons maintained, machines jury-rigged, all to a standard the continent relies on. A caravan that runs the Rust Belt keeps a maker's contact in every city. The prices are fair, the work is guaranteed, and the lectures on your maintenance habits are free.",
    ],
    related: ["lore-state-pennsylvania", "lore-state-ohio", "lore-state-michigan", "lore-city-detroit"],
  },
  {
    id: "lore-people-gulf-shrimpers",
    title: "The Gulf Shrimpers",
    category: "world",
    tags: ["gulf", "fishing", "peoples"],
    summary: "The fishing fleets of the Gulf: Vietnamese, Cajun, and the continent's seafood supply.",
    body: [
      "The Gulf of Mexico feeds the continent's seafood appetite, and the shrimpers work it the way their grandparents did — with boats, nets, and knowledge of the water that no machine replaces. The fleets are a mix of Vietnamese fishing families (refugees who became captains), Cajun trappers' descendants, and the old Gulf families who've worked these waters for centuries.",
      "Shrimper culture is the water's culture: the dawn departures, the superstitions, the dockside economies where the catch gets sold, iced, and shipped before noon. The fleets are organized in associations that manage the grounds, settle disputes, and negotiate with the ports. A captain's reputation on the docks is their credit rating — the fish houses extend terms based on character, not collateral.",
      "The Gulf's peoples converged on the water: the Vietnamese communities of Louisiana and Texas — the largest Vietnamese fishing fleet outside Vietnam — the Cajun French of the bayous, the Black fishing families of the Mississippi coast, the Mexican crews of the Texas bays. The docks are the continent's most multilingual workplaces, and the shared language is the catch.",
      "For caravans, the shrimpers are the seafood supply: the iced catch moves inland by wagon to every southern city. A merchant house that contracts with a fleet association gets the continent's best seafood at the dock price. The shrimpers' advice on the Gulf roads — the weather, the ports, the patrols — is worth more than the cargo.",
    ],
    related: ["lore-state-florida", "lore-city-new-orleans"],
  },
  {
    id: "lore-people-appalachian-hillfolk",
    title: "The Appalachian Hillfolk",
    category: "world",
    tags: ["appalachia", "mountains", "peoples"],
    summary: "The mountain people of the eastern highlands: old codes, deep roots, and the continent's best trackers.",
    body: [
      "Appalachia is the continent's oldest mountain culture: the hillfolk — Scots-Irish descendants, mostly, with the old codes intact — who've lived in these hollers since before the country existed. The Unraveling barely touched the deep mountains; the hillfolk were already living the life everyone else had to learn. Their opinion of the lowland chaos is unprintable and mostly correct.",
      "Hillfolk culture is the code: family first, word is bond, hospitality is sacred, and trespass is answered. The clans — extended families that function as governments — run the hollers by custom. The old skills never died here: tracking, hunting, herbalism, distilling, the music. A hillfolk tracker can follow a caravan through forest the lowlanders can't see into.",
      "The mountains' peoples are the old stock: the Scots-Irish majority, the Black communities of the coal towns, the Cherokee — who never left and whose nation governs the Qualla Boundary as sovereign land — and the newcomers the mountains attract: back-to-the-landers, veterans seeking quiet, artists seeking cheap. The hillfolk regard them all with the same wary hospitality: prove yourself, keep your word, and you're welcome.",
      "For caravans, the hillfolk are the mountain guides and the warning: the Appalachian crossings — the gaps, the ridges, the old roads — are safe with a hillfolk guide and dangerous without one. The clans trade ginseng, timber, and moonshine for the lowlands' goods. A merchant house that deals fair with the hillfolk finds the mountains open; one that doesn't finds them closed, completely, and permanently.",
    ],
    related: ["lore-state-tennessee", "lore-state-north-carolina"],
  },
  {
    id: "lore-people-figure-maria-santos",
    title: "María Santos — The Port Queen",
    category: "world",
    tags: ["figure", "miami", "trade", "cuban"],
    summary: "Miami's most powerful merchant: three generations of exile politics turned commercial empire.",
    body: [
      "María Santos runs the largest independent trade house in Miami — and, by most accounts, the most powerful. Her grandparents fled Cuba with nothing; her parents built the import business; María turned it into the continent's Caribbean gateway. The Santos house moves more tonnage through the Port of Miami than any faction's logistics arm, and María's word on a cargo is better than a bank's.",
      "Her power is networks: the Cuban exile community's commercial empire, the Haitian port crews' loyalty, the island contacts from Havana to San Juan. She speaks four languages, holds grudges in all of them, and negotiates like the exile politics she was raised on — total commitment, no surrender, and a long memory for betrayals. The Southern Compact courts her; she stays independent and charges them for the privilege.",
      "Santos is the figure the young traders study: the woman who built a commercial empire from exile grit and refused every buyout. Her advice to newcomers — 'own the bottleneck, never the boat' — is quoted in every merchant house on the Gulf. Her enemies say she's ruthless; her friends say she's loyal; both are right, and the distinction matters.",
      "For caravans, the Santos house is the Miami gate: a contract with Santos means priority docking, honest weights, and introduction to the island trade. Her factors are fair but exacting — the paperwork must be perfect, the cargo as described, the schedule kept. A caravan that meets the Santos standard can trade anywhere on the Gulf.",
    ],
    related: ["lore-city-miami", "lore-state-florida"],
  },
  {
    id: "lore-people-figure-james-whitfield",
    title: "James Whitfield — The Exchange King",
    category: "world",
    tags: ["figure", "chicago", "trade", "grain"],
    summary: "Chicago's grain king: the man who prices the continent's bread.",
    body: [
      "James Whitfield runs the Whitfield Exchange — the commodity house that sets the benchmark price for half the continent's grain. He's the third generation: his grandfather traded in the old pits, his father computerized them, James rebuilt them after the Unraveling. The numbers on the Whitfield boards are the numbers the continent trades on, and Whitfield knows it.",
      "His power is information: the crop reports, the weather data, the barge manifests, the caravan schedules — Whitfield's analysts know the continent's food supply better than any government. He sells the data, trades on it, and maintains the exchange as a neutral ground where every faction's buyers meet. The Great Lakes Union protects the exchange; Whitfield keeps it honest, because honesty is the product.",
      "Whitfield is the figure the policy types study: the man who privatized the continent's food intelligence and made it work. His critics call it a monopoly; he calls it a market. His rule — 'the price is the truth, and the truth is public' — is the exchange's creed. His enemies say he moves markets; he says the markets move and he reports it. The distinction keeps lawyers employed.",
      "For caravans, the Whitfield Exchange is the price reference: a trader who checks the boards before buying grain doesn't get fleeced. Whitfield's published prices are the continent's fair value — the starting point for every negotiation from the Plains to the Atlantic. A caravan that understands the exchange understands the food trade.",
    ],
    related: ["lore-city-chicago", "lore-state-illinois"],
  },
  {
    id: "lore-people-figure-chen-wei",
    title: "Dr. Chen Wei — The Bay Architect",
    category: "world",
    tags: ["figure", "san-francisco", "tech"],
    summary: "The Bay Area's most influential technologist: building the future's infrastructure.",
    body: [
      "Dr. Chen Wei designs the systems the new economy runs on: the logistics algorithms, the power-grid controllers, the communication protocols that replaced the old internet. Her lab — the Bay's most prestigious, attached to no university and funded by every faction — is where the continent's infrastructure gets invented. The Pacific Compact protects her; every faction uses her work.",
      "Her power is indispensability: the continent's trade depends on systems Chen designed, and her updates keep them running. She's neutral by necessity — a technologist who picked a faction would lose the trust that makes the work possible. Her lab's charter — open protocols, no backdoors, serve everyone — is enforced by the fact that everyone can verify it. The transparency is the security.",
      "Chen is the figure the young engineers worship: the woman who rebuilt the continent's nervous system and refused to own it. Her principle — 'infrastructure is a commons, not a weapon' — is the lab's religion. Her critics say she's naive; she says the math works, and the math is public. The continent's traders depend on her systems daily without knowing her name.",
      "For caravans, Chen's systems are the invisible infrastructure: the route optimizers, the market-data feeds, the communication relays that make long-haul trade possible. A caravan driver who uses the public protocols — the open tools Chen's lab publishes — navigates better, trades smarter, and communicates reliably. The future's architect built it for everyone, and the caravans are her most grateful users.",
    ],
    related: ["lore-city-san-francisco", "lore-state-california"],
  },
  {
    id: "lore-people-figure-tommy-redfeather",
    title: "Tommy Redfeather — The Clan Speaker",
    category: "world",
    tags: ["figure", "navajo", "desert", "diplomat"],
    summary: "The Navajo Nation's voice to the continent: the diplomat who negotiates water like oil.",
    body: [
      "Tommy Redfeather speaks for the Navajo Nation in the continent's councils — the water negotiations, the corridor treaties, the trade compacts. He's the grandson of code talkers, the son of tribal councilors, and the most skilled diplomat the desert has produced. The surrounding states need the Nation's water; Redfeather sets the terms.",
      "His power is the land: the Nation's aquifers, watersheds, and corridors are the assets the Southwest runs on. Redfeather negotiates like the desert taught him — patiently, completely, and without bluff. His compacts are models of clarity: the water flows, the price is fair, the obligations are mutual, and the penalties for breach are severe. Arizona's cities plan their growth around his signature.",
      "Redfeather is the figure the diplomats study: the man who turned sovereignty into leverage and leverage into prosperity. His principle — 'the land provides, the Nation decides' — is the desert's law. His critics call him hard; the Nation calls him effective. The distinction is academic when the water keeps flowing.",
      "For caravans, Redfeather's compacts are the desert's rules: the corridor treaties guarantee safe passage for honest traders, the water stations are maintained, the clan patrols enforce the peace. A caravan that respects the Nation's lands — stays on the corridors, pays the fees, keeps its word — travels the desert safely. One that doesn't learns why the desert is called unforgiving.",
    ],
    related: ["lore-people-desert-clans", "lore-state-arizona"],
  },
];
