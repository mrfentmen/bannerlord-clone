/**
 * Bannerlord-style name generator, modernized for present-day America.
 *
 * Bannerlord does NOT build names from syllables. It is a preset lookup:
 * per-culture pools of complete first names live in spcultures.xml, and the
 * randomizer picks one matching the character's culture and sex. Clan names
 * follow per-culture formulas (Vlandia "dey X", Sturgia "-ing", etc.).
 *
 * This module is the same design: per-faction pools of complete American
 * names, a random pick by faction and sex, and per-faction clan formulas
 * with modern regional flavor. Pools are fixed lists, so repeats happen
 * over long playthroughs — exactly like Calradia.
 */

export type NameSex = "male" | "female";

/** The six factions, keyed by side id. */
const MALE_NAMES: Record<string, string[]> = {
  "pacific-compact": [
    "Kai", "Mateo", "Ezra", "Julian", "Diego", "Omar", "Kenji", "Rafael",
    "Theo", "Miles", "Jasper", "Felix", "Andre", "Dario", "Ellis", "Hugo",
    "Ivan", "Joaquin", "Koa", "Luca", "Malik", "Nico", "Owen", "Paolo",
    "Ravi", "Santiago", "Tariq", "Umar", "Victor", "Wesley", "Xavier", "Yusuf",
    "Zane", "Alejandro", "Benicio", "Cruz", "Devin", "Emilio", "Franco", "Gio",
    "Hector", "Iker", "Jalen", "Koda", "Leon", "Marco", "Nash", "Orlando",
  ],
  "mountain-alliance": [
    "Erik", "Lars", "Gunnar", "Hank", "Colt", "Wyatt", "Boone", "Casper",
    "Deke", "Emmett", "Flint", "Gus", "Hollis", "Ike", "Jed", "Koda",
    "Levi", "Mack", "Nash", "Otis", "Rye", "Silas", "Trapper", "Wade",
    "Ansel", "Birch", "Cade", "Doran", "Eamon", "Ford", "Grady", "Huck",
    "Jasper", "Knox", "Logan", "Magnus", "Nils", "Orson", "Pete", "Quinn",
    "Roscoe", "Sten", "Torvald", "Viggo", "Wells", "Yancy", "Zeb", "Alder",
  ],
  "great-lakes-union": [
    "Henry", "Walter", "Stan", "Frank", "Earl", "Harold", "Chester", "Vern",
    "Otto", "Leonard", "Marvin", "Floyd", "Glenn", "Howard", "Russell", "Clifford",
    "Duane", "Elmer", "Gordon", "Harvey", "Irvin", "Lloyd", "Milton", "Norman",
    "Orville", "Percy", "Quentin", "Raymond", "Stanley", "Theodore", "Urban", "Vernon",
    "Wilbur", "Xavier", "Yusuf", "Zachary", "Amos", "Bernard", "Cecil", "Donald",
    "Edgar", "Francis", "George", "Herbert", "Ivan", "Joseph", "Kenneth", "Louis",
  ],
  "southern-compact": [
    "Billy", "Beau", "Travis", "Dale", "Waylon", "Jesse", "Colton", "Grady",
    "Hoyt", "Jackson", "Knox", "Lamar", "Mason", "Nolan", "Preston", "Rhett",
    "Sawyer", "Tucker", "Vernon", "Wade", "Zeke", "Amos", "Clay", "Dallas",
    "Earl", "Forrest", "Grady", "Hayes", "Ivan", "Jeb", "Kirk", "Lyle",
    "Merle", "Neal", "Otis", "Porter", "Quincy", "Roscoe", "Shelby", "Thad",
    "Ulmer", "Virgil", "Wendell", "Yates", "Zebulon", "Bo", "Cordell", "Doyle",
  ],
  "lone-star-frontier": [
    "Austin", "Ryder", "Walker", "Colt", "Dusty", "Rooster", "Tex", "Bandit",
    "Cody", "Dillon", "Easton", "Ford", "Gage", "Hayes", "Jett", "Kane",
    "Logan", "Maverick", "Nash", "Payton", "Quinn", "Ranger", "Stone", "Tanner",
    "Boone", "Cash", "Dawson", "Eli", "Flint", "Gunner", "Hoss", "Ira",
    "Jace", "Kolt", "Luke", "Mason", "Ned", "Owens", "Pecos", "Ridge",
    "Slater", "Trip", "Vaughn", "West", "Wyatt", "Zane", "Bodie", "Chase",
  ],
  "atlantic-corridor": [
    "Whitaker", "Preston", "Charles", "Theodore", "Harrison", "Bennett", "Graham", "Elliot",
    "Spencer", "Thatcher", "Winslow", "Ashford", "Caldwell", "Delaney", "Emerson", "Foster",
    "Gardner", "Hollister", "Ingram", "Jefferson", "Kingsley", "Lawson", "Mercer", "Nolan",
    "Ogden", "Pierce", "Quincy", "Radcliffe", "Stanton", "Truman", "Upton", "Vance",
    "Ward", "Yale", "Abbott", "Brooks", "Chandler", "Draper", "Ellsworth", "Fairbanks",
    "Grafton", "Hale", "Irving", "Judson", "Kendall", "Langston", "Merritt", "Norcross",
  ],
};

