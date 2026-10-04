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

// ---------------------------------------------------------------------------
// Dirty fighting: kicks, shield bashes, ripostes
// ---------------------------------------------------------------------------

export type DirtyMove = 'kick' | 'shieldBash' | 'pommelStrike';

export interface DirtyExchange {
  move: DirtyMove;
  /** Defender's melee skill 0-10; higher reads the telegraph. */
  defenderSkill: number;
  /** Does the defender have a shield up? */
  defenderShielded: boolean;
}

export type DirtyOutcome =
  | { result: 'stagger'; damageMult: number; detail: string }
  | { result: 'whiffed'; damageMult: number; detail: string };

/**
 * Bannerlord's dirty fighting. Kicks and bashes don't do much damage —
 * they stagger, breaking the defender's block and opening them up. The
 * telegraph is readable: skilled defenders sidestep. Shields blunt kicks
 * but a shield bash answers a shield.
 */
export function resolveDirty(ex: DirtyExchange, random: () => number = Math.random): DirtyOutcome {
  // Base land chance 65%, -5% per defender skill point, +15% if the
  // defender is turtling behind a shield (they're planted).
  let chance = 0.65 - ex.defenderSkill * 0.05 + (ex.defenderShielded ? 0.15 : 0);
  if (ex.move === 'shieldBash' && !ex.defenderShielded) chance -= 0.2;
  if (ex.move === 'kick' && ex.defenderShielded) chance -= 0.1;
  chance = Math.min(0.9, Math.max(0.1, chance));

  if (random() < chance) {
    const lines: Record<DirtyMove, string> = {
      kick: 'The kick lands — the defender stumbles, guard broken.',
      shieldBash: 'Shield meets face. The defender reels.',
      pommelStrike: 'A pommel to the temple. Lights out briefly.',
    };
    return { result: 'stagger', damageMult: 0.3, detail: lines[ex.move] };
  }
  const misses: Record<DirtyMove, string> = {
    kick: 'The kick whiffs — the attacker is off-balance.',
    shieldBash: 'The bash misses and the attacker is wide open.',
    pommelStrike: 'The pommel finds only air.',
  };
  return { result: 'whiffed', damageMult: 0, detail: misses[ex.move] };
}

export interface RiposteWindow {
  /** The defender just blocked (true) — the riposte window is open. */
  blocked: boolean;
  /** Attacker's melee skill 0-10. */
  attackerSkill: number;
}

/**
 * Riposte: after a clean block, the defender answers instantly. Bannerlord
 * rewards the read — a riposte in the window is fast, hard to block, and
 * hits at 1.4x. Outside the window it's just a swing.
 */
export function riposteMultiplier(w: RiposteWindow): { mult: number; detail: string } {
  if (!w.blocked) {
    return { mult: 1.0, detail: 'No opening — just a swing.' };
  }
  const mult = 1.4 + w.attackerSkill * 0.02;
  return {
    mult: Math.round(mult * 100) / 100,
    detail: `Riposte! The block becomes the opening (×${mult.toFixed(2)}).`,
  };
}
