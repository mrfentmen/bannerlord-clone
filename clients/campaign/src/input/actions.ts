/**
 * The input action catalog: every gameplay action the client can perform, in one
 * place, with its default bindings.
 *
 * Nothing outside `src/input/` reads `KeyboardEvent.key` for gameplay. Widgets keep
 * their own local key handling only for text-field and roving-tabindex behaviour;
 * anything that *does* something in the game is an action here.
 *
 * Actions are stable string ids. Battle modules register their own actions at load
 * through the registry; this file holds the actions that exist from boot.
 */

/** One keyboard chord: a primary key plus optional modifiers. `key` is the
 *  `KeyboardEvent.key` value, so `"Escape"`, `"Tab"`, `"ArrowLeft"`, `"a"`, `"1"`. */
export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export type ActionCategory = "interface" | "campaign-map" | "battle-command";

/** The ids the catalog declares at boot. Modules add more at runtime. */
export type InputActionId =
  // -- interface ------------------------------------------------------------
  | "ui.cancel"
  | "ui.confirm"
  | "ui.settings"
  // -- campaign map ----------------------------------------------------------
  | "map.panUp"
  | "map.panDown"
  | "map.panLeft"
  | "map.panRight"
  | "map.zoomIn"
  | "map.zoomOut"
  | "map.nextSettlement"
  | "map.prevSettlement"
  // -- battle command --------------------------------------------------------
  | "battle.commandMenu"
  | "battle.orderAttack"
  | "battle.orderHold"
  | "battle.orderFollow"
  | "battle.orderRetreat"
  | "battle.selectAll"
  | "battle.ping"
  | "battle.setRallyPoint"
  | "battle.retreatHorn";

export interface ActionDef {
  /**
   * Stable string id. The catalog below owns the ids it declares; modules add
   * their own through `registerAction` (e.g. `"battle.setControlGroup1"`).
   */
  id: string;
  /** Short label for the keybinding editor, e.g. "Close panel / cancel". */
  label: string;
  category: ActionCategory;
  /** One line for the editor's detail view. */
  description: string;
  defaultKeys: KeyBinding[];
  /**
   * Standard gamepad button indices (0 = A/cross, 1 = B/circle, ...). The gamepad
   * layer maps these; the registry only records them.
   */
  gamepad?: number[];
  /**
   * When true the registry calls `preventDefault()` on the keyboard event it
   * consumed. Set for keys whose browser default would fight the game (Tab moving
   * focus, arrows scrolling). Escape must NOT preventDefault: it has to keep
   * working in text fields and dialogs.
   */
  preventDefault?: boolean;
}

function def(
  id: InputActionId,
  label: string,
  category: ActionCategory,
  description: string,
  defaultKeys: KeyBinding[],
  extra?: Partial<Pick<ActionDef, "gamepad" | "preventDefault">>,
): ActionDef {
  return { id, label, category, description, defaultKeys, ...extra };
}

/**
 * Every action the client knows at boot. Battle modules add theirs through
 * `InputRegistry.registerAction`; nothing here is the closed set.
 */
export const ACTION_DEFS: readonly ActionDef[] = [
  def("ui.cancel", "Close panel / cancel", "interface",
    "Closes the open panel, dialog, or radial menu. Never steals typing.", [{ key: "Escape" }],
    { gamepad: [1] }),
  def("ui.confirm", "Confirm", "interface",
    "Accepts the focused choice or dialog.", [{ key: "Enter" }],
    { gamepad: [0] }),
  def("ui.settings", "Open settings", "interface",
    "Opens the settings panel. Unbound by default — assign a key in the keybinding editor.",
    []),

  def("map.panUp", "Pan map up", "campaign-map",
    "Moves the campaign camera north.", [{ key: "ArrowUp" }, { key: "w" }],
    { preventDefault: true }),
  def("map.panDown", "Pan map down", "campaign-map",
    "Moves the campaign camera south.", [{ key: "ArrowDown" }, { key: "s" }],
    { preventDefault: true }),
  def("map.panLeft", "Pan map left", "campaign-map",
    "Moves the campaign camera west.", [{ key: "ArrowLeft" }, { key: "a" }],
    { preventDefault: true }),
  def("map.panRight", "Pan map right", "campaign-map",
    "Moves the campaign camera east.", [{ key: "ArrowRight" }, { key: "d" }],
    { preventDefault: true }),
  def("map.zoomIn", "Zoom in", "campaign-map",
    "Zooms the campaign camera closer.", [{ key: "=", }, { key: "+", shift: true }]),
  def("map.zoomOut", "Zoom out", "campaign-map",
    "Zooms the campaign camera farther.", [{ key: "-" }, { key: "_" , shift: true }]),
  def("map.nextSettlement", "Next settlement", "campaign-map",
    "Selects the next settlement. Only fires while the map has keyboard focus, so Tab keeps working in panels.",
    [{ key: "Tab" }], { preventDefault: true }),
  def("map.prevSettlement", "Previous settlement", "campaign-map",
    "Selects the previous settlement. Same focus rule as next.",
    [{ key: "Tab", shift: true }], { preventDefault: true }),

  def("battle.commandMenu", "Command radial menu (hold)", "battle-command",
    "Hold to open the radial order menu, flick to issue the order.", [{ key: " " }],
    { gamepad: [4] }),
  def("battle.orderAttack", "Order: attack", "battle-command",
    "Selected units attack the target.", [{ key: "f" }, { key: "F1" }],
    { preventDefault: true }),
  def("battle.orderHold", "Order: hold position", "battle-command",
    "Selected units hold where they stand.", [{ key: "h" }, { key: "F3" }],
    { preventDefault: true }),
  def("battle.orderFollow", "Order: follow", "battle-command",
    "Selected units follow the target.", [{ key: "g" }, { key: "F2" }],
    { preventDefault: true }),
  def("battle.orderRetreat", "Order: retreat", "battle-command",
    "Selected units break for the map edge.", [{ key: "r" }, { key: "F4" }],
    { preventDefault: true }),
  def("battle.setRallyPoint", "Set rally point", "battle-command",
    "Reinforcements gather where you next click.", [{ key: "t" }]),
  def("battle.retreatHorn", "Sound the retreat horn", "battle-command",
    "Every live unit routs to the map edge. One order, no take-backs.", [{ key: "x" }]),
  def("battle.selectAll", "Select all units", "battle-command",
    "Selects every unit under your command.", [{ key: "a", ctrl: true }]),
  def("battle.ping", "Ping the map", "battle-command",
    "Drops a visible marker where you point.", [{ key: "q", alt: true }]),
];

/** Look up a catalog entry by id. Throws for unknown ids: a typo'd action id is a
 *  bug, and it should fail loudly at registration time rather than silently at
 *  key-press time. */
export function actionDef(id: InputActionId): ActionDef {
  const found = ACTION_DEFS.find((d) => d.id === id);
  if (!found) throw new Error(`[input] unknown action id: ${id}`);
  return found;
}
