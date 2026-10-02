/**
 * Keyboard shortcuts reference panel (Rowan solo task 11).
 *
 * Read-only reference of every rebindable action and its current binding,
 * grouped by category. Rebinding itself stays in the keybinding editor;
 * this panel is the quick "what are the keys?" answer.
 */

import type { InputRegistry } from "../../input/registry.js";
import type { ActionCategory, KeyBinding } from "../../input/actions.js";
import { h } from "../dom.js";

const CATEGORY_LABELS: Record<ActionCategory, string> = {
  interface: "Interface",
  "campaign-map": "Campaign map",
  "battle-command": "Battle command",
};

export function formatBinding(binding: KeyBinding): string {
  const parts: string[] = [];
  if (binding.ctrl) parts.push("Ctrl");
  if (binding.shift) parts.push("Shift");
  if (binding.alt) parts.push("Alt");
  parts.push(binding.key === " " ? "Space" : binding.key);
  return parts.join("+");
}

export interface ShortcutsReferenceOptions {
  registry: InputRegistry;
  onClose: () => void;
}

export function shortcutsReference(options: ShortcutsReferenceOptions): HTMLElement {
  const { registry } = options;
  const root = h(
    "div",
    { class: "shortcuts", role: "dialog", "aria-label": "Keyboard shortcuts", "data-testid": "shortcuts-panel" },
    h("h2", {}, "Keyboard shortcuts"),
  );
  const categories = ["interface", "campaign-map", "battle-command"] as const;
  for (const category of categories) {
    const actions = registry.actions().filter((a) => a.category === category);
    if (actions.length === 0) continue;
    const section = h("section", { "data-testid": `shortcuts-section-${category}` });
    section.appendChild(h("h3", {}, CATEGORY_LABELS[category]));
    const list = h("dl", { class: "shortcuts__list" });
    for (const action of actions) {
      const bindings = registry.bindingFor(action.id);
      const term = h("dt", { "data-testid": `shortcut-label-${action.id}` }, action.label);
      const def = h(
        "dd",
        { "data-testid": `shortcut-binding-${action.id}` },
        bindings.length > 0 ? bindings.map(formatBinding).join(" / ") : "Unbound",
      );
      list.appendChild(term);
      list.appendChild(def);
    }
    section.appendChild(list);
    root.appendChild(section);
  }
  const close = h("button", { type: "button", class: "btn", "data-testid": "shortcuts-close" }, "Close");
  close.addEventListener("click", () => options.onClose());
  root.appendChild(close);
  return root;
}