const FEMALE_NAMES: Record<string, string[]> = {
  "pacific-compact": [
    "Maya", "Luna", "Sofia", "Priya", "Elena", "Aria", "Isla", "Nora",
    "Wren", "Zoe", "Ruby", "Stella", "Ivy", "Cleo", "Dahlia", "Esme",
    "Freya", "Gia", "Hana", "Iris", "Jade", "Kira", "Lena", "Mira",
    "Nadia", "Opal", "Paloma", "Quinn", "Rosa", "Sena", "Tessa", "Uma",
    "Vera", "Willa", "Xena", "Yara", "Zara", "Alba", "Bianca", "Camila",
    "Delia", "Elif", "Farah", "Gemma", "Hazel", "Ines", "Juno", "Kiara",
  ],
  "mountain-alliance": [
    "Ingrid", "Freya", "Sadie", "June", "Hazel", "Willa", "Ada", "Bryn",
    "Cora", "Della", "Elsa", "Fern", "Greta", "Hattie", "Ivy", "Josie",
    "Liv", "Mabel", "Nell", "Opal", "Pearl", "Rosa", "Signe", "Tilda",
    "Astrid", "Bodil", "Dagny", "Erika", "Gunda", "Hilda", "Inga", "Karin",
    "Lena", "Maren", "Nora", "Ottilie", "Runa", "Selma", "Torhild", "Ulrika",
    "Vendla", "Ylva", "Asta", "Brita", "Cecilia", "Dagna", "Embla", "Frida",
  ],
  "great-lakes-union": [
    "Dorothy", "Helen", "Marge", "Ruth", "Agnes", "Bertha", "Ethel", "Gladys",
    "Harriet", "Ida", "Josephine", "Lillian", "Mildred", "Nellie", "Olive", "Pearl",
    "Rose", "Selma", "Theresa", "Violet", "Wilma", "Ada", "Clara", "Edith",
    "Florence", "Gertrude", "Hazel", "Irene", "Juanita", "Katherine", "Lucille", "Mabel",
    "Norma", "Opal", "Pauline", "Rosemary", "Shirley", "Thelma", "Ursula", "Verna",
    "Wanda", "Yvonne", "Zelda", "Audrey", "Betty", "Carol", "Doris", "Evelyn",
  ],
  "southern-compact": [
    "Savannah", "Scarlett", "Jolene", "Magnolia", "Belle", "Charlene", "Darlene", "Earline",
    "Faye", "Georgia", "Hattie", "Idabel", "Joella", "Loretta", "Mabel", "Nadine",
    "Opal", "Patsy", "Reba", "Shelby", "Tammy", "Vada", "Willa", "Yvonne",
    "Adeline", "Billie", "Carlene", "Delilah", "Ellie", "Francine", "Gracie", "Holly",
    "Imogene", "Janelle", "Katie", "Luanne", "Marlene", "Nettie", "Ora", "Peggy",
    "Queenie", "Ronda", "Sadie", "Tanya", "Una", "Velma", "Winnie", "Yolanda",
  ],
  "lone-star-frontier": [
    "Bonnie", "Dixie", "Cheyenne", "Dallas", "Ember", "Farrah", "Georgia", "Harper",
    "Ivy", "Josie", "Kacey", "Laredo", "Marfa", "Nadia", "Odessa", "Paisley",
    "Quinn", "Remi", "Sage", "Tatum", "Uvalde", "Vera", "Waco", "Yara",
    "Abilene", "Bandera", "Canyon", "DelRio", "ElPaso", "Fredericksburg", "Gruene", "Hondo",
    "Kerrville", "Llano", "Marathon", "Nacogdoches", "Ozona", "Pecos", "Refugio", "Sonora",
    "Tejas", "Utopia", "Vidor", "Wimberley", "Yorktown", "Zapata", "Alpine", "Brenham",
  ],
  "atlantic-corridor": [
    "Eleanor", "Margaret", "Catherine", "Vivian", "Adelaide", "Beatrice", "Constance", "Dorothea",
    "Edith", "Florence", "Genevieve", "Harriet", "Imogen", "Josephine", "Katherine", "Lillian",
    "Millicent", "Nathalie", "Odette", "Penelope", "Rosalind", "Sylvia", "Theodora", "Victoria",
    "Alexandra", "Blanche", "Cordelia", "Daphne", "Evangeline", "Francesca", "Gwendolyn", "Henrietta",
    "Isadora", "Jacqueline", "Kendra", "Louisa", "Marianne", "Nadia", "Octavia", "Priscilla",
    "Regina", "Seraphina", "Tabitha", "Ursula", "Veronica", "Wilhelmina", "Xenia", "Yvette",
  ],
};

