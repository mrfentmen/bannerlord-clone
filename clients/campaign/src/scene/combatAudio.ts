/**
 * Tasks 334, 335: hit and kill sound triggers.
 *
 * The combat bus says what happened; this module says it out loud. Every
 * strike plays `combat.hit`, every kill plays `combat.kill` — both real SFX
 * from the named sound bus, never synthesized. Hits are throttled: a
 * five-on-five melee can land several blows a second, and the mixer does not
 * need all of them. Kills are never throttled — a death is always worth
 * hearing. The bus is injected so tests can record calls without audio.
 */

import type { CombatEventSource } from "./combatEvents.js";
import { createSoundBus, type SoundBus } from "../audio/soundEvents.js";

/** ms between hit sounds; kills ignore it. Injected for tests. */
export const HIT_SOUND_THROTTLE_MS = 120;

export interface CombatAudio {
  destroy(): void;
}

export function createCombatAudio(
  source: CombatEventSource,
  opts: {
    bus?: SoundBus;
    hitThrottleMs?: number;
    now?: () => number;
  } = {},
): CombatAudio {
  const bus = opts.bus ?? createSoundBus();
  const hitThrottleMs = opts.hitThrottleMs ?? HIT_SOUND_THROTTLE_MS;
  const now = opts.now ?? (() => Date.now());
  let lastHitAt = -Infinity;

  const offStrike = source.onStrike(() => {
    const t = now();
    if (t - lastHitAt < hitThrottleMs) return;
    lastHitAt = t;
    bus.play("combat.hit");
  });
  const offKill = source.onKill(() => {
    bus.play("combat.kill");
  });

  return {
    destroy() {
      offStrike();
      offKill();
    },
  };
}
