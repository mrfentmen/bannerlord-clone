/**
 * Advanced melee maneuvers, ported from Bannerlord's directional combat.
 *
 * Bannerlord's melee is a mind game built on four attack directions. Two
 * maneuvers separate novices from duelists:
 *
 * - Feint: begin a swing in one direction, switch mid-swing. A defender who
 *   committed their block to the fake direction is open.
 * - Chamber block: attack *into* an incoming attack instead of blocking.
 *   Timing is tight, but a chamber deflects the blow and staggers the
 *   attacker, opening them up.
 *
 * This module resolves one exchange: attacker picks a direction (optionally
 * feinting), defender picks a response (block a direction, or chamber). The
 * result is a real outcome -- hit, blocked, chambered -- with the damage
 * multiplier the combat code applies.
 */

export type AttackDirection = 'overhead' | 'left' | 'right' | 'thrust';

export type Defense = { kind: 'block'; direction: AttackDirection } | { kind: 'chamber' };

export interface MeleeExchange {
  /** True direction of the attack (after any feint). */
  attack: AttackDirection;
  /** Direction the attacker showed first, if they feinted. */
  feintFrom?: AttackDirection;
  defense: Defense;
  /** Attacker's melee skill 0-10; higher chambers land more often. */
  attackerSkill: number;
  /** Defender's melee skill 0-10. */
  defenderSkill: number;
}

export type ExchangeOutcome =
  | { result: 'hit'; damageMult: number; detail: string }
  | { result: 'blocked'; damageMult: number; detail: string }
  | { result: 'chambered'; damageMult: number; detail: string };

/**
 * Resolve one exchange. Feints punish committed blocks; chambers punish
 * predictable attacks. Skill matters at the margins, reads matter most.
 */
export function resolveMelee(
  ex: MeleeExchange,
  random: () => number = Math.random,
): ExchangeOutcome {
  // Chamber: the defender attacks into the attack. It lands when the
  // defender's timing beats the attacker's -- skill-weighted coin flip with
  // the defender favored slightly, because the chamber is the harder move
  // to attempt and should pay when read correctly.
  if (ex.defense.kind === 'chamber') {
    const edge = 0.45 + (ex.defenderSkill - ex.attackerSkill) * 0.04;
    if (random() < Math.min(0.85, Math.max(0.15, edge))) {
      return {
        result: 'chambered',
        damageMult: 0,
        detail: 'Chambered! The defender strikes into the attack and staggers the attacker.',
      };
    }
    // Failed chamber: the defender attacked and missed -- wide open.
    return {
      result: 'hit',
      damageMult: 1.5,
      detail: 'The chamber misses and the attacker punishes the opening.',
    };
  }

  const blockDir = ex.defense.direction;

  // Feint: the defender committed to the fake direction.
  if (ex.feintFrom && blockDir === ex.feintFrom && blockDir !== ex.attack) {
    return {
      result: 'hit',
      damageMult: 1.25,
      detail: `Feint! The defender bit on the ${ex.feintFrom} fake.`,
    };
  }

  // Honest block, right direction.
  if (blockDir === ex.attack) {
    // A feint the defender read correctly is still a clean block.
    return { result: 'blocked', damageMult: 0.15, detail: 'Blocked. The defender read it.' };
  }

  // Wrong direction entirely.
  return { result: 'hit', damageMult: 1.0, detail: 'The block was in the wrong direction.' };
}

/** The four directions, for UI pickers and AI. */
export const ATTACK_DIRECTIONS: readonly AttackDirection[] = [
  'overhead',
  'left',
  'right',
  'thrust',
];
