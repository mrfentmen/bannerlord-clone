/**
 * Task 93: enemy commander captured. Task 94: the escape.
 *
 * The battle flow already books the enemy commander as a rival the moment the
 * fighting stops — `trackRival()` with `escaped = enemyRemaining > 0`, which is
 * `battleflow/rivals.ts`'s own record of encounters, escapes and defeats. The
 * flow then throws most of that away and keeps one string for its banner, so the
 * report can say a name but not what the outcome is worth: a commander fought
 * three times and got away is a different fact from one who slipped the field on
 * his first appearance.
 *
 * This module reads that record (as a type-only import, so nothing here reaches
 * into the flow's state) and states what happened, with the counts the record
 * carries. It does not track rivals, award a ransom or set `defeated` — the
 * store owns all three.
 *
 * The two fates are told apart by `kind` rather than by inference from the text,
 * because a commander who escapes is the outcome the player most wants flagged
 * and styling that guesses from wording would eventually lie.
 */

import { h } from "../ui/dom.js";
import type { Rival } from "../battleflow/rivals.js";
import "./reportContent.css";

export type CommanderEventKind = "captured" | "escaped";

export interface CommanderEvent {
  kind: CommanderEventKind;
  id: string;
  name: string;
  faction: string;
  /** Battles this commander has now been fought across, per the rival record. */
  encounters: number;
  /** Times this commander has got away with it, per the rival record. */
  escapes: number;
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
    kind: "captured",
    id: rival.id,
    name: rival.name,
    faction: rival.faction,
    encounters: rival.encounters,
    escapes: rival.escapes,
    line: `${rival.name} of ${rival.faction} was taken prisoner — ${fought}.`,
  };
}

/**
 * The escape notice. A commander the record still lists at large has escaped,
 * and the grudge is worth stating: this is the fight the player will be asked to
 * finish later, so the report says how many times now.
 */
export function escapedCommander(rival: Rival): CommanderEvent {
  const again =
    rival.escapes === 1
      ? "and will be back"
      : `and has escaped ${rival.escapes} times now`;
  return {
    kind: "escaped",
    id: rival.id,
    name: rival.name,
    faction: rival.faction,
    encounters: rival.encounters,
    escapes: rival.escapes,
    line: `${rival.name} of ${rival.faction} got off the field — ${again}.`,
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
    "data-kind": event?.kind ?? "none",
    "aria-label": "Enemy commander",
  });
  root.hidden = event === null;
  if (event) {
    root.append(
      h("h3", { class: "aa-commander__title" }, event.kind === "escaped" ? "Enemy commander escaped" : "Enemy commander"),
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