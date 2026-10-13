/**
 * Tasks 731-736: the weapon catalogue.
 *
 * Five of the six weapon models in this band are not new models, they are choices
 * among models that already exist. The honest version of that is a catalogue that
 * says which staged file each variant *is*, so nobody goes hunting for a second
 * assault rifle when the pack already ships three:
 *
 * - 731 assault rifle variant 2: `weapons/ak74.glb`, alongside `m3a1.glb`.
 * - 732 sniper rifle: `m24.glb`, alongside `awm.glb`.
 * - 733 SMG variant: `mp5a5.glb`, alongside the suppressed `vss.glb`.
 * - 734 shotgun variant: `scarl.glb` -- the only shotgun in the pack, which this
 *   entry is what says.
 * - 735 pistol variant 2: `p226.glb`, alongside `m1911.glb`.
 * - 736 LMG: `axmc.glb`. *Inferred, not certain:* it is the longest weapon in the
 *   pack at a 1.2 m target, its name reads as a machine gun, and no other staged
 *   weapon could be one. If it turns out to be something else, the fix is one line
 *   here and the honest thing was to say so rather than to skip a task with an
 *   asset sitting in the folder.
 *
 * LGM, grenade, knife, baton and ceremonial sword have no staged asset, so
 * {@link WEAPON_GAPS} names them rather than pointing at the nearest available gun.
 *
 * ## Sockets come from the mesh, not from a guess
 *
 * These packs are authored with the barrel along **X** and in centimetre-scale
 * units -- the AK's authored bounds are 3.8 cm along X and 1.6 cm along Z, against a
 * manifest target length of 0.9 m. So a socket cannot be a number in metres in this
 * file; it is a *fraction of the authored bounds*, resolved against the manifest's
 * target length by {@link resolveWeaponSockets}. Inventing metres here is how a
 * muzzle flash ends up inside the receiver.
 */

import { readAuthoredBounds } from './ModelTransform.js';

/** What kind of weapon a file is. */
export type WeaponClass =
  | 'rifle'
  | 'sniper'
  | 'smg'
  | 'shotgun'
  | 'pistol'
  | 'lmg'
  | 'melee'
  | 'grenade'
  | 'launcher';

/** A socket expressed as a fraction of the authored bounding box. */
export interface SocketFractions {
  /** Where the socket sits, 0..1 on each authored axis. */
  at: { x: number; y: number; z: number };
  /** Forwards, measured from the barrel tip. */
  from?: 'front' | 'back';
  /** For the magazine: measured below the bottom of the body. */
  below?: number;
}

/** A point on a weapon where something happens: a flash, a casing, a magazine. */
export interface WeaponSocket {
  id: string;
  /** Local offset, in metres, from the weapon's origin. */
  offset: { x: number; y: number; z: number };
}

/** One weapon in the catalogue. */
export interface WeaponEntry {
  /** Stable id used by inventory, loadouts and the manifest. */
  id: string;
  /** The staged file, relative to `public/models/`, exactly as the manifest spells it. */
  file: string;
  class: WeaponClass;
  /** What this weapon is for, in one line. */
  role: string;
  /**
   * Does it feed itself? Read from the class rather than per model: the ejecting
   * behaviour in task 743 keys off this, and a shotgun loads shells one at a time.
   */
  magazineFed: boolean;
  /** Target length, from the manifest. The pack is authored at a different scale. */
  targetLengthM: number;
  /** Socket positions, as fractions of the authored bounds. */
  sockets: Readonly<Record<string, SocketFractions>>;
  /** True where the class was inferred from the asset rather than named by it. */
  inferred?: boolean;
  /** The task this entry satisfies. */
  task: number;
}

/**
 * Shared socket fractions.
 *
 * `front: 0.02` is 2% of the body back from the barrel tip -- the muzzle of every
 * gun in this catalogue, because it is one rule applied to nine files rather than
 * nine numbers nobody can check.
 */
const RIFLE_SOCKETS = {
  muzzle: { at: { x: 1, y: 0.55, z: 0.5 }, from: 'front' },
  magazine: { at: { x: 0.45, y: 0.5, z: 0.5 }, below: 0.15 },
  ejection: { at: { x: 0.55, y: 0.62, z: 0.5 } },
} as const satisfies Record<string, SocketFractions>;

/** The pistol layout: short body, magazine in the grip, nothing to the rear. */
const PISTOL_SOCKETS = {
  muzzle: { at: { x: 1, y: 0.5, z: 0.5 }, from: 'front' },
  magazine: { at: { x: 0.35, y: 0.4, z: 0.5 }, below: 0.2 },
  ejection: { at: { x: 0.4, y: 0.6, z: 0.5 } },
} as const satisfies Record<string, SocketFractions>;

