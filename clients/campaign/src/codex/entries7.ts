/**
 * Front Range city lore (del order 2026-10-03).
 *
 * Deep lore for the playable hub cities of the fixture map: Denver, Boulder,
 * and Golden. Wired into town panels via the settlement→entry mapping.
 */

import type { CodexEntry } from "./types.js";

export const FRONT_RANGE_ENTRIES: CodexEntry[] = [
  {
    id: "lore-city-denver",
    title: "Denver — The Mile-High Hub",
    category: "world",
    tags: ["denver", "city", "hub", "front-range"],
    summary: "The largest city of the Front Range and the crossroads of every trade circuit.",
    body: [
      "Denver sits at the exact point where the Great Plains break against the Rocky Mountains, and everything in the Front Range flows through it. The merchant circuits all touch Denver. The courier runs all start or end here. If you want to move goods, people, or information across the region, you do it through Denver or you do it the hard way.",
      "Before the Unraveling, Denver was the capital of Colorado and a major American city — government, tech, transit, sports. The federal buildings downtown are hollow now, but the street grid survived, and the survivors rebuilt around it. The 16th Street Mall is a bazaar again. Union Station runs caravans instead of trains.",
      "Two powers hold the city in an uneasy balance. The Halloway family controls the downtown core and the eastern suburbs — Aurora, Thornton, the airport flats. They run the biggest merchant houses and tax every wagon that rolls through. Nobody moves serious freight in Denver without Halloway taking a cut, and nobody minds much, because the roads stay open.",
      "The markets here set the region's prices. Grain from the plains, tools from the foothill forges, medicine from the Boulder labs — it all comes to Denver to be priced and moved. A trader who understands Denver's market understands the Front Range economy, because Denver's market IS the Front Range economy with the serial numbers filed off.",
      "For a new arrival, Denver is the safest place to start and the hardest place to matter. The opportunities are real — every faction recruits here, every caravan hires guards here — but so is the competition. A thousand hungry newcomers wash through Union Station every month. The ones who make it are the ones who pick a crew, pick a trade, and don't look back.",
    ],
    related: ["lore-city-boulder", "lore-city-golden", "lore-faction-mountain-alliance"],
  },
  {
    id: "lore-city-boulder",
    title: "Boulder — The Enclave",
    category: "world",
    tags: ["boulder", "city", "vashti", "university"],
    summary: "University town turned fortress of learning, held by the Vashti highlanders.",
    body: [
      "Boulder was a university town before the Unraveling, and it never stopped being one. The campus is walled now, the laboratories run day and night, and the Vashti family — highlander stock from the foothill clans — holds the city as their seat. If Denver is the region's wallet, Boulder is its brain.",
      "The medicine that keeps the Front Range alive comes from Boulder's labs. The tools that work the foothill mines are designed here. Vashti doesn't just hold a city; they hold the knowledge base the whole region depends on, and they price it accordingly. A Boulder education is the most valuable thing a young person in the Front Range can get, and the Vashti know it.",
      "The city runs on a different rhythm than Denver. Less noise, more purpose. The streets are clean, the patrols are disciplined, and the university's charter — free inquiry, open debate, no faction litmus test — is enforced with highlander stubbornness. Scholars from Halloway territory study here. Traders from every circuit stop here. Boulder takes everyone's money and everyone's minds.",
      "But the enclave has walls for a reason. The foothill clans that back Vashti are warriors first, and the city's peace is a negotiated thing — renewed every season in councils that the university hosts but doesn't control. An outsider who mistakes Boulder's calm for softness learns differently, usually once.",
      "For caravans, Boulder is the high-value stop: medicine out, grain and fuel in. The Denver–Boulder Dispatch is the busiest courier run in the region for a reason. Whoever controls the Boulder road controls the region's lifeline, which is why both great families watch it like hawks.",
    ],
    related: ["lore-city-denver", "lore-city-golden", "lore-faction-mountain-alliance"],
  },
  {
    id: "lore-city-golden",
    title: "Golden — The Gateway",
    category: "world",
    tags: ["golden", "town", "gateway", "canyon"],
    summary: "Foothill town guarding the canyon roads into the high country.",
    body: [
      "Golden sits where the plains end and the mountains begin — the last flat ground before the canyons climb into the high country. Every road west goes through Golden. Every ore shipment, every timber load, every expedition into the mountains stages here. The town's whole economy is the gateway trade.",
      "It's a Vashti town, but barely. The highlanders hold the canyon mouths and the town council, but Golden's soul belongs to the teamsters, the outfitters, and the assay offices. This is a working town: dusty, loud, practical. The saloons serve caravan crews, not tourists. The general stores sell rope and powder, not souvenirs.",
      "The Golden–Central City Line is the lifeline of the mining district. Ore comes down from Central City and Idaho Springs, supplies go up. When that road closes — snow, rockslide, bandits — the whole high country feels it within days. The courier riders who run it are legends in the foothills, and the pay reflects the risk.",
      "Golden's trouble is that everyone needs it and nobody loves it. Denver's merchants see it as a toll booth. The mountain towns see it as a gatekeeper that skims. The Vashti see it as an outpost that costs more to hold than it returns. A smart operator in Golden plays all three against each other and gets rich. A dumb one gets crushed.",
      "For a new caravan, Golden is the proving ground. If your drivers and guards can run the canyon roads reliably, they can run anything in the Front Range. The Foothills Run circuit starts here for a reason — it's where the region's traders are made.",
    ],
    related: ["lore-city-denver", "lore-city-boulder", "lore-faction-mountain-alliance"],
  },
];
