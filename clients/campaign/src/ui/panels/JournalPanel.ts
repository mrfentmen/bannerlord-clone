/**
 * The journal panel (mandate §8).
 *
 * Newest first, one line per entry: the day the simulation reported and the
 * simulation's own sentence. Objective milestones read as the player's own history
 * beside the world's.
 */

import { h } from "../dom.js";
import { emptyState, panel, statusChip } from "../kit.js";
import { asBottomSheet } from "./narrow.js";
import { journalByRecency, type JournalEntry, type JournalStore } from "../../data/journal.js";

export interface JournalPanelOptions {
  store: JournalStore;
  onClose: () => void;
}

const KIND_CHIP = {
  battle: { kind: "critical", label: "Battle" },
  siege: { kind: "warning", label: "Siege" },
  objective: { kind: "good", label: "Milestone" },
} as const;

export function journalPanel(options: JournalPanelOptions): { root: HTMLElement } {
  const { root, body } = panel({
    title: "Journal",
    testId: "journal-panel",
    onClose: options.onClose,
  });

  const entries: JournalEntry[] = journalByRecency(options.store);
  if (entries.length === 0) {
    body.appendChild(
      emptyState(
        "Nothing has happened yet.",
        "Battles, sieges and your own milestones will be written here as the campaign unfolds.",
      ),
    );
    return { root: asBottomSheet(root) };
  }

  const list = h("ol", { class: "journal__list" });
  for (const entry of entries) {
    const chip = KIND_CHIP[entry.kind];
    list.appendChild(
      h("li", { class: "journal__entry" }, [
        h("div", { class: "journal__head" }, [
          statusChip(chip.kind, chip.label),
          entry.day >= 0
            ? h("span", { class: "journal__day", text: `Day ${entry.day}` })
            : h("span", { class: "journal__day journal__day--none", text: "Undated" }),
        ]),
        h("p", { class: "journal__text", text: entry.text }),
      ]),
    );
  }
  body.appendChild(list);
  return { root: asBottomSheet(root) };
}
