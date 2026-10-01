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

export type OrderKind = "attack" | "follow" | "hold" | "retreat" | "rally" | "move";

export interface Order {
  kind: OrderKind;
  unitIds: string[];
  /** Where the order points, when it points somewhere. */
  target?: { x: number; z: number };
  /** Task 43: multi-leg waypoints, in order. Present on "move" orders. */
  waypoints?: { x: number; z: number }[];
  /** Task 46: the scene's estimate of how long the order takes to arrive, ms. */
  delayMs?: number;
  /** ms since epoch, for delay visualization downstream. */
  at: number;
}

export const ORDER_LABEL: Record<OrderKind, string> = {
  attack: "Attack",
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
}
