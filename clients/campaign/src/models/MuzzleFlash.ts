/**
 * Task 741: muzzle flash.
 *
 * A flash is a thing that happens *at the muzzle of a specific weapon*, so the two
 * halves have to come from the same place: how big and how long it burns comes
 * from the weapon class, and where it appears comes from the socket task 731
 * resolved out of that weapon's own authored bounds. A flash profile with its own
 * hardcoded position is how a flash ends up inside the receiver on the ninth
 * weapon nobody tested.
 *
 * This module owns placement and lifetime. The glow and the geometry are the
 * renderer's job, and this does not pretend otherwise -- what it does own is the
 * part that goes wrong quietly: the seat, the scale, the lifetime, and the fact
 * that two shots in the same frame get two flashes rather than one.
 */

import { WEAPON_CATALOGUE, weaponSockets, type WeaponClass, type WeaponEntry } from './WeaponCatalogue.js';

/** How a weapon's flash looks and lasts. */
export interface FlashProfile {
  /** Size as a fraction of the weapon's length. */
  size: number;
  /** How long it burns, in seconds. */
  durationS: number;
  /** 0 = a cool white spark, 1 = deep orange muzzle smoke. */
  heat: number;
  /** Does it smoke after the flash. */
  smoke: boolean;
}

/**
 * Flash profiles by weapon class.
 *
 * Rounds differ: a rifle flash is a short cone, a shotgun's is a wide puff that
 * hangs, and a pistol's is brief and small because the gun is. Values are
 * fractions of the weapon's own length so nothing has to be re-tuned per model.
 */
export const FLASH_PROFILES: Readonly<Record<WeaponClass, FlashProfile>> = {
  rifle: { size: 0.11, durationS: 0.045, heat: 0.55, smoke: false },
  sniper: { size: 0.14, durationS: 0.06, heat: 0.6, smoke: false },
  smg: { size: 0.09, durationS: 0.04, heat: 0.5, smoke: false },
  shotgun: { size: 0.16, durationS: 0.11, heat: 0.75, smoke: true },
  pistol: { size: 0.13, durationS: 0.04, heat: 0.5, smoke: false },
  lmg: { size: 0.13, durationS: 0.07, heat: 0.7, smoke: true },
  melee: { size: 0, durationS: 0, heat: 0, smoke: false },
  grenade: { size: 0.18, durationS: 0.14, heat: 0.8, smoke: true },
  launcher: { size: 0.2, durationS: 0.12, heat: 0.75, smoke: true },
};

/** A flash that is burning, or waiting to. */
export interface LiveFlash {
  /** Pool slot, so a renderer can bind an instance. */
  id: number;
  /** Where it sits, in the weapon's local space. */
  offset: { x: number; y: number; z: number };
  /** Its size, in metres. */
  sizeM: number;
  /** Seconds since it was fired. */
  ageS: number;
  /** How long it burns. */
  durationS: number;
  /** 0..1 through its life, for a renderer to fade by. */
  life: number;
  /** 0 = white-hot, 1 = spent. */
  heat: number;
}

/** The flash profile for a weapon's class. */
export function flashProfileFor(entry: WeaponEntry): FlashProfile {
  return FLASH_PROFILES[entry.class];
}

/**
 * A fixed pool of flashes.
 *
 * Fixed size on purpose: a rifle at 600 rpm and a shotgun in a crowd can both ask
 * for more flashes at once than are useful, and a pool that grows under load is a
 * frame-time spike exactly when the frame is already busy. When it is full the
 * oldest flash is reused -- burning twice as long is invisible, allocating on the
 * render thread is not.
 */
export class MuzzleFlashPool {
  private readonly live = new Map<number, LiveFlash>();
  private nextId = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`muzzle flash pool needs a positive capacity, got ${capacity}`);
    }
  }

  /** How many flashes are burning. */
  get size(): number {
    return this.live.size;
  }

  /**
   * Fires a flash at a weapon's muzzle.
   *
   * Returns null when the weapon has no muzzle or no flash profile -- a melee
   * weapon and a file that never named a barrel should not get a flash, and saying
   * so is better than a flash at the origin.
   */
  fire(weaponId: string, bytes: Uint8Array): LiveFlash | null {
    const entry = WEAPON_CATALOGUE.find((w) => w.id === weaponId);
    if (!entry) return null;
    const profile = flashProfileFor(entry);
    if (profile.durationS <= 0) return null;
    const muzzle = weaponSockets(entry, bytes).muzzle;
    if (!muzzle) return null;

    const reused = this.size >= this.capacity;
    let id = this.nextId;
    if (reused) {
      // Take the oldest slot rather than dropping the shot: the flash belongs to
      // the cartridge that is already gone, and a missing flash reads as a miss.
      id = [...this.live.keys()].sort((a, b) => ageOf(this.live.get(a)) - ageOf(this.live.get(b)))[0] ?? 0;
    } else {
      this.nextId = (this.nextId + 1) % this.capacity;
    }

    const flash: LiveFlash = {
      id,
      offset: { ...muzzle.offset },
      sizeM: profile.size * entry.targetLengthM,
      ageS: 0,
      durationS: profile.durationS,
      life: 0,
      heat: profile.heat,
    };
    this.live.set(id, flash);
    return flash;
  }

  /** Ages every flash by `dtS` and drops the ones that have burned out. */
  update(dtS: number): void {
    if (!Number.isFinite(dtS) || dtS < 0) return;
    for (const [id, flash] of this.live) {
      flash.ageS += dtS;
      flash.life = flash.durationS > 0 ? Math.min(1, flash.ageS / flash.durationS) : 1;
      if (flash.life >= 1) this.live.delete(id);
    }
  }

  /** The flashes currently burning, oldest first. */
  flashes(): LiveFlash[] {
    return [...this.live.values()].sort((a, b) => ageOf(b) - ageOf(a));
  }

  /** Empties the pool. */
  clear(): void {
    this.live.clear();
  }
}

function ageOf(flash: LiveFlash | undefined): number {
  return flash ? flash.ageS : 0;
}