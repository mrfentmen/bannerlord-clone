/**
 * Ethnicity-based random name generator (Rowan).
 *
 * Every new campaign gets fresh leaders, kings, nobles, merchants and
 * couriers: the fixture seeds its RNG per campaign and draws every notable
 * name from here, so no two campaigns share a cast. Pools are keyed by the
 * canonical ethnicity ids in `data/ethnicities.ts` — the same ids the
 * character maker uses, so a generated NPC's culture always matches a real
 * playable culture.
 *
 * All name pools are ordinary given/family names of the corresponding
 * American communities. Nothing here invents slurs, and titles are the
 * street-level ranks of the game's post-Unraveling America (boss, kingpin,
 * elder), never real-world claims about living people.
 */

export type NpcGender = "male" | "female";
export type NameRng = () => number;

/** Deterministic seeded RNG (mulberry32). Same seed -> same names. */
export function createNameRng(seed: number): NameRng {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let z = Math.imul(t ^ (t >>> 15), t | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: NameRng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

const MALE_FIRST_NAMES: Record<string, string[]> = {
  italian: ["Marco", "Tony", "Sal", "Vito", "Frank", "Joey", "Dominic", "Paulie", "Angelo", "Rocco", "Vinnie", "Carmine", "Luca", "Enzo", "Gino", "Alfonse", "Benny", "Dante"],
  irish: ["Seamus", "Connor", "Patrick", "Finn", "Liam", "Declan", "Brendan", "Kevin", "Sean", "Colin", "Desmond", "Eamon", "Kieran", "Malachy", "Niall", "Owen", "Padraig", "Ronan"],
  chinese: ["Wei", "Jian", "Chen", "Xiao", "Bo", "Lei", "Tao", "Ming", "Hao", "Jun", "Feng", "Kai", "Long", "Peng", "Qiang", "Rui", "Yong", "An"],
  korean: ["Jin", "Min", "Tae", "Dong", "Seo", "Hyun", "Jae", "Sung", "Woo", "Kyu", "Han", "Jun", "Ki", "Sang", "Dae", "Young", "Chan", "Beom"],
  african: ["Marcus", "Darnell", "Jerome", "Andre", "Malik", "Terrence", "Darius", "Jamal", "DeShawn", "Tyrone", "Reginald", "Curtis", "Earl", "Floyd", "Otis", "Leon", "Percy", "Sam"],
  jamaican: ["Damian", "Orlando", "Tyrone", "Dwayne", "Desmond", "Leroy", "Clive", "Errol", "Garfield", "Horace", "Lester", "Marlon", "Neville", "Owen", "Rupert", "Aston", "Barrington", "Delroy"],
  mexican: ["Carlos", "Diego", "Miguel", "Jorge", "Rafael", "Eduardo", "Fernando", "Ricardo", "Andres", "Emilio", "Felipe", "Gustavo", "Hector", "Ignacio", "Javier", "Lorenzo", "Manuel", "Oscar"],
  puerto_rican: ["Luis", "Rafael", "Miguel", "Diego", "Angel", "Carlos", "Edwin", "Felix", "Hector", "Ivan", "Jorge", "Julio", "Manuel", "Nelson", "Pablo", "Raul", "Roberto", "Tito"],
  german: ["Hans", "Klaus", "Otto", "Fritz", "Dieter", "Ernst", "Franz", "Gunther", "Heinrich", "Helmut", "Johann", "Karl", "Konrad", "Ludwig", "Manfred", "Oskar", "Rudolf", "Werner"],
  russian: ["Ivan", "Dmitri", "Sergei", "Viktor", "Alexei", "Boris", "Grigori", "Mikhail", "Nikolai", "Oleg", "Pavel", "Roman", "Stanislav", "Vadim", "Yuri", "Andrei", "Fedor", "Leonid"],
};

const FEMALE_FIRST_NAMES: Record<string, string[]> = {
  italian: ["Sofia", "Gina", "Rosa", "Elena", "Maria", "Lucia", "Teresa", "Adriana", "Bianca", "Carla", "Francesca", "Isabella", "Liliana", "Marta", "Paola", "Renata", "Silvana", "Vera"],
  irish: ["Bridget", "Maeve", "Nora", "Aoife", "Siobhan", "Fiona", "Kathleen", "Maureen", "Niamh", "Orla", "Roisin", "Saoirse", "Aisling", "Deirdre", "Eileen", "Grainne", "Tara", "Una"],
  chinese: ["Mei", "Li", "Fang", "Na", "Jing", "Lan", "Hui", "Yan", "Xia", "Ying", "Lin", "Min", "Qi", "Ting", "Xin", "Yue", "Zhen", "Xue"],
  korean: ["Soo", "Hana", "Yuna", "Seo", "Ji", "Eun", "Mi", "Ae", "Kyung", "Na", "Hae", "Yeon", "Sook", "Jung", "Hye", "Rin", "Da", "Bom"],
  african: ["Keisha", "Tamika", "Latoya", "Nia", "Denise", "Gloria", "Bernice", "Claudette", "Doris", "Ernestine", "Faye", "Hattie", "Inez", "Josephine", "Louise", "Mabel", "Pearl", "Ruth"],
  jamaican: ["Marlene", "Shanice", "Althea", "Denise", "Beverley", "Claudette", "Delores", "Francine", "Hyacinth", "Iona", "Joycelyn", "Kezia", "Lorna", "Mavis", "Nadine", "Olive", "Paulette", "Rosemarie"],
  mexican: ["Maria", "Lucia", "Rosa", "Elena", "Carmen", "Isabel", "Teresa", "Adriana", "Beatriz", "Consuelo", "Dolores", "Esperanza", "Fernanda", "Gabriela", "Josefina", "Leticia", "Margarita", "Patricia"],
  puerto_rican: ["Carmen", "Isabel", "Sofia", "Luz", "Maria", "Elena", "Ana", "Rosa", "Teresa", "Wanda", "Nilsa", "Damaris", "Ivette", "Lizette", "Marisol", "Noemi", "Olga", "Vilma"],
  german: ["Greta", "Ingrid", "Helga", "Anna", "Brigitte", "Christa", "Dorothea", "Elke", "Frieda", "Gerda", "Hannelore", "Ilse", "Johanna", "Karin", "Lena", "Martina", "Petra", "Ursula"],
  russian: ["Natasha", "Olga", "Irina", "Anya", "Ekaterina", "Galina", "Larisa", "Marina", "Nina", "Svetlana", "Tatiana", "Vera", "Yelena", "Zoya", "Daria", "Kira", "Oksana", "Polina"],
};

const LAST_NAMES: Record<string, string[]> = {
  italian: ["Rossi", "Marino", "Conti", "Ferrara", "Bianchi", "Romano", "Corleone", "Marchetti", "Ferraro", "Esposito", "Ricci", "Greco", "Bruno", "Colombo", "Moretti", "Barbieri", "Santoro", "Rizzo"],
  irish: ["Murphy", "Kelly", "Sullivan", "Walsh", "Byrne", "Ryan", "O'Malley", "Kavanagh", "Doyle", "Brennan", "Flynn", "Gallagher", "Hayes", "Kennedy", "Lynch", "Moore", "Nolan", "Quinn"],
  chinese: ["Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Long", "Huang", "Zhou", "Wu", "Xu", "Sun", "Ma", "Zhu", "Hu", "Guo", "He", "Luo"],
  korean: ["Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon", "Jang", "Shin", "Han", "Oh", "Seo", "Kwon", "Hwang", "Ahn", "Song", "Hong"],
  african: ["Johnson", "Williams", "Brown", "Jones", "Davis", "Wilson", "Freeman", "Justice", "King", "Carter", "Robinson", "Thompson", "Harris", "Moore", "Jackson", "White", "Brooks", "Reed"],
  jamaican: ["Brown", "Campbell", "Reid", "Thompson", "Walker", "Morgan", "Marley", "Bennett", "Clarke", "Graham", "Edwards", "Foster", "Gordon", "Henry", "James", "Palmer", "Powell", "Simpson"],
  mexican: ["Garcia", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Perez", "Guerrero", "Vargas", "Reyes", "Sanchez", "Ramirez", "Cruz", "Ortiz", "Chavez", "Ruiz", "Diaz", "Moreno", "Alvarez"],
  puerto_rican: ["Rivera", "Torres", "Santiago", "Cruz", "Morales", "Ortiz", "Delgado", "Ramos", "Vega", "Castillo", "Fuentes", "Medina", "Navarro", "Pagan", "Quintana", "Rios", "Serrano", "Colón"],
  german: ["Schmidt", "Weber", "Meyer", "Wagner", "Becker", "Schulz", "Fischer", "Hoffmann", "Koch", "Bauer", "Richter", "Klein", "Wolf", "Schroder", "Neumann", "Braun", "Krause", "Zimmerman"],
  russian: ["Ivanov", "Petrov", "Sokolov", "Smirnov", "Kuznetsov", "Popov", "Volkov", "Mikhailov", "Fedorov", "Morozov", "Pavlov", "Semyonov", "Antonov", "Yakovlev", "Orlov", "Zaitsev", "Sorokin", "Romanov"],
};

/** Every ethnicity id with name pools. Mirrors `data/ethnicities.ts` ids. */
export const NAME_ETHNICITY_IDS: readonly string[] = Object.keys(LAST_NAMES);

export interface PersonName {
  firstName: string;
  lastName: string;
  fullName: string;
  gender: NpcGender;
  ethnicityId: string;
}

function validEthnicityId(id: string): string {
  return (LAST_NAMES[id] ? id : "italian");
}

/** A random person of the given ethnicity. Gender is 50/50 unless specified. */
export function personName(ethnicityId: string, rng: NameRng, gender?: NpcGender): PersonName {
  const id = validEthnicityId(ethnicityId);
  const g: NpcGender = gender ?? (rng() < 0.5 ? "male" : "female");
  const firstName = pick(rng, g === "male" ? MALE_FIRST_NAMES[id]! : FEMALE_FIRST_NAMES[id]!);
  const lastName = pick(rng, LAST_NAMES[id]!);
  return { firstName, lastName, fullName: `${firstName} ${lastName}`, gender: g, ethnicityId: id };
}

/** A random ethnicity id, uniform across the ten cultures. */
export function randomEthnicityId(rng: NameRng): string {
  return pick(rng, NAME_ETHNICITY_IDS);
}

/**
 * One call for settlement generation: a random ethnicity, then a random
 * person of it. This is what the fixture's notable generator uses, so every
 * campaign's leaders, nobles and merchants are fresh.
 */
export function generateNotableName(rng: NameRng): PersonName {
  return personName(randomEthnicityId(rng), rng);
}

/** Street-level ranks for the campaign's power figures. */
export type NpcRole = "king" | "noble" | "leader" | "merchant" | "courier";

const ROLE_TITLES: Record<NpcRole, string[]> = {
  king: ["Kingpin", "Don", "Chairman", "Supremo", "Boss of Bosses"],
  noble: ["Elder", "Patron", "Matriarch", "Patriarch", "Don"],
  leader: ["Boss", "Chief", "Captain", "Commander"],
  merchant: ["Merchant Prince", "Broker", "Trader", "Factor"],
  courier: ["Runner", "Courier", "Messenger"],
};

export interface TitledName extends PersonName {
  role: NpcRole;
  title: string;
  /** e.g. "Don Marco Corleone". */
  styledName: string;
}

/** A named power figure: random ethnicity, name, and a fitting title. */
export function titledName(role: NpcRole, rng: NameRng, ethnicityId?: string): TitledName {
  const person = personName(ethnicityId ?? randomEthnicityId(rng), rng);
  const title = pick(rng, ROLE_TITLES[role]);
  return { ...person, role, title, styledName: `${title} ${person.fullName}` };
}

/**
 * The opening roster for a new campaign: one king, two nobles and three
 * leaders, all titled, all from random ethnicities. Callers that need the
 * names to match a campaign seed pass `createNameRng(seed)`.
 */
export function generateStartingLeaders(rng: NameRng): TitledName[] {
  return [
    titledName("king", rng),
    titledName("noble", rng),
    titledName("noble", rng),
    titledName("leader", rng),
    titledName("leader", rng),
    titledName("leader", rng),
  ];
}