/** The catalogue: all ten staged weapons. */
export const WEAPON_CATALOGUE: readonly WeaponEntry[] = [
  {
    id: 'weapon-ak74',
    file: 'weapons/ak74.glb',
    class: 'rifle',
    role: 'assault rifle variant 2',
    magazineFed: true,
    targetLengthM: 0.9,
    sockets: RIFLE_SOCKETS,
    task: 731,
  },
  {
    id: 'weapon-m3a1',
    file: 'weapons/m3a1.glb',
    class: 'rifle',
    role: 'assault rifle variant 1, bullpup',
    magazineFed: true,
    targetLengthM: 0.7,
    sockets: RIFLE_SOCKETS,
    task: 731,
  },
  {
    id: 'weapon-m24',
    file: 'weapons/m24.glb',
    class: 'sniper',
    role: 'sniper rifle',
    magazineFed: true,
    targetLengthM: 1.1,
    sockets: RIFLE_SOCKETS,
    task: 732,
  },
  {
    id: 'weapon-awm',
    file: 'weapons/awm.glb',
    class: 'sniper',
    role: 'sniper rifle, magnum',
    magazineFed: true,
    targetLengthM: 1.15,
    sockets: RIFLE_SOCKETS,
    task: 732,
  },
  {
    id: 'weapon-mp5a5',
    file: 'weapons/mp5a5.glb',
    class: 'smg',
    role: 'SMG variant',
    magazineFed: true,
    targetLengthM: 0.65,
    sockets: RIFLE_SOCKETS,
    task: 733,
  },
  {
    id: 'weapon-vss',
    file: 'weapons/vss.glb',
    class: 'smg',
    role: 'SMG variant, suppressed',
    magazineFed: true,
    targetLengthM: 1.0,
    sockets: RIFLE_SOCKETS,
    task: 733,
  },
  {
    id: 'weapon-scarl',
    file: 'weapons/scarl.glb',
    class: 'shotgun',
    role: 'shotgun variant',
    magazineFed: false,
    targetLengthM: 0.85,
    // A shotgun loads shells one at a time, so it ejects a shell and has no
    // ejection port: keeping the rifle's `ejection` here would tell task 743 to
    // throw brass out of a gun that never fired any.
    sockets: {
      muzzle: RIFLE_SOCKETS.muzzle,
      magazine: RIFLE_SOCKETS.magazine,
      shell: RIFLE_SOCKETS.ejection,
    },
    task: 734,
  },
  {
    id: 'weapon-p226',
    file: 'weapons/p226.glb',
    class: 'pistol',
    role: 'pistol variant 2',
    magazineFed: true,
    targetLengthM: 0.2,
    sockets: PISTOL_SOCKETS,
    task: 735,
  },
  {
    id: 'weapon-m1911',
    file: 'weapons/m1911.glb',
    class: 'pistol',
    role: 'pistol variant 1',
    magazineFed: true,
    targetLengthM: 0.22,
    sockets: PISTOL_SOCKETS,
    task: 735,
  },
  {
    id: 'weapon-axmc',
    file: 'weapons/axmc.glb',
    class: 'lmg',
    role: 'LMG',
    magazineFed: true,
    targetLengthM: 1.2,
    sockets: RIFLE_SOCKETS,
    inferred: true,
    task: 736,
  },
];

/** The weapon classes with no staged asset. */
export const WEAPON_GAPS: Readonly<Record<string, string>> = {
  grenade: 'no grenade GLB staged; the pack ships ten guns and nothing else',
  knife: 'no knife GLB staged',
  baton: 'no baton GLB staged',
  sword: 'no ceremonial sword GLB staged',
  sight: 'no detachable sight or grip attachment GLB staged',
};

/** A weapon by id, or null. */
export function weapon(id: string): WeaponEntry | null {
  return WEAPON_CATALOGUE.find((w) => w.id === id) ?? null;
}

/** Every weapon of a class. */
export function weaponsOfClass(weaponClass: WeaponClass): WeaponEntry[] {
  return WEAPON_CATALOGUE.filter((w) => w.class === weaponClass);
}

/** Whether the pack has this class at all. */
export function hasWeaponClass(weaponClass: WeaponClass): boolean {
  return WEAPON_CATALOGUE.some((w) => w.class === weaponClass);
}

/** The socket ids a weapon has, without needing the file. */
export function socketIds(weaponId: string): string[] {
  return Object.keys(weapon(weaponId)?.sockets ?? {});
}

/** Whether a weapon has a socket with that id. */
export function hasSocket(weaponId: string, socketId: string): boolean {
  return socketIds(weaponId).includes(socketId);
}

/** The catalogue's files, as the manifest spells them. */
export function catalogueFiles(): string[] {
  return WEAPON_CATALOGUE.map((w) => w.file).sort();
}

/** How far back from the barrel tip the muzzle sits, as a fraction of the body. */
export const MUZZLE_SETBACK = 0.02;

/** An axis-aligned box in the authored units of a file. */
export interface AuthoredBox {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/**
 * Task 741/743: resolve a weapon's sockets to metres.
 *
 * The pack is authored along X in centimetre units, so the scale comes from the
 * manifest's target length over the longest authored axis -- the same rule task 614
 * uses to auto-scale a model. A fraction of 0 along X is the muzzle; 1 is the
 * back of the stock.
 */
export function resolveWeaponSockets(
  entry: WeaponEntry,
  box: AuthoredBox,
): Record<string, WeaponSocket> {
  const sizeX = box.max.x - box.min.x;
  const sizeY = box.max.y - box.min.y;
  const sizeZ = box.max.z - box.min.z;
  const longest = Math.max(sizeX, sizeY, sizeZ);
  const scale = longest > 0 ? entry.targetLengthM / longest : 1;

  const out: Record<string, WeaponSocket> = {};
  for (const [id, fraction] of Object.entries(entry.sockets)) {
    let x = box.min.x + fraction.at.x * sizeX;
    // A socket given as a fraction 'from the front' sits 2% of the body back from
    // the tip -- a muzzle is described by how far forward it is, a magazine never is.
    if (fraction.from === 'front') x -= MUZZLE_SETBACK * sizeX;
    let y = box.min.y + fraction.at.y * sizeY;
    if (fraction.below !== undefined) y -= fraction.below * sizeY;
    const z = box.min.z + fraction.at.z * sizeZ;
    out[id] = { id, offset: { x: x * scale, y: y * scale, z: z * scale } };
  }
  return out;
}

/** The sockets of a weapon, resolved against the GLB it names. */
export function weaponSockets(entry: WeaponEntry, bytes: Uint8Array): Record<string, WeaponSocket> {
  return resolveWeaponSockets(entry, readAuthoredBounds(bytes));
}