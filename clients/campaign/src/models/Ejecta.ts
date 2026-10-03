/**
 * Task 743: shell casings ejecting.
 *
 * What this owns is the part that is a decision rather than a physics call: which
 * weapon throws what, out of which socket, in which direction, and how it lands.
 * The bounce is the physics lane's; this hands it a starting state it can trust.
 *
 * The interesting detail is that the answer differs by weapon. A rifle throws a
 * brass case out of the right-hand side, forward and up, and it spins. A shotgun
 * throws a spent shell out of the same side with a lot more energy in it. A pistol
 * throws brass up and back over the slide -- and a pistol with the slide locked
 * back is the one that throws it *sideways and down*, which is why the direction
 * here is per-weapon and not one constant for everything.
 */

import { WEAPON_CATALOGUE, weaponSockets, type WeaponClass, type WeaponEntry } from './WeaponCatalogue.js';

/** What gets thrown. */
export type EjectaKind = 'case' | 'shell';

/** How a weapon's spent cases come out. */
export interface EjectaProfile {
  kind: EjectaKind;
  /** Direction, in the weapon's local space, as a unit-ish vector. */
  direction: { x: number; y: number; z: number };
  /** Metres per second it leaves the gun at. */
  speed: number;
  /** Revolutions per second about its own axis. */
  spin: number;
  /** Metres. */
  sizeM: number;
  /** Whether it keeps its own mesh, for a renderer that wants one. */
  hasMesh: boolean;
}

/**
 * Ejecta profiles by weapon class.
 *
 * The pistol's downward side vector is deliberate: a slide locked back throws the
 * case off to the right, and an upward one looks like the gun is spitting at the
 * shooter's face. It is the kind of detail that only matters until someone watches
 * a firefight, at which point it is the only detail anybody notices.
 */
export const EJECTA_PROFILES: Readonly<Record<WeaponClass, EjectaProfile>> = {
  rifle: { kind: 'case', direction: { x: 1, y: 0.6, z: 0.25 }, speed: 2.8, spin: 32, sizeM: 0.009, hasMesh: false },
  sniper: { kind: 'case', direction: { x: 1, y: 0.5, z: 0.2 }, speed: 2.6, spin: 28, sizeM: 0.011, hasMesh: true },
  smg: { kind: 'case', direction: { x: 1, y: 0.45, z: 0.15 }, speed: 2.2, spin: 34, sizeM: 0.008, hasMesh: false },
  shotgun: { kind: 'shell', direction: { x: 1, y: 0.35, z: -0.1 }, speed: 3.4, spin: 12, sizeM: 0.021, hasMesh: true },
  pistol: { kind: 'case', direction: { x: 1, y: -0.2, z: -0.1 }, speed: 2.0, spin: 40, sizeM: 0.008, hasMesh: false },
  lmg: { kind: 'case', direction: { x: 1, y: 0.35, z: 0.1 }, speed: 2.4, spin: 22, sizeM: 0.013, hasMesh: true },
  melee: { kind: 'case', direction: { x: 0, y: 0, z: 0 }, speed: 0, spin: 0, sizeM: 0, hasMesh: false },
  grenade: { kind: 'shell', direction: { x: 0, y: 0, z: 0 }, speed: 0, spin: 0, sizeM: 0, hasMesh: false },
  launcher: { kind: 'shell', direction: { x: 0, y: 0, z: 0 }, speed: 0, spin: 0, sizeM: 0, hasMesh: false },
};

/** A case in the air. */
export interface Ejected {
  id: number;
  kind: EjectaKind;
  /** Where it left the gun, in the weapon's local space. */
  origin: { x: number; y: number; z: number };
  /** Metres per second, already along the profile's direction. */
  velocity: { x: number; y: number; z: number };
  /** Revolutions per second. */
  spin: number;
  /** Seconds since it was thrown. */
  ageS: number;
  /** Metres. */
  sizeM: number;
  /** Whether a renderer should draw a mesh for it. */
  hasMesh: boolean;
}

/** The ejecta profile for a weapon's class. */
export function ejectaProfileFor(entry: WeaponEntry): EjectaProfile {
  return EJECTA_PROFILES[entry.class];
}

/**
 * What a weapon ejects, and out of which socket.
 *
 * Returns null when the weapon ejects nothing. A shell-ejecting weapon uses its
 * `shell` socket and a case-ejecting one its `ejection` socket, so the shotgun
 * does not need a second rule about which hole the brass comes out of.
 */
export function ejectionSocketIdFor(entry: WeaponEntry): string | null {
  const profile = ejectaProfileFor(entry);
  if (profile.speed <= 0) return null;
  return profile.kind === 'shell' ? 'shell' : 'ejection';
}

/** A fixed pool of spent cases. */
export class EjectaPool {
  private readonly live = new Map<number, Ejected>();
  private nextId = 0;

  constructor(readonly capacity: number = 48) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`ejecta pool needs a positive capacity, got ${capacity}`);
    }
  }

  /** How many are in the air. */
  get size(): number {
    return this.live.size;
  }

  /**
   * Throws one.
   *
   * Returns null when the weapon does not eject anything, when it has no ejection
   * socket, or when the weapon is not staged -- a rifle with no ejection port is a
   * rifle that keeps its brass, and that is a modelling fact worth surfacing
   * rather than a reason to throw brass out of the origin.
   */
  eject(weaponId: string, weaponBytes: Uint8Array): Ejected | null {
    const entry = WEAPON_CATALOGUE.find((w) => w.id === weaponId);
    if (!entry) return null;
    const profile = ejectaProfileFor(entry);
    const socketId = ejectionSocketIdFor(entry);
    if (!socketId || profile.speed <= 0) return null;
    const socket = weaponSockets(entry, weaponBytes)[socketId];
    if (!socket) return null;

    const reused = this.size >= this.capacity;
    let id = this.nextId;
    if (reused) {
      id = [...this.live.entries()].sort((a, b) => a[1].ageS - b[1].ageS)[0]?.[0] ?? 0;
    } else {
      this.nextId = (this.nextId + 1) % this.capacity;
    }

    this.live.set(id, {
      id,
      kind: profile.kind,
      origin: { ...socket.offset },
      velocity: {
        x: profile.direction.x * profile.speed,
        y: profile.direction.y * profile.speed,
        z: profile.direction.z * profile.speed,
      },
      spin: profile.spin,
      ageS: 0,
      sizeM: profile.sizeM,
      hasMesh: profile.hasMesh,
    });
    return this.live.get(id) as Ejected;
  }

  /** Ages the cases; the bounce and the rest are the physics lane's business. */
  update(dtS: number): void {
    if (!Number.isFinite(dtS) || dtS < 0) return;
    for (const ejected of this.live.values()) {
      ejected.ageS += dtS;
    }
  }

  /** The cases in the air, oldest first. */
  cases(): Ejected[] {
    return [...this.live.values()].sort((a, b) => b.ageS - a.ageS);
  }

  /** Removes one, which is what a physics bounce callback would do. */
  remove(id: number): boolean {
    return this.live.delete(id);
  }

  /** Empties the pool. */
  clear(): void {
    this.live.clear();
  }
}