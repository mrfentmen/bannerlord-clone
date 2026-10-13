/**
 * Model damage states.
 *
 * Task 618: a model that has been shot at is not just a model with a lower
 * number attached -- it looks different. Three states, and each one has a
 * consequence a scene owner can act on:
 *
 * - `intact`: untouched, fully pickable, nothing extra drawn.
 * - `damaged`: still standing, but scorched and smoking; a shot at it is still
 *   a valid order.
 * - `destroyed`: gone from the picking pool and replaced by whatever the caller
 *   puts in its place (a wreck mesh, or nothing at all).
 *
 * The state is derived from a health fraction rather than accumulated from
 * events, so two hits of 1 damage and one hit of 2 cannot disagree, and it is
 * announced only on a change: the callback is a scene write (swap materials,
 * start a smoke emitter), not a per-frame poll.
 *
 * {@link applyDamageState} writes the look onto real Babylon materials and is
 * exercised on a NullEngine, which is how the default path is proven without a
 * scene.
 */

import { Color3 } from "@babylonjs/core/Maths/math.color.js";

/** The three states a damaged model moves through. */
export type DamageState = 'intact' | 'damaged' | 'destroyed';

/** Health fractions at which a model changes state. */
export interface DamageThresholds {
  /** At or below this fraction of max health the model counts as damaged. */
  damagedAt: number;
  /** Health fraction at or below which the model is destroyed. */
  destroyedAt: number;
}

/**
 * Damaged below half health, destroyed at zero. A structure that has lost half
 * its hit points looks like it has been in a fight, which is what the player
 * needs to read at a glance.
 */
export const DEFAULT_DAMAGE_THRESHOLDS: DamageThresholds = { damagedAt: 0.5, destroyedAt: 0 };

/** What a state means for the scene. */
export interface DamageVisual {
  /** Multiplier on the model's own material colour: soot darkens it. */
  darken: number;
  /** Whether a smoke emitter should be running. */
  smoke: boolean;
  /** Whether a hit on this model can still be a fire order. */
  pickable: boolean;
  /** Whether the model should be drawn at all. */
  visible: boolean;
}

/** The look of each state. Destroyed is drawn by whatever replaces it. */
export const DAMAGE_VISUALS: Readonly<Record<DamageState, DamageVisual>> = {
  intact: { darken: 1, smoke: false, pickable: true, visible: true },
  damaged: { darken: 0.55, smoke: true, pickable: true, visible: true },
  destroyed: { darken: 0.3, smoke: false, pickable: false, visible: false },
};

/** One reported transition. */
export interface DamageEvent {
  id: string;
  from: DamageState;
  to: DamageState;
  /** Health fraction at the moment of the change. */
  healthFraction: number;
}

/** How a tracker is constructed. */
export interface DamageTrackerOptions {
  id: string;
  maxHealth?: number;
  thresholds?: Partial<DamageThresholds>;
  /** Called once per transition, never on a hit that changed nothing. */
  onStateChange?: (event: DamageEvent) => void;
}

/**
 * Health and state for one model.
 *
 * Damage below zero is clamped, so a single volley from a full-health model
 * cannot push the fraction past zero and make the state flip back. Non-finite
 * damage is ignored: a NaN from a divide-by-zero in the ballistics code should
 * not take a model out of the fight.
 */
export class DamageTracker {
  private health: number;
  private readonly maxHealth: number;
  private readonly thresholds: DamageThresholds;
  private state: DamageState = 'intact';
  private readonly onStateChange: ((event: DamageEvent) => void) | null;

  constructor(private readonly options: DamageTrackerOptions) {
    const requested = options.maxHealth ?? 1;
    this.maxHealth = Number.isFinite(requested) && requested > 0 ? requested : 1;
    this.health = this.maxHealth;
    this.thresholds = { ...DEFAULT_DAMAGE_THRESHOLDS, ...options.thresholds };
    this.onStateChange = options.onStateChange ?? null;
  }

  /** Health left, in the units `maxHealth` used. */
  getHealth(): number {
    return this.health;
  }

  /** Health as a fraction of the maximum, 0..1. */
  getHealthFraction(): number {
    return this.health / this.maxHealth;
  }

  /** The current state. */
  getState(): DamageState {
    return this.state;
  }

  /**
   * Applies `amount` of damage and returns the state afterwards. The callback
   * fires only when the state actually moved, so a hit that lands on an already
   * damaged model costs one subtraction and nothing else.
   */
  applyDamage(amount: number): DamageState {
    if (!Number.isFinite(amount) || amount <= 0) return this.state;
    this.health = Math.max(0, this.health - amount);
    const next = this.stateForFraction(this.getHealthFraction());
    if (next !== this.state) {
      const event: DamageEvent = {
        id: this.options.id,
        from: this.state,
        to: next,
        healthFraction: this.getHealthFraction(),
      };
      this.state = next;
      this.onStateChange?.(event);
    }
    return this.state;
  }

  /** Restores health, e.g. a repair between battles. */
  heal(amount: number): DamageState {
    if (!Number.isFinite(amount) || amount <= 0) return this.state;
    this.health = Math.min(this.maxHealth, this.health + amount);
    const next = this.stateForFraction(this.getHealthFraction());
    if (next !== this.state) {
      const event: DamageEvent = {
        id: this.options.id,
        from: this.state,
        to: next,
        healthFraction: this.getHealthFraction(),
      };
      this.state = next;
      this.onStateChange?.(event);
    }
    return this.state;
  }

  /** The state a health fraction maps to, thresholds applied in order. */
  stateForFraction(fraction: number): DamageState {
    if (!Number.isFinite(fraction)) return this.state;
    if (fraction <= this.thresholds.destroyedAt) return 'destroyed';
    if (fraction <= this.thresholds.damagedAt) return 'damaged';
    return 'intact';
  }
}

/** The part of a material this module writes; a StandardMaterial satisfies it. */
export interface TintableMaterial {
  diffuseColor: Color3;
  emissiveColor?: Color3;
}

/**
 * Task 618: soots a material according to the state.
 *
 * The colour is scaled in place rather than replaced, so a model that was
 * already tinted by a faction or a camouflage keeps its hue and only loses
 * brightness. Soot is a slight warm grey rather than pure black: a black model
 * at dusk is indistinguishable from a shadow.
 */
export function applyDamageStateToMaterial(
  material: TintableMaterial,
  state: DamageState,
  soot: Color3 = new Color3(0.28, 0.24, 0.22),
): void {
  const { darken } = DAMAGE_VISUALS[state];
  const base = material.diffuseColor;
  // `base` is the colour as loaded; scaling by a fraction of the soot colour
  // moves it toward soot without darkening past black.
  material.diffuseColor = new Color3(
    base.r * darken + soot.r * (1 - darken),
    base.g * darken + soot.g * (1 - darken),
    base.b * darken + soot.b * (1 - darken),
  );
}