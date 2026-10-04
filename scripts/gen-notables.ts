/**
 * Generate NPC name rosters for all cities.
 * Run with: npx tsx scripts/gen-notables.ts
 */

import { personName, createNameRng } from "../clients/campaign/src/data/names.js";

const CITIES: Record<string, { seed: number; ethnicities: string[] }> = {
  denver: { seed: 1001, ethnicities: ["german", "mexican", "irish", "italian", "african"] },
  boulder: { seed: 1002, ethnicities: ["german", "irish", "chinese", "korean"] },
  golden: { seed: 1003, ethnicities: ["irish", "german", "mexican"] },
  "new-york": { seed: 1004, ethnicities: ["italian", "irish", "jamaican", "chinese", "korean", "african", "russian"] },
  "los-angeles": { seed: 1005, ethnicities: ["mexican", "korean", "chinese", "african", "german"] },
  houston: { seed: 1006, ethnicities: ["mexican", "african", "german", "italian"] },
  miami: { seed: 1007, ethnicities: ["jamaican", "mexican", "italian", "african"] },
  chicago: { seed: 1008, ethnicities: ["polish", "irish", "italian", "african", "mexican", "german"] },
  seattle: { seed: 1009, ethnicities: ["german", "chinese", "korean", "african"] },
  atlanta: { seed: 1010, ethnicities: ["african", "german", "mexican", "korean"] },
  dallas: { seed: 1011, ethnicities: ["mexican", "german", "african", "italian"] },
  phoenix: { seed: 1012, ethnicities: ["mexican", "german", "irish"] },
  "san-francisco": { seed: 1013, ethnicities: ["chinese", "korean", "italian", "irish", "german"] },
  boston: { seed: 1014, ethnicities: ["irish", "italian", "german", "african"] },
  philadelphia: { seed: 1015, ethnicities: ["italian", "irish", "african", "german"] },
  "new-orleans": { seed: 1016, ethnicities: ["african", "jamaican", "italian", "mexican"] },
  detroit: { seed: 1017, ethnicities: ["african", "german", "italian", "irish"] },
  nashville: { seed: 1018, ethnicities: ["african", "german", "irish", "mexican"] },
  "las-vegas": { seed: 1019, ethnicities: ["italian", "mexican", "german", "irish"] },
  // New cities (del order 2026-10-04): top 50 US cities
  "san-antonio": { seed: 1020, ethnicities: ["mexican", "german", "african"] },
  "san-diego": { seed: 1021, ethnicities: ["mexican", "german", "chinese", "african"] },
  "san-jose": { seed: 1022, ethnicities: ["mexican", "chinese", "indian", "german"] },
  austin: { seed: 1023, ethnicities: ["mexican", "german", "african", "irish"] },
  jacksonville: { seed: 1024, ethnicities: ["african", "german", "irish"] },
  "fort-worth": { seed: 1025, ethnicities: ["mexican", "german", "african"] },
  columbus: { seed: 1026, ethnicities: ["german", "african", "irish"] },
  charlotte: { seed: 1027, ethnicities: ["african", "german", "mexican"] },
  indianapolis: { seed: 1028, ethnicities: ["german", "african", "irish"] },
  washington: { seed: 1029, ethnicities: ["african", "german", "irish", "italian"] },
  "el-paso": { seed: 1030, ethnicities: ["mexican", "german"] },
  "oklahoma-city": { seed: 1031, ethnicities: ["german", "african", "mexican"] },
  portland: { seed: 1032, ethnicities: ["german", "irish", "chinese"] },
  memphis: { seed: 1033, ethnicities: ["african", "german", "irish"] },
  louisville: { seed: 1034, ethnicities: ["german", "african", "irish"] },
  milwaukee: { seed: 1035, ethnicities: ["german", "african", "polish"] },
  baltimore: { seed: 1036, ethnicities: ["african", "german", "irish", "italian"] },
  albuquerque: { seed: 1037, ethnicities: ["mexican", "german", "irish"] },
  tucson: { seed: 1038, ethnicities: ["mexican", "german", "irish"] },
  fresno: { seed: 1039, ethnicities: ["mexican", "german", "chinese"] },
  sacramento: { seed: 1040, ethnicities: ["mexican", "chinese", "german", "african"] },
  mesa: { seed: 1041, ethnicities: ["mexican", "german", "irish"] },
  "kansas-city": { seed: 1042, ethnicities: ["german", "african", "irish"] },
  omaha: { seed: 1043, ethnicities: ["german", "irish", "african"] },
  raleigh: { seed: 1044, ethnicities: ["african", "german", "irish"] },
  "long-beach": { seed: 1045, ethnicities: ["mexican", "chinese", "african", "german"] },
  "virginia-beach": { seed: 1046, ethnicities: ["african", "german", "irish"] },
  oakland: { seed: 1047, ethnicities: ["african", "chinese", "mexican", "german"] },
  tulsa: { seed: 1048, ethnicities: ["german", "african", "irish"] },
  tampa: { seed: 1049, ethnicities: ["italian", "mexican", "african", "german"] },
  arlington: { seed: 1050, ethnicities: ["mexican", "german", "african"] },
  wichita: { seed: 1051, ethnicities: ["german", "african", "irish"] },
};

const ROLES = [
  { title: "Merchant Prince", type: "merchant" },
  { title: "Master Artisan", type: "artisan" },
  { title: "Elder", type: "elder" },
  { title: "Fixer", type: "fixer" },
  { title: "Scholar", type: "scholar" },
  { title: "Caravan Captain", type: "captain" },
  { title: "Guild Master", type: "merchant" },
  { title: "Ironwright", type: "artisan" },
  { title: "Council Speaker", type: "elder" },
  { title: "Information Broker", type: "fixer" },
  { title: "Physician", type: "scholar" },
  { title: "Quartermaster", type: "captain" },
];

for (const [cityId, cfg] of Object.entries(CITIES)) {
  // Only generate for new cities (skip the 19 already done)
  if (["denver","boulder","golden","new-york","los-angeles","houston","miami","chicago","seattle","atlanta","dallas","phoenix","san-francisco","boston","philadelphia","new-orleans","detroit","nashville","las-vegas"].includes(cityId)) {
    continue;
  }
  console.log(`\n// ${cityId}`);
  const rng = createNameRng(cfg.seed);
  for (let i = 0; i < 12; i++) {
    const ethnicity = cfg.ethnicities[Math.floor(rng() * cfg.ethnicities.length)]!;
    // polish/indian aren't in the generator; fall back
    const eth = ["italian","irish","chinese","korean","african","jamaican","mexican","german","russian"].includes(ethnicity) ? ethnicity : "german";
    const gender = rng() < 0.5 ? "male" : "female";
    const person = personName(eth, rng, gender);
    const role = ROLES[i % ROLES.length]!;
    const age = ["young", "middle", "old"][Math.floor(rng() * 3)];
    console.log(`  { name: "${person.firstName} ${person.lastName}", title: "${role.title}", ethnicityId: "${eth}", gender: "${gender}", portraitKey: "${eth}-${gender}-${age}", type: "${role.type}", power: ${60 + Math.floor(rng() * 40)} },`);
  }
}
