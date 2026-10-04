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
  console.log(`\n// ${cityId}`);
  const rng = createNameRng(cfg.seed);
  for (let i = 0; i < 12; i++) {
    const ethnicity = cfg.ethnicities[Math.floor(rng() * cfg.ethnicities.length)]!;
    // polish isn't in the generator; fall back
    const eth = ["italian","irish","chinese","korean","african","jamaican","mexican","german","russian"].includes(ethnicity) ? ethnicity : "german";
    const gender = rng() < 0.5 ? "male" : "female";
    const person = personName(eth, rng, gender);
    const role = ROLES[i % ROLES.length]!;
    const age = ["young", "middle", "old"][Math.floor(rng() * 3)];
    console.log(`  { name: "${person.firstName} ${person.lastName}", title: "${role.title}", ethnicityId: "${eth}", gender: "${gender}", portraitKey: "${eth}-${gender}-${age}", type: "${role.type}", power: ${60 + Math.floor(rng() * 40)} },`);
  }
}
