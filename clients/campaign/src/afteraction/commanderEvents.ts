/**
 * Task 93: enemy commander captured.
 *
 * The battle flow already books the enemy commander as a rival the moment the
 * fighting stops — `trackRival()` with `escaped = enemyRemaining > 0`, which is
 * `battleflow/rivals.ts`'s own record of encounters and defeats. The flow then
 * throws most of that away and keeps one string for its banner, so the report
 * can say a name but not what the capture is worth: a commander fought twice and
 * was finally taken is a different fact from one taken on his first appearance.
 *
 * This module reads that record (as a type-only import, so nothing here reaches
 * into the flow's state) and states the capture, with the encounter count the
 * record carries. It does not track rivals, award a ransom or set `defeated` —
 * the store owns all three.
 */

import { h } from "../ui/dom.js";
import type { Rival } from "../battleflow/rivals.js";
import "./reportContent.css";

export interface CommanderEvent {
  id: string;
  name: string;
  faction: string;
  /** Battles this commander has now been fought across, per the rival record. */
  encounters: number;
  /** The notice as the report prints it. */
  line: string;
}

/**
 * The capture notice. Only a commander the record marks defeated has been
 * captured — anyone else is still on the field, and claiming otherwise would
 * book a prisoner who is walking away.
 */
export function capturedCommander(rival: Rival): CommanderEvent {
  const fought =
    rival.encounters === 1
      ? "fought once before"
      : `fought ${rival.encounters} times before`;
  return {
    id: rival.id,
    name: rival.name,
    faction: rival.faction,
    encounters: rival.encounters,
    line: `${rival.name} of ${rival.faction} was taken prisoner — ${fought}.`,
  };
}

export interface CommanderPanel {
  root: HTMLElement;
  event(): CommanderEvent | null;
  destroy(): void;
}

/**
 * The commander's fate, as one notice on the report. Hidden when there was no
 * commander to report, so the caller can mount it unconditionally.
 */
export function createCommanderPanel(event: CommanderEvent | null): CommanderPanel {
  const root = h("section", {
    class: "aa-commander",
    "data-testid": "aa-commander",
    "aria-label": "Enemy commander",
  });
  root.hidden = event === null;
  if (event) {
    root.append(
      h("h3", { class: "aa-commander__title" }, "Enemy commander"),
      h("p", { class: "aa-commander__name" }, event.name),
      h("p", { class: "aa-commander__line" }, event.line),
    );
  }
  return {
    root,
    event: () => event,
    destroy() {
      root.remove();
    },
  };
}