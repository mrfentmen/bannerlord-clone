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

export type OrderKind = "attack" | "follow" | "hold" | "retreat" | "rally";

export interface Order {
  kind: OrderKind;
  unitIds: string[];
  /** Where the order points, when it points somewhere. */
  target?: { x: number; z: number };
  /** ms since epoch, for delay visualization downstream. */
  at: number;
}

export const ORDER_LABEL: Record<OrderKind, string> = {
  attack: "Attack",
  follow: "Follow",
  hold: "Hold",
  retreat: "Retreat",
  rally: "Rally",
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
}
