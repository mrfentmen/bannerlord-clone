/**
 * Codex corpus (Rowan). Part 6: peoples and cities.
 *
 * Deep lore for the ten playable ethnicities (`data/ethnicities.ts`) and
 * the four start cities (`data/backgrounds.ts` START_CITIES). Written
 * against the real data: home regions, signature units and the
 * institutional pros/cons in ethnicities.ts are all explained here as
 * history, not biology — every bonus below is a community institution,
 * a trade network, or a lived tradition.
 *
 * The short city entries (lore-new-york etc.) remain the primers; the
 * lore-city-* entries are the deep dives.
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

export const CULTURE_ENTRIES: CodexEntry[] = [
  e(
    "lore-ethnicity-italian",
    "Italian-Americans: the Families of the Northeast",
    "world",
    "Merchant dynasties and construction trades who turned family into an institution.",
    [
      "Before the Unraveling, the Italian-American neighborhoods of the Northeast ran on two engines: the storefront and the job site. Three generations of grocers, importers, trucking dispatchers and general contractors built something rarer than money — a hiring network that could staff a warehouse or a work crew with a single phone call. When the federal contracts stopped coming, the network did not stop. It just stopped asking permission.",
      "The Families are not one family. Every borough, every mill town has its own table, and the tables negotiate like small states: territory for a concrete pour, a percentage of a market's take, a son married into a rival crew to seal a peace. What outsiders call the mob is mostly just procurement — the Families buy in bulk, build fast, and collect what they are owed. Their enforcers are the signature muscle of the Northeast: men and women raised on job sites, loyal to the crew boss who got their cousin hired.",
      "The Unraveling hit them as a supply-chain problem, which is the one problem they were built to solve. While city governments argued about jurisdiction, Family dispatchers were already rerouting food trucks around the checkpoints. That is why the Northeast's markets reopened first, and why every workshop from Newark to Providence pays a quiet tithe to somebody's uncle. Workshops go up cheap and fast where the Families operate — they own the concrete plants — but nothing is free: their union tradition means every crew negotiates hard, and troop wages run ten percent above the national average.",
      "Their great weakness is also their great strength: everything is personal. A Family feud can close a bridge for a month, and the Atlantic Corridor's bankers have learned to price that in. The Rook Company does steady business with the Families — Rook Reyes buys concrete and sells security — but even Rook does not mediate a blood feud. Nobody mediates a blood feud.",
      "If you were born to this people, you grew up at a table where business was discussed the way other families discuss the weather. You know the price of everything and the cost of disrespect. Your cousins are everywhere, which means your debts are too — but it also means you will never starve in any city on the Eastern seaboard.",
    ],
    ["lore", "ethnicity", "culture", "italian", "northeast", "families", "trade", "workshops"],
    ["lore-the-unraveling", "lore-faction-atlantic-corridor", "lore-city-new-york", "lore-families", "lore-origins"],
  ),
  e(
    "lore-ethnicity-irish",
    "Irish-Americans: the Ward Bosses",
    "world",
    "Political machines and parish bonds that survived the death of politics itself.",
    [
      "The Irish built the American city twice: once with their hands, laying the rails and digging the tunnels, and once with their votes, capturing the ward offices, the union halls and the police precincts. By the time of the Unraveling, the machine was a folk memory in most places — but in Boston and New York it was still a living thing, and living things survive.",
      "When the mayors fled and the councils dissolved, the ward bosses simply kept meeting. The parish hall became the ration depot; the union local became the hiring hall; the old precinct captains became the neighborhood watch, then the neighborhood militia. Nobody voted for any of this. Nobody had to. The machine ran on the only fuel that still worked: everybody knew everybody, and everybody owed somebody a favor.",
      "That is the source of the famous Irish morale. An Irish crew does not fight for a flag — it fights for the block, for the parish, for the lads it grew up with. Brawlers are the signature unit of this people: shock troops who go in laughing and do not come back without their people. Charm is their other weapon. A century of storytelling, politicking and pulpit oratory produced negotiators who can talk a checkpoint commander into waving a whole convoy through.",
      "The cost is appetite. Irish households run large — extended families under one roof, cousins on every couch — and a party drawn from these neighborhoods eats ten percent more than anyone else's. Quartermasters learn to budget for it the way sailors budget for weather.",
      "If you were born to this people, you were raised on stories: of the old country, of the strike of '34, of your grandfather staring down a Pinkerton. You know every lyric to songs about losing gloriously, and you have never once considered losing quietly.",
    ],
    ["lore", "ethnicity", "culture", "irish", "boston", "new york", "morale", "politics"],
    ["lore-the-unraveling", "lore-faction-atlantic-corridor", "lore-city-new-york", "lore-families", "lore-origins"],
  ),
  e(
    "lore-ethnicity-chinese",
    "Chinese-Americans: the Engineers of the Coast",
    "world",
    "The people who kept the lights on when the grid went down — and charged for it.",
    [
      "On the West Coast, the Chinese-American community held a peculiar kind of power before the Unraveling: it maintained the machines. The port cranes of Long Beach, the server farms, the water systems, the construction firms that actually poured the foundations — the engineering offices ran on bilingual project managers and foremen who could read a schematic in either language. When the institutions failed, the schematics remained.",
      "The community's response to the collapse was characteristically methodical. While others fought over the ruins, the engineers' associations drew up priority lists: water first, then power, then the port. Neighborhood microgrids went up in weeks, built from salvaged solar and the kind of patient labor that does not cut corners. Construction in their districts runs a quarter faster than anywhere else, and their workshops — machine shops, fabrication bays, electronics benches — hum at a ten percent premium over the competition.",
      "Their signature troops are the engineers: siege specialists who treat a fortified wall as a math problem, and disciplined rifle lines that hold formation the way their grandparents held a production schedule. If there is a harder unit to dig out of a prepared position, nobody on the Pacific coast has found it.",
      "The price of method is deliberation. Decisions in these neighborhoods are made by committee, by association, by the elders' council — and committees do not hurry. Their caravans move five percent slower than anyone else's, because every route is debated first. Rivals call it dithering. The engineers call it not driving into an ambush.",
      "If you were born to this people, your childhood smelled of solder and hot oil, and your parents measured love in tutoring hours. You were taught that anything built right outlasts the builder — and you have watched that proverb get tested on every block you have ever lived on.",
    ],
    ["lore", "ethnicity", "culture", "chinese", "west coast", "engineering", "construction", "workshops"],
    ["lore-the-unraveling", "lore-faction-pacific-compact", "lore-city-los-angeles", "lore-families", "lore-origins"],
  ),
  e(
    "lore-ethnicity-korean",
    "Korean-Americans: the Shopkeepers' Line",
    "world",
    "Small-business grit that turned every corner store into a fortress.",
    [
      "Ask anyone on the West Coast what happened on the rooftops, and they will tell you about the Korean shopkeepers. When the first wave of looting came, the owners of the liquor stores and dry cleaners on the boulevards did not flee — they climbed to their roofs with rifles their grandfathers had carried in another country's war, and they held the block. That week became the founding myth of a people, and like all founding myths it is mostly true.",
      "The myth hardened into doctrine: discipline, self-reliance, and the absolute refusal to break. Korean units rout a quarter slower than anyone else's — not because they are braver, but because breaking formation would shame the family name, and the family name is the business. Their marksmen are the patient elite of the western ranges, riflemen who will wait three days for one shot.",
      "The business is the other half of the story. The small-business networks — the wholesalers, the distributors, the rotating credit associations — survived the Unraveling intact, because they were never really part of the formal economy to begin with. In the cities, Korean traders clear fifteen percent better margins than outsiders. Money, in their telling, is just discipline made visible.",
      "The doctrine has a cost: they hire slow. Every recruit is vetted, vouched for, and folded into the trust network before they touch a weapon, which makes their recruitment ten percent slower than the street average. A Korean crew is small, certain, and permanent.",
      "If you were born to this people, you worked the register at twelve and learned inventory at fourteen. You were taught that the store is the family and the family is the store — and that a roof, a rifle, and a ledger are all you need to hold a city block against the end of the world.",
    ],
    ["lore", "ethnicity", "culture", "korean", "los angeles", "discipline", "trade", "marksmen"],
    ["lore-the-unraveling", "lore-faction-pacific-compact", "lore-city-los-angeles", "lore-families", "lore-origins"],
  ),
  e(
    "lore-ethnicity-african",
    "African-Americans: the Church and the Block",
    "world",
    "Four hundred years of organizing, aimed at last at something worth building.",
    [
      "No people in America were better prepared for the Unraveling than Black America, because no people had less reason to trust the institutions that unraveled. The church networks, the mutual aid societies, the block clubs, the fraternities and sororities — the entire parallel infrastructure of a community that had always known the official systems might fail — switched on like a generator the night the lights went out.",
      "In the South and the great cities, the Black church became the state overnight: the sanctuary became the food depot, the deacon board became the council, the choir became the messenger service. Recruitment runs through these networks at fifteen percent above the national rate, because the ask does not come from a stranger with a clipboard — it comes from your pastor, your coach, your auntie. The street soldiers who march under these banners are balanced, disciplined fighters with something rarer than training: a reason.",
      "Athletics is the other inheritance. The sports culture — the playgrounds, the leagues, the discipline of the drill — produces recruits whose bodies are already weapons; athletics training advances a quarter faster among these crews. Opponents who mistake this for mere toughness learn the difference the hard way.",
      "The wound is the relationship with authority. Four centuries of history do not wash off in a decade, and the successor states that style themselves the heirs of the old order start ten points down in every Black neighborhood. The Atlantic Corridor's administrators call it a public-relations problem. The neighborhoods call it memory.",
      "If you were born to this people, you were raised in a long line: the church mothers, the organizers, the ones who marched. You know that freedom was never given, only taken and held — and you intend to hold your share of the new country with both hands.",
    ],
    ["lore", "ethnicity", "culture", "african", "church", "south", "recruitment", "athletics"],
    ["lore-the-unraveling", "lore-faction-atlantic-corridor", "lore-faction-southern-compact", "lore-families", "lore-origins"],
  ),
  e(
    "lore-ethnicity-jamaican",
    "Jamaican-Americans: the Sound System",
    "world",
    "Hustle, bass, and the fastest feet on the Eastern seaboard.",
    [
      "The Jamaicans came to New York and Miami with two things the new country desperately needed: a genius for moving product through informal channels, and a culture that treats speed as a virtue. The sound-system tradition — the towering speaker stacks, the selector's art, the dancehall as town hall — turned out to be perfect training for the post-collapse economy: read the crowd, move fast, never get caught standing still.",
      "Their runners are the signature skirmishers of the East: light, fast crews that hit a convoy and fade before the dust settles. Jamaican parties move ten percent faster on the campaign map than anyone else's — the hustle is not a metaphor, it is a marching doctrine. And the street wisdom runs deep: roguery, the whole art of the angle, advances a quarter faster among their crews. There is no lock they have not seen, no checkpoint they cannot talk or slip past.",
      "The culture's weakness is patience — or rather, its contempt for it. Siege warfare is waiting warfare, and waiting is the one thing the sound system never learned. Their siege works go up fifteen percent slower than the engineers', because halfway through the digging somebody always has a better idea involving speed.",
      "What holds it all together is the music. The dances, the clashes, the endless argument about who runs the best sound — it is a parliament, a press, and a church in one. A Jamaican block decides things at full volume, and once it decides, it moves as one body.",
      "If you were born to this people, you grew up with bass in your chest before you could walk. You learned that the world belongs to the quick, that respect is earned out loud, and that no wall — physical or otherwise — was ever built that a clever runner cannot get past.",
    ],
    ["lore", "ethnicity", "culture", "jamaican", "new york", "miami", "speed", "roguery"],
    ["lore-the-unraveling", "lore-faction-atlantic-corridor", "lore-city-new-york", "lore-city-miami", "lore-families", "lore-origins"],
  ),
  e(
    "lore-ethnicity-mexican",
    "Mexican-Americans: the Vaquero Road",
    "world",
    "The oldest road culture in North America, still riding it.",
    [
      "The vaqueros were working cattle in Texas and California before those places had English names, and the tradition never died — it just changed vehicles. The modern vaquero might ride a pickup instead of a quarter horse, but the skills are the same: read open ground, move stock, live light, fix what breaks. When the Unraveling emptied the feedlots and scattered the herds, the vaquero families were the only people in the Southwest who already knew how to live off moving animals.",
      "Their parties are the masters of the open country. Vaqueros are mobile fighters without peer on the plains — they strike from distance, refuse the set-piece battle, and vanish into ground they have known since childhood. And they live cheap: family food networks — the cousins with the goats, the aunt with the garden that never stopped producing — cut their parties' food consumption by a full fifth. A Mexican crew can campaign for months on what starves anyone else in weeks.",
      "The trades came with them. Masons, welders, electricians, mechanics — the skilled hands that built the Sun Belt — and their construction crews work ten percent faster than the competition. If you need a wall up before the raiders arrive, you hire vaquero country.",
      "The market, though, is a knife fight. The border economies run on volume and thin margins, and Mexican traders sell ten percent cheaper than anyone else — which wins every bidding war and leaves nothing on the table. Their rivals call it undercutting. They call it Tuesday.",
      "If you were born to this people, your earliest memories are of dust and diesel: the branding pen, the swap meet, the long drive north with the windows down. You were taught that a person is only as good as their word and their truck — and that the road, unlike every government you have ever lived under, has never once lied to you.",
    ],
    ["lore", "ethnicity", "culture", "mexican", "southwest", "texas", "vaqueros", "food", "construction"],
    ["lore-the-unraveling", "lore-faction-lone-star-frontier", "lore-city-houston", "lore-families", "lore-origins"],
  ),
  e(
    "lore-ethnicity-puerto-rican",
    "Puerto Ricans: the Island in the City",
    "world",
    "An island nation that rebuilt itself inside other people's cities.",
    [
      "The Puerto Ricans arrived in New York and Florida carrying something no other migrants had: American passports and an island that Washington kept forgetting. That contradiction forged a people fluent in two worlds — the block and the beach, the bodega and the bohío — and when both worlds collapsed at once, they were the only ones who did not have to choose.",
      "Their organizing unit is the block, and their method is total: the casita garden on the vacant lot, the domino table that is also a council meeting, the parade that is also a census. Community networks recruit fifteen percent faster than the national rate, because in these neighborhoods everybody is already counted. Their islanders — versatile, proud, loud infantry — fight with the particular fury of people defending a home that exists mostly in memory.",
      "Pride is the fuel. The flag flies everywhere: on the jackets, on the storefronts, on the hoods of the lowriders. Party morale runs ten percent high in Puerto Rican crews, and it is not the morale of discipline — it is the morale of belonging. Nobody wants to be the one who let the block down.",
      "They know their value, which is the polite way of saying they charge for it. Wages in these crews run five percent above the street rate, and the abuelas who run the hiring will explain exactly why, at length, in two languages.",
      "If you were born to this people, you grew up between worlds: Spanish at home, English on the street, the island in your grandmother's stories and the city outside your window. You learned that home is not a place — it is the people who show up — and your people always show up.",
    ],
    ["lore", "ethnicity", "culture", "puerto rican", "new york", "florida", "community", "morale"],
    ["lore-the-unraveling", "lore-faction-atlantic-corridor", "lore-city-new-york", "lore-city-miami", "lore-families", "lore-origins"],
  ),
  e(
    "lore-ethnicity-german",
    "German-Americans: the Builders",
    "world",
    "The quiet engineers of the Midwest, who measure twice and build once.",
    [
      "The Germans settled the Midwest to farm it, stayed to industrialize it, and never bothered to tell anyone. By the Unraveling, German-American communities ran the machine shops, the fabrication plants, the breweries and the precision manufacturers of a dozen states — the unglamorous middle of the economy that everything else stood on. When the middle fell out, they simply kept building.",
      "Their workshops are the envy of the continent: methodical, immaculate, and ten percent more productive than anyone else's. A German-run machine shop does not improvise — it has a procedure, the procedure is written down, and the procedure works. Construction crews raised in this tradition build ten percent faster too, because they measure twice. Everyone else measures once and rebuilds.",
      "Their signature troops are the organizers: defensive infantry, methodical and unbreakable, the kind of line that does not advance gloriously and does not retreat at all. Put them on a wall and go have lunch. The wall will be there when you get back.",
      "What they cannot do is charm. The directness that makes their engineering honest makes their diplomacy brutal — charm advances ten percent slower among their negotiators, and more than one trade deal has died on a German's refusal to soften a true sentence. Their rivals call it rudeness. They call it accuracy.",
      "If you were born to this people, your childhood was orderly: the workshop swept every night, the tools in their places, the Sunday dinner at one o'clock sharp. You were taught that the world rewards competence and punishes excuses — and in the new country, for the first time in living memory, that is actually true.",
    ],
    ["lore", "ethnicity", "culture", "german", "midwest", "engineering", "workshops", "construction"],
    ["lore-the-unraveling", "lore-faction-great-lakes-union", "lore-families", "lore-origins"],
  ),
  e(
    "lore-ethnicity-russian",
    "Russians: the Winter People",
    "world",
    "Hardened by cold, stubborn by tradition, and impossible to dig out.",
    [
      "The Russians came to America in waves — the early exiles, the Soviet defectors, the post-Soviet strivers — and settled where the winters reminded them of home: the Northeast, the Great Lakes, the mountain towns. They brought with them a philosophy forged in the hardest school on earth: endure. The Unraveling, to their telling, was merely winter arriving in a different season.",
      "Nobody fights better in the cold. Russian crews take to snow and winter operations like they were born to it, fighting twenty percent better when the temperature drops — which, in the mountain states, is half the year. Their heavies are the shock infantry of the north: hard-hitting, harder-headed, and utterly indifferent to hardship that breaks other troops. And in a siege, there are no more stubborn defenders on the continent — their works hold fifteen percent longer, because surrender is a word they never quite learned in any language.",
      "The price is paid in summer. Heat and desert sap them; morale drops ten percent in the hot country, and the southern campaigns are something their commanders schedule around, not through. The Lone Star boys know it, and schedule accordingly.",
      "Their communities run on a particular kind of warmth: the kitchen table that never empties, the vodka that appears when the news is bad, the fatalistic humor that treats catastrophe as weather. Outsiders find them bleak. They find outsiders naive. Both are usually right.",
      "If you were born to this people, you were taught three things before you could read: the winter always comes, the state always lies, and the family always eats. In the new country, all three have proven true — and the family, at least, is doing better than ever.",
    ],
    ["lore", "ethnicity", "culture", "russian", "winter", "northeast", "siege", "endurance"],
    ["lore-the-unraveling", "lore-faction-mountain-alliance", "lore-front-range", "lore-families", "lore-origins"],
  ),
];

export const CITY_ENTRIES: CodexEntry[] = [
  e(
    "lore-city-new-york",
    "New York: the Capital of Everything",
    "world",
    "Eight million people, five rival powers, and the densest battlefield in America.",
    [
      "New York did not fall so much as fragment. When the federal money stopped, the city — which had always been five cities pretending to be one — simply stopped pretending. Manhattan's money, Brooklyn's docks, Queens' workshops, the Bronx's streets, Staten Island's silence: each became a state, and each state found an army. The old NYPD, the largest police force in the country, shattered along precinct lines into a dozen heavily armed neighborhood watches that still wear the blue out of habit and still hate each other out of history.",
      "What makes New York the capital of everything is density. Eight million people means eight million mouths, eight million pairs of hands, and eight million grudges. Recruitment here is double the national rate — bodies are never scarce — and trade profits run thirty percent above anywhere else, because Wall Street's money never really left; it just changed clothes. But everything costs double: rent, wages, bribes, bullets. The city taxes ambition at the highest rate on the continent.",
      "Power in the city belongs to whoever can hold a bridge. The five rival factions — the Corridor's bankers in Manhattan, the Families in the old Italian neighborhoods, the ward machines in the Irish blocks, the sound-system crews uptown, the island networks in the Bronx — fight a permanent low war over crossings, tunnels and docks. Alliances last until the next shipment arrives. The only neutral ground is the market, and even the market charges admission.",
      "The notables of New York are the most dangerous people in the game: power brokers who survived the collapse of the most competitive political environment on earth, fixers who can get anything done for a price, and kingpins whose names are spoken carefully. More notable NPCs spawn here than anywhere else — which means more opportunities, and more ways to get killed by someone important.",
      "If you start here, you start in the deep end. The police heat is the highest in the country — loud moves bring the precinct watches down fast — but the rewards match the risk. As the old saying goes, updated for the new country: if you can make it here, you can make it anywhere. Most people cannot make it here.",
    ],
    ["lore", "city", "new york", "atlantic corridor", "factions", "trade", "recruitment"],
    ["lore-new-york", "lore-the-unraveling", "lore-faction-atlantic-corridor", "lore-ethnicity-italian", "lore-ethnicity-irish", "lore-ethnicity-jamaican", "lore-ethnicity-puerto-rican"],
  ),
  e(
    "lore-city-los-angeles",
    "Los Angeles: the Sprawl",
    "world",
    "A hundred miles of city where the freeway is the only law that survived.",
    [
      "Los Angeles was always less a city than a weather system — a hundred miles of neighborhoods held together by freeways and mutual indifference. The Unraveling barely changed the skyline; it just emptied the studios and filled the boulevards with checkpoints. What collapsed was not the buildings but the commute: without fuel distribution, the city's hundred-mile wingspan became a hundred-mile vulnerability.",
      "Whoever controls the freeways controls Los Angeles, and the war for them has been running for years. The Pacific Compact holds the ports and the westside money; the Korean shopkeeper militias hold the boulevards they have held since the rooftops; the vaquero crews run the eastern approaches; and a dozen studio-security companies, suddenly the best-armed organizations in the county, rent themselves to the highest bidder. Hollywood money launders everything — fame, cash, reputations.",
      "The sprawl is both weapon and weakness. Campaign map speed runs twenty percent higher here — everyone drives, and the freeway network, where it is held, moves armies like nothing else on the continent. Hideouts are cheap: endless cheap warehouses in the industrial flats. But distance is the enemy of every operation. Raids take longer, supply lines stretch thin, and troops who cannot drive lose ten percent of their morale to the sheer humiliation of it.",
      "Then there is the ground itself. The San Andreas never signed the peace treaty. Random quakes still roll through and damage holdings without warning, and every builder in the city prices it in. The engineers' associations have a whole liturgy of retrofitting, and the only people who ignore it are newcomers.",
      "If you start here, you start mobile. The city's entertainment connections — the studios, the labels, the streaming money that never quite died — offer paths to wealth that do not exist anywhere else. Just remember: in Los Angeles, everyone is the star of their own movie, and most of those movies end with a shootout on the 101.",
    ],
    ["lore", "city", "los angeles", "pacific compact", "sprawl", "freeways", "earthquake"],
    ["lore-los-angeles", "lore-the-unraveling", "lore-faction-pacific-compact", "lore-ethnicity-korean", "lore-ethnicity-mexican", "lore-ethnicity-chinese"],
  ),
  e(
    "lore-city-houston",
    "Houston: the Refinery",
    "world",
    "Oil money, no zoning, and the biggest industrial base in the new country.",
    [
      "Houston was built by oil money and a total absence of zoning laws — refineries next to mansions next to taco trucks — and the Unraveling changed neither fact. When the pipelines stopped, the refineries became fortresses; when the grid failed, the oilmen's private generators became the only lights for miles. Energy wealth concentrated fast, and the good ol' boy networks that had always run Texas simply stopped sharing.",
      "What makes Houston the arsenal of the south is industry. Workshop output runs twenty-five percent above the national rate — the fabrication plants, the machine shops, the chemical works are all still standing, and the skilled trades never left. Land is cheap because there are no rules about what goes where; you can build a fortress next to a barbecue joint and nobody will even comment. The marks are rich: oil money means there is always someone worth robbing, or befriending, or both in sequence.",
      "The city's curse arrives every summer. Hurricane season rolls in off the Gulf and can wipe coastal holdings off the map — every serious operator builds inland or builds to survive water. And the locals are entrenched: Texas factions start ten points cold toward outsiders, because outsiders have been coming to Texas to take things for two hundred years.",
      "Power here is personal and permanent. The refinery clans, the vaquero road crews, the megachurch networks — they do not rotate, they accrete. A Houston alliance is worth more than a Corridor contract, because it will still be there in ten years. A Houston feud is worse than a New York one, for the same reason.",
      "If you start here, you start rich in opportunity and poor in friends. Space City rewards builders — everything is bigger, including the mistakes. Just keep one eye on the Gulf between June and November.",
    ],
    ["lore", "city", "houston", "lone star", "oil", "industry", "workshops", "hurricane"],
    ["lore-houston", "lore-the-unraveling", "lore-faction-lone-star-frontier", "lore-ethnicity-mexican", "lore-ethnicity-african", "lore-ethnicity-german"],
  ),
  e(
    "lore-city-miami",
    "Miami: the Port",
    "world",
    "The gateway to everything south — every shipment, every deal, every escape.",
    [
      "Miami's geography is its destiny: the southeastern tip of the continent, closer to Havana than to Washington, with the busiest cruise port in the old world and an airport that never really closed. When the Unraveling cut the country's supply lines, Miami became the place where the outside world still touched America — and the people who controlled the docks became the richest people in the new country overnight.",
      "The port is everything. Smuggling profits run twenty-five percent above anywhere else, because every shipment that matters — medicine, fuel, arms, people — comes through here or does not come at all. Tourism money never died either; the rich still come to be seen, and they spend the way rich people spend when they think the world is ending. And when a deal goes bad, the water offers what land never can: a boat, at night, going south.",
      "The city's powers are a tropical menagerie: the Southern Compact's administrators in the downtown towers, the island networks running the neighborhoods block by block, the sound-system crews on the north side, the old exile money in Coral Gables that has been waiting fifty years for exactly this kind of chaos. The feds watch the port harder than anywhere else in the country — the DEA's grandchildren still walk the docks — which keeps the amateurs out and the professionals rich.",
      "Paradise is expensive. The cost of living runs half again above the national rate — the Art Deco facades hide serious money, and serious money charges serious rent. And the Gulf sends the same hurricanes that hit Houston, arriving here first.",
      "If you start here, you start connected. Every faction on the continent needs something that comes through Miami, which makes the city the best place in the game to hear things — and the worst place to be unheard-of. In Miami, the party never stops, the grind never stops, and the boats leave every night for places that are not on any map.",
    ],
    ["lore", "city", "miami", "southern compact", "port", "smuggling", "tourism", "hurricane"],
    ["lore-miami", "lore-the-unraveling", "lore-faction-southern-compact", "lore-ethnicity-jamaican", "lore-ethnicity-puerto-rican", "lore-ethnicity-african"],
  ),
];
