/**
 * Bark trigger system: voice barks wired into gameplay.
 *
 * 3,513 barks ship in the manifest (`bark-<voice>-<category>-<n>`); before
 * this module nothing played them. The triggers map game events to bark
 * categories, pick a random voice and variant, and enforce cooldowns so the
 * battlefield talks without shouting over itself.
 *
 * Two call shapes:
 * - `barkFor(order)` / `barkBattleEvent(event)` — battle commands and beats.
 * - `barkNpc(profession)` — ambient town chatter on a slow timer.
 *
 * Anti-overlap: one bark at a time globally, a short global cooldown, and a
 * longer per-category cooldown. A trigger that lands inside a cooldown is
 * dropped, not queued — barks comment on the moment, and the moment passes.
 */

import { getAudioManager } from "./AudioManager.js";

/** Battle orders the commander can issue (mirrors command/types.ts OrderKind). */
export type BarkOrder =
  | "attack"
  | "attack-move"
  | "charge"
  | "spread"
  | "form-up"
  | "follow"
  | "hold"
  | "retreat"
  | "rally"
  | "move";

/** Battle beats worth a shout. */
export type BattleEvent =
  | "battle-start"
  | "victory"
  | "defeat"
  | "ambush"
  | "reinforcements"
  | "morale-break"
  | "enemy-rout";

/** Order -> bark categories (one picked at random per trigger). */
const ORDER_BARKS: Record<BarkOrder, string[]> = {
  "attack": ["attack", "press-the-attack", "dawn-attack"],
  "attack-move": ["advance", "advance-in-order", "advance-the-line"],
  "charge": ["charge", "charge-now", "charge-the-square"],
  "spread": ["spread-out"],
  "form-up": ["form-the-line", "form-the-wedge", "form-testudo"],
  "follow": ["follow-me", "stay-low"],
  "hold": ["hold", "hold-position", "hold-the-line", "hold-fast", "hold-steady"],
  "retreat": ["retreat", "sound-retreat", "cover-the-retreat"],
  "rally": ["rally", "rally-to-me", "rally-to-colors", "stand-fast"],
  "move": ["move", "advance", "advance-in-order"],
};

/** Battle event -> bark categories. */
const EVENT_BARKS: Record<BattleEvent, string[]> = {
  "battle-start": ["charge", "charge-now", "brace-the-charge"],
  "victory": ["victory", "victory-cheer"],
  "defeat": ["defeat", "sound-retreat", "fall-back-now"],
  "ambush": ["ambush-now", "spring-the-trap"],
  "reinforcements": ["rally", "rally-to-me"],
  "morale-break": ["stand-fast", "stand-your-ground", "hold-the-line"],
  "enemy-rout": ["pursue-them", "no-quarter", "give-no-quarter"],
};

/** ms between any two barks. */
const GLOBAL_COOLDOWN_MS = 2500;
/** ms before the same category can bark again. */
const CATEGORY_COOLDOWN_MS = 30000;
/** ms between ambient NPC barks in a town. */
const NPC_AMBIENT_MS = 45000;

const VOICES = ["briggs", "paloma", "vincent"] as const;
export type BarkVoice = (typeof VOICES)[number];

export class BarkTriggers {
  private lastBarkAt = 0;
  private lastCategoryAt = new Map<string, number>();
  private npcTimer: ReturnType<typeof setInterval> | null = null;
  private now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** A battle order was issued: shout the matching command bark. */
  barkFor(order: BarkOrder, voice?: BarkVoice): void {
    const categories = ORDER_BARKS[order];
    if (!categories) return;
    this.playFrom(categories, voice);
  }

  /** A battle beat happened: shout it. */
  barkBattleEvent(event: BattleEvent, voice?: BarkVoice): void {
    const categories = EVENT_BARKS[event];
    if (!categories) return;
    this.playFrom(categories, voice);
  }

  /** One NPC line for a profession (blacksmith, barkeep, ...). */
  barkNpc(profession: string, voice?: BarkVoice): void {
    this.playFrom([profession], voice);
  }

  /** Start ambient town chatter: a random profession bark on a slow timer. */
  startNpcAmbient(professions: string[]): void {
    this.stopNpcAmbient();
    if (professions.length === 0) return;
    const tick = () => {
      const profession = professions[Math.floor(Math.random() * professions.length)]!;
      this.barkNpc(profession);
    };
    // First bark lands quickly so the town feels alive on entry.
    this.npcTimer = setInterval(tick, NPC_AMBIENT_MS);
    tick();
  }

  /** Stop ambient town chatter (leaving town). */
  stopNpcAmbient(): void {
    if (this.npcTimer) clearInterval(this.npcTimer);
    this.npcTimer = null;
  }

  private playFrom(categories: string[], voice?: BarkVoice): void {
    const t = this.now();
    if (t - this.lastBarkAt < GLOBAL_COOLDOWN_MS) return;
    const category = categories[Math.floor(Math.random() * categories.length)]!;
    const lastCat = this.lastCategoryAt.get(category) ?? 0;
    if (t - lastCat < CATEGORY_COOLDOWN_MS) return;

    const chosen = voice ?? VOICES[Math.floor(Math.random() * VOICES.length)]!;
    // Three variants per voice per category: bark-<voice>-<category>-<n>.
    const variant = 1 + Math.floor(Math.random() * 3);
    const id = `bark-${chosen}-${category}-${variant}`;

    this.lastBarkAt = t;
    this.lastCategoryAt.set(category, t);
    void getAudioManager().playSfx(id, { volume: 0.85 }).catch(() => {
      // Missing category: forget the cooldown so a real one can fire.
      this.lastCategoryAt.delete(category);
    });
  }
}

let instance: BarkTriggers | null = null;
/** The shared bark trigger system. */
export function getBarkTriggers(): BarkTriggers {
  if (!instance) instance = new BarkTriggers();
  return instance;
}
