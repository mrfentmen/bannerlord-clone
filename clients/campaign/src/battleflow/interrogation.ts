/**
 * Prisoner interrogation (Rowan solo task 44).
 *
 * After a battle, captured prisoners can be interrogated for intel.
 * Success depends on the prisoner's rank and the interrogator's skill;
 * outcomes are deterministic from a seed so replays agree. Failure has
 * consequences: the prisoner clams up (no retry) or feeds false intel.
 */

export interface Prisoner {
  id: string;
  name: string;
  /** Higher rank = harder to crack, better intel. */
  rank: 1 | 2 | 3;
}

export type InterrogationOutcome =
  | { result: "success"; intel: string; prisonerId: string }
  | { result: "resisted"; prisonerId: string }
  | { result: "false-intel"; intel: string; prisonerId: string };

const INTEL_BY_RANK: Record<number, string[]> = {
  1: [
    "The enemy camp is low on grain — two days of supplies at most.",
    "Their archers drill at dawn on the east field.",
  ],
  2: [
    "A supply convoy leaves their depot at midnight, lightly guarded.",
    "Their captain argues with the quartermaster over pay — morale is thin.",
  ],
  3: [
    "The enemy plans to strike the river crossing within the week.",
    "Their war council meets in the old mill; the guard changes at the third bell.",
  ],
};

const FALSE_INTEL = [
  "The prisoner claims their main force marches north — a little too eagerly.",
  "The prisoner describes a 'secret' armory that scouts have never seen.",
];

/** Deterministic 0..1 draw from a seed. */
function draw(seed: number): number {
  let s = seed >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x21f0aaad);
  s = Math.imul(s ^ (s >>> 15), 0x735a2d97);
  return ((s ^ (s >>> 15)) >>> 0) / 4294967296;
}

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Interrogate a prisoner. interrogatorSkill 0..10. Higher rank prisoners
 * resist more; failure can yield false intel (flagged as suspicious).
 */
export function interrogate(
  prisoner: Prisoner,
  interrogatorSkill: number,
  seed: number,
): InterrogationOutcome {
  const skill = Math.max(0, Math.min(10, interrogatorSkill));
  const successChance = Math.max(0.1, Math.min(0.95, 0.35 + skill * 0.06 - (prisoner.rank - 1) * 0.15));
  const roll = draw(hash(prisoner.id) ^ (seed >>> 0));
  if (roll < successChance) {
    const intel = INTEL_BY_RANK[prisoner.rank]!;
    const pick = intel[Math.floor(draw(hash(prisoner.id + seed)) * intel.length)]!;
    return { result: "success", intel: pick, prisonerId: prisoner.id };
  }
  // Failed: either they resist, or they lie (flagged as suspicious).
  const lieRoll = draw(hash(prisoner.id + "lie") ^ (seed >>> 0));
  if (lieRoll < 0.35) {
    const fake = FALSE_INTEL[Math.floor(draw(hash(seed + "fake")) * FALSE_INTEL.length)]!;
    return { result: "false-intel", intel: `${fake} (treat with suspicion)`, prisonerId: prisoner.id };
  }
  return { result: "resisted", prisonerId: prisoner.id };
}
