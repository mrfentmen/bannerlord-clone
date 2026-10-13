/**
 * The keybinding editor: click a chord, press a key, done.
 *
 * Every gameplay action the input registry knows is listed with its current
 * chords. Rebinding is click-to-capture: the registry suspends while capturing so
 * the key being bound never fires its old action mid-capture. Conflicts are shown
 * inline rather than blocked — two actions sharing a chord both still fire, which
 * is visible and fixable, where silently dropping one would not be.
 */

import { h, liveRegion, announce } from "../dom.js";
import { panel } from "../kit.js";
import { input } from "../../input/index.js";
import type { ActionDef, KeyBinding } from "../../input/actions.js";

const CATEGORY_LABEL: Record<ActionDef["category"], string> = {
  interface: "Interface",
  "campaign-map": "Campaign map",
  "battle-command": "Battle command",
  player: "On foot / driving",
};

const MAX_CHORDS = 3;

function keyLabel(key: string): string {
  switch (key) {
    case " ":
      return "Space";
    case "Escape":
      return "Esc";
    case "ArrowLeft":
      return "←";
    case "ArrowRight":
      return "→";
    case "ArrowUp":
      return "↑";
    case "ArrowDown":
      return "↓";
    case "Tab":
      return "Tab";
    case "Enter":
      return "Enter";
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
}

/** "Ctrl+Shift+S", "Esc", "←" — the chip text. */
export function chordLabel(chord: KeyBinding): string {
  const parts: string[] = [];
  if (chord.ctrl) parts.push("Ctrl");
  if (chord.alt) parts.push("Alt");
  if (chord.shift) parts.push("Shift");
  parts.push(keyLabel(chord.key));
  return parts.join("+");
}

/** Every chord claimed by more than one action, for inline conflict warnings. */
function findConflicts(): Map<string, string[]> {
  const byChord = new Map<string, ActionDef[]>();
  for (const def of input.actions()) {
    for (const chord of input.bindingFor(def.id)) {
      const sig = chordLabel(chord);
      const list = byChord.get(sig) ?? [];
      if (!list.includes(def)) list.push(def);
      byChord.set(sig, list);
    }
  }
  const sets = new Map<string, Set<string>>();
  for (const list of byChord.values()) {
    if (list.length < 2) continue;
    for (const def of list) {
      const labels = sets.get(def.id) ?? new Set<string>();
      for (const other of list) {
        if (other.id !== def.id) labels.add(other.label);
      }
      sets.set(def.id, labels);
    }
  }
  return new Map([...sets].map(([id, labels]) => [id, [...labels]] as [string, string[]]));
}

export function keybindingEditor(options: { onClose: () => void; onRebind?: (actionId: string, category: string) => void }): HTMLElement {
  const { root, body } = panel({
    title: "Controls",
    testId: "keybinding-editor",
    onClose: options.onClose,
    actions: h(
      "button",
      { type: "button", class: "btn btn--quiet", "data-testid": "bindings-reset-all" },
      "Reset all",
    ),
  });

  const live = liveRegion();
  body.appendChild(live);
  body.appendChild(
    h(
      "p",
      { class: "caption", style: "margin:0 0 var(--space-3)" },
      "Select a key, then press the new one. Escape cancels without changing anything.",
    ),
  );

  const list = h("div", { class: "stack", "data-testid": "bindings-list" });
  body.appendChild(list);

  // -- capture state ----------------------------------------------------------
  interface Capture {
    actionId: string;
    /** Chord index to replace, or null to append. */
    index: number | null;
  }
  let capturing: Capture | null = null;

  /**
   * Offered swap after a rebind created a conflict: the action that was just
   * rebound keeps the new chord; each conflicting action gets the replaced
   * chord in exchange (or simply loses the chord if the rebind appended).
   */
  interface SwapOffer {
    actionId: string;
    chord: KeyBinding;
    replaced: KeyBinding | null;
    otherIds: string[];
  }
  let swapOffer: SwapOffer | null = null;

  const isModifierKey = (key: string): boolean =>
    key === "Control" || key === "Shift" || key === "Alt" || key === "Meta";

  function endCapture(): void {
    capturing = null;
    input.resume();
    render();
  }

  function beginCapture(actionId: string, index: number | null): void {
    if (capturing) return;
    capturing = { actionId, index };
    swapOffer = null; // a fresh rebind supersedes any pending swap offer
    input.suspend(); // the key being bound must not fire its old action mid-capture
    render();
    const def = input.actions().find((d) => d.id === actionId);
    announce(live, `Press a key for ${def?.label ?? actionId}, or Escape to cancel.`);

    const onKey = (ev: KeyboardEvent): void => {
      if (isModifierKey(ev.key)) return; // still composing the chord; keep waiting
      ev.preventDefault();
      ev.stopPropagation();
      window.removeEventListener("keydown", onKey, true);
      if (ev.key === "Escape") {
        endCapture();
        announce(live, "Rebind cancelled.");
        return;
      }
      const chord: KeyBinding = {
        key: ev.key,
        ...(ev.ctrlKey ? { ctrl: true } : {}),
        ...(ev.shiftKey ? { shift: true } : {}),
        ...(ev.altKey ? { alt: true } : {}),
      };
      const current = input.bindingFor(actionId);
      const replaced = index === null ? null : (current[index] ?? null);
      const next =
        index === null ? [...current, chord] : current.map((c, i) => (i === index ? chord : c));
      const focusIndex = index === null ? next.length - 1 : index;
      const conflicts = input.setBinding(actionId, next.slice(0, MAX_CHORDS));
      endCapture();
      options.onRebind?.(actionId, def?.category ?? "interface");
      // Keyboard users land back on the chip they just rebound.
      root
        .querySelector<HTMLElement>(`[data-testid="binding-${actionId}-chord-${focusIndex}"]`)
        ?.focus();
      if (conflicts.length > 0) {
        const otherIds = conflicts[0]!.conflictsWith;
        swapOffer = { actionId, chord, replaced, otherIds };
        announce(
          live,
          `${chordLabel(chord)} is also bound to ${otherIds
            .map((id) => input.actions().find((d) => d.id === id)?.label ?? id)
            .join(", ")}. Both will fire until you change one — or press Swap to exchange keys.`,
        );
        render();
      } else {
        swapOffer = null;
        announce(live, `${def?.label ?? actionId} is now ${chordLabel(chord)}.`);
      }
      // setBinding notifies, which re-renders through the subscription below; the
      // explicit render in endCapture already ran, so this is a no-op second pass.
    };
    window.addEventListener("keydown", onKey, true);
  }

  // -- rendering ---------------------------------------------------------------
  function render(): void {
    list.replaceChildren();
    const conflicts = findConflicts();
    const defs = [...input.actions()].sort((a, b) =>
      a.category === b.category ? a.label.localeCompare(b.label) : a.category.localeCompare(b.category),
    );
    let lastCategory: string | null = null;
    for (const def of defs) {
      if (def.category !== lastCategory) {
        lastCategory = def.category;
        list.appendChild(h("h3", { class: "section-header" }, CATEGORY_LABEL[def.category]));
      }
      list.appendChild(bindingRow(def, conflicts.get(def.id) ?? []));
    }
  }

  function bindingRow(def: ActionDef, conflictLabels: string[]): HTMLElement {
    const rowEl = h("div", { class: "binding-row", "data-testid": `binding-${def.id}` });
    const info = h("div", { class: "binding-row__info" });
    info.appendChild(h("div", { class: "row__label label" }, def.label));
    info.appendChild(h("div", { class: "caption" }, def.description));
    rowEl.appendChild(info);

    const chips = h("div", { class: "binding-row__chips" });
    const chords = input.bindingFor(def.id);
    chords.forEach((chord, i) => {
      const active = capturing?.actionId === def.id && capturing.index === i;
      const chip = h(
        "button",
        {
          type: "button",
          class: `btn chord${active ? " chord--capturing" : ""}`,
          "data-testid": `binding-${def.id}-chord-${i}`,
          "aria-label": active ? "Press a key, or Escape to cancel" : `Rebind ${def.label}, currently ${chordLabel(chord)}`,
        },
        active ? "press a key…" : chordLabel(chord),
      );
      chip.addEventListener("click", () => beginCapture(def.id, i));
      chips.appendChild(chip);
      if (chords.length > 1) {
        const remove = h(
          "button",
          {
            type: "button",
            class: "btn btn--quiet",
            "aria-label": `Remove ${chordLabel(chord)} from ${def.label}`,
            "data-testid": `binding-${def.id}-remove-${i}`,
          },
          "✕",
        );
        remove.addEventListener("click", () => {
          input.setBinding(
            def.id,
            chords.filter((_, j) => j !== i),
          );
          options.onRebind?.(def.id, def.category);
          announce(live, `${chordLabel(chord)} removed from ${def.label}.`);
        });
        chips.appendChild(remove);
      }
    });
    if (chords.length < MAX_CHORDS && !capturing) {
      const add = h(
        "button",
        {
          type: "button",
          class: "btn btn--quiet",
          "aria-label": `Add another key for ${def.label}`,
          "data-testid": `binding-${def.id}-add`,
        },
        "+",
      );
      add.addEventListener("click", () => beginCapture(def.id, null));
      chips.appendChild(add);
    }
    rowEl.appendChild(chips);

    if (conflictLabels.length > 0) {
      const warn = h(
        "p",
        { class: "caption binding-row__conflict", "data-testid": `binding-${def.id}-conflict` },
        `Also triggers ${conflictLabels.join(", ")} — both fire until one changes.`,
      );
      rowEl.appendChild(warn);
      if (swapOffer && swapOffer.actionId === def.id) {
        const swapRow = h("div", { class: "binding-row__swap" });
        for (const otherId of swapOffer.otherIds) {
          const otherDef = input.actions().find((d) => d.id === otherId);
          const swapBtn = h(
            "button",
            {
              type: "button",
              class: "btn btn--quiet",
              "data-testid": `binding-${def.id}-swap-${otherId}`,
            },
            `Swap with ${otherDef?.label ?? otherId}`,
          );
          swapBtn.addEventListener("click", () => {
            const sig = chordLabel(swapOffer!.chord);
            const otherChords = input.bindingFor(otherId);
            const exchanged = otherChords.map((c) =>
              chordLabel(c) === sig ? (swapOffer!.replaced ?? null) : c,
            );
            input.setBinding(
              otherId,
              exchanged.filter((c): c is KeyBinding => c !== null),
            );
            const keptLabel = chordLabel(swapOffer!.chord);
            swapOffer = null;
            options.onRebind?.(otherId, otherDef?.category ?? "interface");
            announce(
              live,
              `${otherDef?.label ?? otherId} takes the old key; ${def.label} keeps ${keptLabel}. Conflict resolved.`,
            );
            render();
          });
          swapRow.appendChild(swapBtn);
        }
        rowEl.appendChild(swapRow);
      }
    }

    const reset = h(
      "button",
      {
        type: "button",
        class: "btn btn--quiet",
        "aria-label": `Reset ${def.label} to its default keys`,
        "data-testid": `binding-${def.id}-reset`,
      },
      "Reset",
    );
    reset.addEventListener("click", () => {
      input.resetAction(def.id);
      announce(live, `${def.label} reset to its default keys.`);
    });
    rowEl.appendChild(reset);
    return rowEl;
  }

  // -- wiring ------------------------------------------------------------------
  // The reset-all button lives in the panel header (the `actions` slot), not the body.
  const resetAll = root.querySelector('[data-testid="bindings-reset-all"]');
  resetAll?.addEventListener("click", () => {
    input.resetAllBindings();
    announce(live, "All controls reset to their defaults.");
  });

  const offBindings = input.onBindingsChanged(render);
  // Re-render when the panel opens with fresh state.
  render();

  // Detach the subscription when the panel is closed and dropped.
  const observer = new MutationObserver(() => {
    if (!root.isConnected) {
      offBindings();
      observer.disconnect();
      if (capturing) {
        capturing = null;
        input.resume();
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return root;
}
