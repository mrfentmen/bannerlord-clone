/**
 * Additional city lore (del order 2026-10-04).
 *
 * Deep lore for the major cities of the national trade network: what each
 * city is like after the Unraveling, who holds it, who lives there, and why
 * a caravan would go there.
 */

import type { CodexEntry } from "./types.js";

export const MORE_CITY_ENTRIES: CodexEntry[] = [
  {
    id: "lore-city-chicago",
    title: "Chicago — The Central Market",
    category: "world",
    tags: ["chicago", "city", "midwest", "market"],
    summary: "The continent's central market: grain, rail, and the Great Lakes Union's capital.",
    body: [
      "Chicago is where the continent's food gets priced. The commodity exchanges — rebuilt after the Unraveling, running on the same pits and shouts as the old days — set the price of grain for half the world. The rail yards move more tonnage than any port. The Great Lakes Union runs the city as its capital, and the city's logic is volume: thin margins, enormous loads, no sentiment.",
      "The city's neighborhoods are the old American mix hardened by winter. The Polish and Irish built the bones. The Black community built the soul — the South Side's churches, the blues clubs, the political machine that still runs the wards. The Mexican community anchors the packing houses and the southwest side. The new arrivals keep the churn going. Chicago doesn't welcome you; it puts you to work and judges the results.",
      "For caravans, Chicago is the midwestern hub: the Transcontinental Express passes through, the Heartland Loop turns here. Grain flows out in bulk; manufactures flow in. The exchange halls are where a trader learns the real prices — the numbers on the boards are the numbers the continent trades on. A caravan that can run the Chicago market reliably never goes hungry, but the competition is the continent's toughest.",
    ],
    related: ["lore-state-illinois", "lore-faction-great-lakes-union"],
  },
  {
    id: "lore-city-seattle",
    title: "Seattle — The Evergreen Port",
    category: "world",
    tags: ["seattle", "city", "pacific-northwest", "port"],
    summary: "The Pacific Northwest's green fortress: tech, timber, and the continent's Pacific gate.",
    body: [
      "Seattle is the city the rain built: tech campuses on the hills, the port on the Sound, the Space Needle still standing over a downtown that's cleaner, denser, and more serious than the old days. The Pacific Compact holds the metro as its northern anchor, and the city's culture — earnest, educated, quietly convinced of its superiority — shapes everything the Compact does.",
      "The peoples of Seattle are a Pacific mix: the old Scandinavian fishing families, the Asian communities of the International District, the East African immigrants of the south end, the Coast Salish tribal nations who never left, and the tech transplants from everywhere. The city's politics run progressive, its economy runs on software and shipping, and its social codes are the continent's most intricate — a trader learns the etiquette or eats alone.",
      "For caravans, Seattle is the northwestern terminus: the I-5 corridor starts here, the Pacific Run turns here. Timber, software, and Pacific Rim goods flow south; food and fuel flow north. The port of Seattle-Tacoma is the continent's Pacific gate — the cranes never stop. A caravan running the Seattle road deals with rain, mountain passes, and merchants who negotiate like engineers: precisely, politely, and without mercy.",
    ],
    related: ["lore-state-washington", "lore-faction-pacific-compact"],
  },
  {
    id: "lore-city-atlanta",
    title: "Atlanta — The New South Capital",
    category: "world",
    tags: ["atlanta", "city", "south", "capital"],
    summary: "The capital of the New South: Black excellence, the world's busiest hub, and the Southeast's crossroads.",
    body: [
      "Atlanta is the city the New South built: the towers rising from red clay, the airport — still the world's busiest, now running caravans and cargo airships alongside the jets — and a Black-led business and political class that runs the show. The city's motto might as well be 'we're open for business,' and it means it.",
      "The peoples of Atlanta are the southern future: Black Atlantans — the professionals, the entrepreneurs, the church networks, the HBCU graduates — are the city's core. The white suburbs sprawl in every direction, split between old Georgia families and newcomers. The immigrants — Korean in Duluth, Mexican in the poultry towns, South Asian in the tech corridors — keep the economy churning. The city's culture is Black Southern at its most confident: the music, the food, the churches, the homecomings.",
      "For caravans, Atlanta is the southeastern hub: the I-95 corridor passes through, the Eastern Seaboard circuit turns here. Goods flow north to the Atlantic cities and south to Florida and the Gulf. The city's merchant houses are the continent's most polished — and its most competitive. A trader who can make it in Atlanta can make it anywhere in the South.",
    ],
    related: ["lore-state-georgia", "lore-faction-southern-compact"],
  },
  {
    id: "lore-city-dallas",
    title: "Dallas — The Silicon Prairie",
    category: "world",
    tags: ["dallas", "city", "texas", "tech"],
    summary: "Texas swagger meets tech money: the Lone Star Frontier's northern capital.",
    body: [
      "Dallas is where Texas does business: the towers, the tech corridor, the 'silicon prairie' that builds the machines the new economy runs on. Fort Worth — 'where the West begins' — holds the stockyards and the old cattle culture thirty miles west, and the Metroplex sprawls between them in a monument to the automobile and the deal.",
      "The peoples of Dallas are a Texas mix: the old oil families and their money, the tech transplants from both coasts, the Mexican-Tejano communities that anchor the service economy and the culture, the Black communities of South Dallas with their churches and businesses, and the new immigrants — South Asian engineers, West African traders, Central American workers — who keep the Metroplex growing. The city's culture is commerce with a drawl: the deal is sacred, the handshake matters, and the boots are expensive.",
      "For caravans, Dallas is the north-Texas hub: I-35 and I-20 cross here, the Southern Corridor circuit passes through. Tech goods, cattle, and oilfield equipment flow in every direction. The Frontier's northern capital is where a trader outfits for the Texas roads — the guards are good, the prices are fair, and the steaks are enormous.",
    ],
    related: ["lore-state-texas", "lore-faction-lone-star-frontier"],
  },
  {
    id: "lore-city-phoenix",
    title: "Phoenix — The Desert Sprawl",
    category: "world",
    tags: ["phoenix", "city", "desert", "southwest"],
    summary: "Five million people in the desert: canals, sprawl, and stubbornness.",
    body: [
      "Phoenix shouldn't exist — five million people in a valley that gets eight inches of rain a year — and the city's entire history is the argument for its existence. The canals bring the water. The air conditioners make it livable. The stubbornness keeps it growing. The Unraveling didn't change the formula; it just made the water infrastructure a fortified asset and the stubbornness a survival trait.",
      "The peoples of Phoenix are a desert boomtown mix: Mexican communities that predate the city, the retirees who came for the sun and stayed for the politics, the tribal nations — the Salt River Pima-Maricopa, the Gila River communities — who hold the water rights the city needs, and the tech exiles and nomads who drift through. The city's culture is sprawl and sun: the strip malls, the golf courses, the endless suburbs, all of it an argument that the desert can be tamed.",
      "For caravans, Phoenix is the southwestern waystation: the I-10 corridor passes through, the Southern Corridor circuit stops here. Goods flow west to California and east to Texas. The desert crossings start here — the long, hot, empty stretches where water is life and breakdowns kill. A caravan that outfits in Phoenix carries extra water, extra shade, and a healthy respect for the sun.",
    ],
    related: ["lore-state-arizona"],
  },
  {
    id: "lore-city-san-francisco",
    title: "San Francisco — The Tech Enclave",
    category: "world",
    tags: ["san-francisco", "city", "tech", "bay-area"],
    summary: "The Bay Area's golden city: tech wealth, steep hills, and the future's workshop.",
    body: [
      "San Francisco is the continent's idea factory: the Bay Area's tech enclaves — the campuses, the startups, the venture firms — run the innovation economy from these hills. The city's beauty survived the Unraveling — the Bay, the bridges, the fog — and the wealth came back faster than anywhere else. The future gets built here, for better and worse.",
      "The peoples of the Bay are the ambitious from everywhere: Indian and Chinese engineers, Eastern European founders, American strivers of every background, drawn by the campuses and the capital. The old San Francisco — the artists, the activists, the weirdos — still holds the Mission and the Haight, running the culture the tech money consumes. The city's tensions are the continent's tensions: wealth and displacement, innovation and tradition, the future and the people it leaves behind.",
      "For caravans, the Bay Area is the high-value western stop: tech goods, components, and instruments flow east; food, fuel, and raw materials flow west. The I-80 corridor starts here. A trader who can sell to the Bay's enclaves — who speaks the language of specs and roadmaps — finds the continent's richest customers. A trader who can't finds the continent's most polite closed doors.",
    ],
    related: ["lore-state-california", "lore-faction-pacific-compact"],
  },
  {
    id: "lore-city-boston",
    title: "Boston — The Old Citadel",
    category: "world",
    tags: ["boston", "city", "northeast", "universities"],
    summary: "The continent's oldest big city: universities, hospitals, and Yankee stubbornness.",
    body: [
      "Boston is the old citadel: the universities — Harvard, MIT, the whole constellation — the hospitals, the old neighborhoods, the Yankee conviction that this city does things correctly and everyone else is improvising. The Unraveling tested that conviction and, by Boston's account, confirmed it. The city runs. The lights stay on. The research continues.",
      "The peoples of Boston are old and new: the Irish still run the politics, the Italians still run the North End, the old Yankee families still sit on the boards. The universities draw the world — every ethnicity, every ambition — and the hospitals employ half of them. The new immigrants — Dominican in Jamaica Plain, Vietnamese in Dorchester, Brazilian in East Boston — work the service economy the old stock left. The city's culture is intellect with an edge: the ideas are serious, the sports are religion, and the winters are a moral test.",
      "For caravans, Boston is the northeastern terminus: the I-95 corridor ends here, the Eastern Seaboard circuit turns here. Knowledge goods — instruments, medicines, texts — flow south; food, fuel, and manufactures flow north. A trader who can sell to Boston's institutions — the universities, the hospitals — finds customers who pay on time and argue about everything else.",
    ],
    related: ["lore-state-new-york", "lore-faction-atlantic-corridor"],
  },
  {
    id: "lore-city-philadelphia",
    title: "Philadelphia — The Old Capital",
    category: "world",
    tags: ["philadelphia", "city", "northeast", "history"],
    summary: "The nation's first capital: history, hospitals, and the continent's most honest merchants.",
    body: [
      "Philadelphia is the old capital: Independence Hall, the Liberty Bell, the streets where the country was invented. The city's history survived the Unraveling — the old buildings are maintained like shrines — and the city's character survived too: blunt, working-class, unimpressed by pretension, and fiercely proud of being the place where it all started.",
      "The peoples of Philadelphia are the old American urban mix: Irish and Italian neighborhoods, Black communities that built the churches and the music, the new immigrants — Dominican, Mexican, South Asian — in the rowhouse blocks. The universities and hospitals — Penn, Temple, the medical complex — employ the educated and anchor the economy. The city's culture is honesty with an edge: Philly doesn't flatter, doesn't pretend, and doesn't forget.",
      "For caravans, Philadelphia is the mid-Atlantic hub: the I-95 corridor passes through, the Northeast's workshops supply the region. Manufactured goods, medicines, and instruments flow north and south. A trader in Philadelphia deals with the continent's most straightforward merchants — the price is the price, the handshake matters, and the cheesesteak debate is not to be engaged by outsiders.",
    ],
    related: ["lore-state-pennsylvania", "lore-faction-atlantic-corridor"],
  },
  {
    id: "lore-city-new-orleans",
    title: "New Orleans — The Crescent City",
    category: "world",
    tags: ["new-orleans", "city", "gulf", "culture"],
    summary: "The continent's soul: music, food, and the Mississippi's mouth.",
    body: [
      "New Orleans is the continent's soul: the music — jazz, brass, bounce, all of it — the food — Creole, Cajun, the po'boys — and the city's ancient bargain with the water. The Mississippi meets the Gulf here, and the city's whole existence is the negotiation between the river and the sea. The Unraveling flooded the lower wards again; the city rebuilt again, higher this time, and the music never stopped.",
      "The peoples of New Orleans are the Gulf's crossroads: Black Creole communities — the culture-bearers, the musicians, the Mardi Gras Indians — the Cajun families of the bayous, the Vietnamese fishing communities of the east, the old French and Spanish families of the Quarter, and the newcomers drawn by the music and the cheap rent. The city's culture is celebration as resistance: the second lines, the jazz funerals, the insistence that joy is a political act.",
      "For caravans, New Orleans is the Gulf's cultural port: the I-10 corridor passes through, the Southern Corridor circuit stops here. River goods flow down the Mississippi; Gulf goods flow in from the water. A trader in New Orleans deals with the continent's most musical merchants — and its most unpredictable. The price might change with the song, but the deal, once sealed with food and music, is sacred.",
    ],
    related: ["lore-state-florida", "lore-faction-southern-compact"],
  },
  {
    id: "lore-city-detroit",
    title: "Detroit — The Motor Reborn",
    category: "world",
    tags: ["detroit", "city", "rust-belt", "makers"],
    summary: "Bankrupt and reborn: the continent's maker capital and the Motor City's second act.",
    body: [
      "Detroit died and came back. The bankruptcy — the largest municipal failure in the old country's history — broke the old machine. What rose from it is the continent's maker capital: the old auto plants turned fabrication hubs, the engineers who stayed, the workshops that build everything from farm equipment to caravan wagons. The city's motto might as well be 'we build things.'",
      "The peoples of Detroit are the great migration's heirs: Black Detroit — the culture, the churches, the political power — held the city together through the collapse. The Arab communities of Dearborn run businesses that span the globe. The old Polish and Irish neighborhoods keep the parish identities. The new immigrants — Bangladeshi, Mexican, Yemeni — work the factories that never fully closed. The city's culture is blunt creativity: make it work, make it beautiful, don't talk about it.",
      "For caravans, Detroit is the northern maker hub: the I-80 corridor's eastern end, the Great Lakes trade's southern shore. Machine parts, vehicles, and fabricated goods flow south and west. A trader who needs something built — a wagon modified, a weapon repaired, a machine jury-rigged — brings it to Detroit. The makers here can fix anything, and they'll tell you exactly what you're doing wrong while they do it.",
    ],
    related: ["lore-state-michigan", "lore-faction-great-lakes-union"],
  },
  {
    id: "lore-city-nashville",
    title: "Nashville — The Music Capital",
    category: "world",
    tags: ["nashville", "city", "south", "music"],
    summary: "Music City: the songs, the studios, and the South's most diverse boomtown.",
    body: [
      "Nashville is Music City: the studios on Music Row, the honky-tonks on Broadway, the Grand Ole Opry — and the industry that turned songs into the South's biggest export. But the city's boom brought more than musicians: the universities, the healthcare giants, and the surprising distinction of being the Kurdish capital of America — the largest Kurdish community on the continent, built by refugees who became citizens and entrepreneurs.",
      "The peoples of Nashville are the New South in miniature: Black Nashville — the churches, the colleges, the music — the white country-music establishment and the suburban sprawl, the Kurdish community of the south side, the Mexican and Central American workers who built the boom, and the newcomers drawn by the jobs and the songs. The city's culture is the song: everyone has one, everyone knows someone who does, and the industry runs on the hope of the next hit.",
      "For caravans, Nashville is the southern music-and-medicine hub: I-65 and I-40 cross here, the healthcare industry ships continent-wide. A trader in Nashville deals with the continent's most optimistic merchants — the city's boom mentality infects everything. The deals are good, the music is better, and the Kurdish bakeries on the south side are worth the trip alone.",
    ],
    related: ["lore-state-tennessee", "lore-faction-southern-compact"],
  },
  {
    id: "lore-city-las-vegas",
    title: "Las Vegas — The Neon Oasis",
    category: "world",
    tags: ["las-vegas", "city", "desert", "entertainment"],
    summary: "The continent's playground: neon, odds, and the desert's strangest city.",
    body: [
      "Las Vegas is the continent's playground: the Strip rebuilt brighter than ever, the casinos running around the clock, the entertainment capital drawing visitors from every state. The city's logic is simple — the house always wins, and the house is the city — and it's worked for a century. The Unraveling didn't hurt Vegas; if anything, the demand for escape went up.",
      "The peoples of Vegas are a desert boomtown mix: the casino workers — dealers, performers, servers — from everywhere, the Mormon ranching families of the north, the Basque sheepherders of the high desert, the tribal nations who hold the lands the city needs, and the tech exiles building data centers in the desert. The city's culture is the odds: everything's a bet, everyone's playing, and the smart money knows when to walk away.",
      "For caravans, Vegas is the western warehouse and the continent's gray market: the I-15 corridor connects to California, the distribution hubs serve the Southwest. Goods flow through — legal, gray, and otherwise. A trader in Vegas finds the continent's most creative deals and its most dangerous temptations. The advice is old and still true: don't gamble what you can't afford to lose, and the caravan's working capital counts.",
    ],
    related: ["lore-state-nevada", "lore-faction-pacific-compact"],
  },
];
