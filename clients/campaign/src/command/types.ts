/**
 * Command-experience contracts. The battle scene (milo's lane) owns the simulation
 * and the battle HUD; this module owns the *command interface* — selection and the
 * radial menu — and talks to the scene through `CommandSurface` only. Nothing here
 * reaches into simulation state.
 */

export interface CommandableUnit {
  id: string;
  label: string;
  /** e.g. "infantry", "archers", "cavalry" — display grouping only. */
  kind: string;
  /** Headcount; 0 means destroyed and unselectable. */
  count: number;
  /** Battlefield-plane coordinates. */
  x: number;
  z: number;
}

export type OrderKind =
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

export interface Order {
  kind: OrderKind;
  unitIds: string[];
  /** Where the order points, when it points somewhere. */
  target?: { x: number; z: number };
  /** Task 43: multi-leg waypoints, in order. Present on "move" orders. */
  waypoints?: { x: number; z: number }[];
  /**
   * Task 70: the shape the player asked the group to hold. Absent means "as the
   * sim's default formation has it" — the commander only states a shape when the
   * player chose one.
   */
  formation?: FormationKind;
  /**
   * Task 72: the posture the player asked the group to fight in. Absent means no
   * posture was chosen, which is different from "passive" — passive is a choice.
   */
  stance?: StanceKind;
  /**
   * Task 74: whether the group opens fire on its own. Absent leaves it to the sim,
   * which is what an order that never mentions firing should mean.
   */
  fireMode?: FireMode;
  /** Task 46: the scene's estimate of how long the order takes to arrive, ms. */
  delayMs?: number;
  /** ms since epoch, for delay visualization downstream. */
  at: number;
}

/** Task 70: the shapes a group can be ordered into. */
export type FormationKind = "line" | "column" | "wedge" | "circle";

export const FORMATION_LABEL: Record<FormationKind, string> = {
  line: "Line",
  column: "Column",
  wedge: "Wedge",
  circle: "Circle",
};

/**
 * Task 72: how eagerly the group fights. Not to be confused with `STANCE_LABEL`
 * above, which describes the last order issued — that is history, this is intent.
 */
export type StanceKind = "aggressive" | "defensive" | "passive";

/**
 * Task 74: whether the group opens fire on its own. `at-will` shoots what comes
 * into reach; `hold-fire` waits for an attack order (task 75).
 */
export type FireMode = "at-will" | "hold-fire";

export const FIRE_MODE_LABEL: Record<FireMode, string> = {
  "at-will": "Fire at will",
  "hold-fire": "Hold fire",
};

export const ORDER_LABEL: Record<OrderKind, string> = {
  attack: "Attack",
  "attack-move": "Attack-move",
  charge: "Charge",
  spread: "Spread out",
  "form-up": "Form up",
  follow: "Follow",
  hold: "Hold",
  retreat: "Retreat",
  rally: "Rally",
  move: "Move",
};

/**
 * Task 47: what the unit card shows for a unit's last known order. This is the
 * commander's view — the last order *issued* — not the sim's ground truth;
 * the panel labels it "last order" so nobody mistakes it for live telemetry.
 */
export const STANCE_LABEL: Record<OrderKind, string> = {
  attack: "advancing",
  "attack-move": "advancing, engaging",
  charge: "charging",
  spread: "spreading out",
  "form-up": "forming up",
  follow: "following",
  hold: "holding",
  retreat: "routing",
  rally: "rallying",
  move: "marching",
};

/**
 * What the commander needs from the battlefield. Implemented by the battle
 * scene when it exists; trivially faked in tests.
 */
export interface CommandSurface {
  units(): CommandableUnit[];
  /** Screen pixels -> battlefield plane. */
  screenToField(sx: number, sy: number): { x: number; z: number };
  /** Battlefield plane -> screen pixels. */
  fieldToScreen(x: number, z: number): { x: number; y: number };
  /** Element the radial menu and selection marquee render into. */
  overlay(): HTMLElement;
  /** Orders the selected units receive; the scene consumes them. */
  issueOrder(order: Order): void;
  onUnitsChanged(fn: () => void): () => void;
  /**
   * Task 48: the battlefield extents, used to aim the retreat horn at the
   * nearest friendly map edge. Optional — without it the horn issues a
   * targetless retreat and the sim resolves "rout to the map edge".
   */
  fieldBounds?(): { minX: number; maxX: number; minZ: number; maxZ: number };
  /**
   * Task 42: jump the camera to a battlefield position. Optional — without
   * it, double-tapping a control group only re-selects the group.
   */
  focusCamera?(x: number, z: number): void;
}
