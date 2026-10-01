/**
 * Deployment map types. The terrain half mirrors `docs/BATTLE_TERRAIN.md`
 * contract v1 exactly (field names, units, row-major north-to-south order);
 * the deployment half is Rowan's own state for the pre-battle placement UI.
 *
 * Rowan's client-lane review of the contract: the schema has everything the
 * renderer needs (heightfield + water mask + cover + spawn zones). Sign-off
 * noted to the crew on the bus; the checkbox in the doc is Hana's to tick.
 */

export const PATCH_SIZE_M = 2000;
export const PATCH_RES = 64;
export const PATCH_CELLS = PATCH_RES * PATCH_RES; // 4096
export const CONTRACT_VERSION = 1;

export type Biome =
  | "city" | "forest" | "plains" | "snow" | "river"
  | "desert" | "hills" | "swamp" | "coastal" | "industrial";

export type CoverType = "wall" | "building" | "tree" | "rock" | "vehicle";

/** Patch-local metres, ENU: x east, y north, origin at patch centre. */
export interface CoverObject {
  type: CoverType;
  x: number;
  y: number;
  height_m: number;
  radius_m: number;
  rotation_deg: number;
}

export interface SpawnRect {
  x: number;
  y: number;
  width_m: number;
  height_m: number;
}

export type ReinforcementEdge = "north" | "south" | "east" | "west";

export interface SpawnZones {
  attacker: SpawnRect;
  defender: SpawnRect;
  reinforcement_edge: ReinforcementEdge;
}

/**
 * One battle patch, wire format `dist/wire/battle/<settlement_id>.json`.
 * `preview` is true only for the locally generated stand-in used when no
 * wire file exists yet — never real data, always labelled as such in the UI.
 */
export interface BattlePatch {
  contract_version: number;
  settlement_id: string;
  biome: Biome;
  /** 4096 floats, row-major, row 0 = north edge. Metres above sea level. */
  heightfield: number[];
  /** 4096 booleans, same order. True = water, impassable to ground units. */
  water_mask: boolean[];
  cover_objects: CoverObject[];
  spawn_zones: SpawnZones;
  preview?: boolean;
}

export type UnitKind = "infantry" | "archers" | "cavalry" | "siege" | "militia";

export interface RosterUnit {
  id: string;
  label: string;
  kind: UnitKind;
  count: number;
  /** Footprint radius in metres, for collision against cover. */
  radius_m: number;
}

export interface Placement {
  unitId: string;
  /** Patch-local metres. */
  x: number;
  y: number;
}

export type InvalidReason =
  | "off the map"
  | "outside the deployment zone"
  | "in water"
  | "blocked by cover";

export interface ValidationResult {
  ok: boolean;
  reason?: InvalidReason;
}

export interface DeploymentMapOptions {
  patch: BattlePatch;
  /** The player's units available to place. */
  roster: RosterUnit[];
  /** Fired on every placement change (place, move, remove). */
  onChange?: (placements: Placement[]) => void;
  /** Called when the player confirms the deployment. */
  onConfirm?: (placements: Placement[]) => void;
  /** Called when the player closes the view without confirming. */
  onClose?: () => void;
}