/**
 * Random first name from the faction's pool — the spcultures.xml lookup.
 * Unknown factions fall back to a generic American pool.
 */
export function randomName(
  factionId: string,
  sex: NameSex,
  random: () => number = Math.random,
): string {
  const pool = (sex === "male" ? MALE_NAMES[factionId] : FEMALE_NAMES[factionId]) ?? [
    ...(MALE_NAMES["great-lakes-union"] ?? []),
    ...(FEMALE_NAMES["great-lakes-union"] ?? []),
  ];
  return pool[Math.floor(random() * pool.length)] ?? "Alex";
}

/**
 * Clan naming formulas, modernized from Bannerlord's per-culture rules.
 *
 * Bannerlord: Vlandia "dey {Settlement}", Battania "fen {Name}",
 * Sturgia "{Patriarch}ing", Aserai "Banu {Name}", Khuzait "{Name}it",
 * Empire "{Name}is/{Name}os".
 *
 * Modern America:
 * - mountain-alliance: Scandinavian "-son" patronymics (Sturgia parallel)
 * - great-lakes-union: "of {Town}" mill-town style (Vlandia parallel)
 * - lone-star-frontier: "{Surname} Ranch" (Khuzait parallel)
 * - southern-compact: "the {Surname}s" family style (Battania parallel)
 * - pacific-compact: "{Surname} Collective" (Aserai parallel)
 * - atlantic-corridor: "House {Surname}" old-establishment (Empire parallel)
 */
export function clanName(
  factionId: string,
  base: string,
  random: () => number = Math.random,
): string {
  const clean = base.trim() || "Vance";
  switch (factionId) {
    case "mountain-alliance": {
      // -son / -sen patronymic, Sturgia-style.
      const suffix = random() < 0.5 ? "son" : "sen";
      const stem = clean.replace(/(son|sen)$/i, "");
      return `${stem}${suffix}`;
    }
    case "great-lakes-union":
      return `of ${clean}`;
    case "lone-star-frontier":
      return `${clean} Ranch`;
    case "southern-compact": {
      const stem = clean.replace(/s$/i, "");
      return `the ${stem}s`;
    }
    case "pacific-compact":
      return `${clean} Collective`;
    case "atlantic-corridor":
      return `House ${clean}`;
    default:
      return `${clean} Family`;
  }
}

// ---------------------------------------------------------------------------
// Crafted item names (Bannerlord's smithing name stitching)
// ---------------------------------------------------------------------------

/** Bannerlord stitches [adjective] [feature] [weapon] when naming a forge. */
const WEAPON_PREFIXES = [
  "Heavily", "Lightly", "Reinforced", "Balanced", "Worn", "Custom",
  "Match-grade", "Field-stripped", "Cerakoted", "Battle-worn",
];

const WEAPON_FEATURES = [
  "Suppressed", "Tactical", "Extended", "Polymer", "Scoped", "Drum-fed",
  "Short-barreled", "Long-slide", "Compensated", "Folding-stock",
];

/**
 * Generate a forged weapon's display name, Bannerlord-style:
 * "[Heavily] [Suppressed] [AR-15]" — one to three parts, descriptors
 * stitched in front of the base item type.
 */
export function generateWeaponName(
  baseItem: string,
  random: () => number = Math.random,
): string {
  const parts: string[] = [];
  // Bannerlord's generator mixes single, two-part, and three-part names.
  const roll = random();
  if (roll < 0.25) {
    // Single part: just the base.
  } else if (roll < 0.65) {
    // Two parts: one descriptor + base.
    parts.push(
      random() < 0.5
        ? WEAPON_PREFIXES[Math.floor(random() * WEAPON_PREFIXES.length)]!
        : WEAPON_FEATURES[Math.floor(random() * WEAPON_FEATURES.length)]!,
    );
  } else {
    // Three parts: prefix + feature + base.
    parts.push(WEAPON_PREFIXES[Math.floor(random() * WEAPON_PREFIXES.length)]!);
    parts.push(WEAPON_FEATURES[Math.floor(random() * WEAPON_FEATURES.length)]!);
  }
  parts.push(baseItem);
  return parts.join(" ");
}
