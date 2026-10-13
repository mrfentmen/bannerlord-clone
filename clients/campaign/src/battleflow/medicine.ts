/**
 * Battlefield medicine (Rowan solo task 45).
 *
 * After the battle, the surgeon's team treats the wounded: a fraction of
 * the casualties are saved and return to the ranks. Better surgeons save
 * more. The results list how many were saved, shown in the after-action
 * report.
 */

export interface SurgeonReport {
  wounded: number;
  saved: number;
  died: number;
  /** Surgeon skill 0..10 used for this report. */
  surgeonSkill: number;
  line: string;
}

/**
 * Treat the wounded. Each wounded soldier has a save chance from the
 * surgeon's skill (25% at skill 0, up to 80% at skill 10). Deterministic
 * from the seed.
 */
export function treatWounded(wounded: number, surgeonSkill: number, seed: number): SurgeonReport {
  const skill = Math.max(0, Math.min(10, Math.round(surgeonSkill)));
  const saveChance = 0.25 + (skill / 10) * 0.55;
  let saved = 0;
  let s = (seed >>> 0) || 1;
  for (let i = 0; i < wounded; i++) {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    if (s / 4294967296 < saveChance) saved++;
  }
  const died = wounded - saved;
  return {
    wounded,
    saved,
    died,
    surgeonSkill: skill,
    line: `The surgeons saved ${saved} of ${wounded} wounded${died > 0 ? `; ${died} succumbed` : ""}.`,
  };
}
