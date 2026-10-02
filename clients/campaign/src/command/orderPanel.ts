/**
 * The order panel (Buffy task 59): a bottom row of buttons, one per order the
 * commander can issue. Clicking a button presses the same input action its
 * hotkey does, so the panel adds no second way to order anything — it is the
 * mouse route into the one path that already exists.
 *
 * The row is data: `ORDER_BUTTONS` names the actions in the order they read
 * best (what to hit, then where to stand), and later command widgets append to
 * the same toolbar rather than growing their own bar.
 *
 * Task 60: every button carries the registry's own description for that action
 * as a tooltip, so the explanation of an order lives with the action rather
 * than being written out twice here.
 *
 * Task 61: each button also shows the hotkey that issues its order, read from
 * the registry's *current* binding and refreshed when the player rebinds, so
 * the chip is never a lie about which key to press.
 */

import "./orderPanel.css";
import { h } from "../ui/dom.js";
import { formatBinding } from "../ui/panels/ShortcutsReference.js";
import type { InputRegistry } from "../input/index.js";

/** One button: the action it presses and the label the player reads. */
export interface OrderButtonSpec {
  /** Input action id, as the commander registers it. */
  action: string;
  label: string;
  /** Test hook; stable even if the action id is renamed. */
  testId: string;
}

/**
 * The buttons, in reading order: the orders that pick a target first (they need
 * the pointer), then the ones about how the selection stands.
 */
export const ORDER_BUTTONS: readonly OrderButtonSpec[] = [
  { action: "battle.orderAttack", label: "Attack", testId: "cmd-order-attack" },
  { action: "battle.orderAttackMove", label: "Attack-move", testId: "cmd-order-attack-move" },
  { action: "battle.orderCharge", label: "Charge", testId: "cmd-order-charge" },
  { action: "battle.orderFollow", label: "Follow", testId: "cmd-order-follow" },
  { action: "battle.orderHold", label: "Hold", testId: "cmd-order-hold" },
  { action: "battle.orderSpread", label: "Spread out", testId: "cmd-order-spread" },
  { action: "battle.orderFormUp", label: "Form up", testId: "cmd-order-form-up" },
  { action: "battle.orderRetreat", label: "Retreat", testId: "cmd-order-retreat" },
];

export interface OrderPanelOptions {
  /** The registry the buttons dispatch through. */
  registry: InputRegistry;
  /** Defaults to `ORDER_BUTTONS`. */
  buttons?: readonly OrderButtonSpec[];
  /** Called after the action is dispatched, for a host that wants to know. */
  onPress?: (action: string) => void;
}

export interface OrderPanel {
  root: HTMLElement;
  /**
   * An empty strip inside the row. Task 70 hangs the formation selector here, so
   * command widgets stack in one place instead of each anchoring itself.
   */
  slot: HTMLElement;
  /** The buttons, in panel order — the later hotkey task decorates them. */
  buttons(): HTMLButtonElement[];
  /** Nothing selected means nothing to order: the row goes disabled. */
  setEnabled(enabled: boolean): void;
  destroy(): void;
}

export function createOrderPanel(options: OrderPanelOptions): OrderPanel {
  const { registry, onPress } = options;
  const row: HTMLButtonElement[] = [];
  /** The chip each button owns, so a rebind can be written back into it. */
  const keys: { chip: HTMLElement; action: string }[] = [];
  /** Actions the registry knows at build time; `bindingFor` throws otherwise. */
  const registered = new Set<string>();

  const root = h("div", {
    class: "cmd-orders",
    role: "toolbar",
    "aria-label": "Orders",
    "data-testid": "cmd-orderpanel",
  });

  for (const spec of options.buttons ?? ORDER_BUTTONS) {
    const known = registry.actions().find((a) => a.id === spec.action);
    const hint = known ? `${known.label}. ${known.description}` : spec.label;
    const btn = h("button", {
      type: "button",
      class: "cmd-order",
      "data-action": spec.action,
      "data-testid": spec.testId,
      // Task 60: the tooltip. `title` is what the platform shows on hover, and
      // the same sentence is the button's accessible description via aria-describedby.
      title: hint,
      "aria-describedby": `${spec.testId}-hint`,
    }) as HTMLButtonElement;
    btn.appendChild(h("span", { class: "cmd-order__label" }, spec.label));
    // The same sentence as text, so the explanation is reachable without hover.
    btn.appendChild(h("span", { class: "cmd-order__hint", id: `${spec.testId}-hint` }, hint));
    // Task 61: the hotkey chip. An unknown action has no bindings, and an
    // unbound action says so rather than showing an empty chip.
    const chip = h("kbd", {
      class: "cmd-order__key",
      "data-testid": `${spec.testId}-key`,
    });
    btn.appendChild(chip);
    keys.push({ chip, action: spec.action });
    if (known) registered.add(spec.action);
    btn.addEventListener("click", () => {
      // A pointer activation carries no KeyboardEvent, so the action is
      // dispatched as "touch" — the registry's pointer-and-mouse source.
      registry.dispatch(spec.action, "touch");
      onPress?.(spec.action);
    });
    root.appendChild(btn);
    row.push(btn);
  }
  const slot = h("div", { class: "cmd-orders__slot", "data-testid": "cmd-orderpanel-slot" });
  root.appendChild(slot);

  function hotkeyText(action: string): string {
    const bindings = registered.has(action) ? registry.bindingFor(action) : [];
    return bindings.length === 0 ? "unbound" : bindings.map(formatBinding).join(" / ");
  }

  function refreshKeys(): void {
    for (const { chip, action } of keys) chip.textContent = hotkeyText(action);
  }
  refreshKeys();
  const offBindings = registry.onBindingsChanged(refreshKeys);

  function setEnabled(enabled: boolean): void {
    root.hidden = !enabled;
    for (const btn of row) btn.disabled = !enabled;
  }
  setEnabled(false); // nothing selected yet

  return {
    root,
    slot,
    buttons: () => [...row],
    setEnabled,
    destroy() {
      offBindings();
      root.remove();
    },
  };
}