/**
 * The objectives panel (mandate §12).
 *
 * Each objective shows what to do and how far along the player is, measured live.
 * Completed objectives get a check and stay checked — the evaluation marks them done
 * and the store persists it.
 */

import { h } from "../dom.js";
import { emptyState, gauge, panel, statusChip } from "../kit.js";
import { asBottomSheet } from "./narrow.js";
import type { Objective } from "../../data/objectives.js";

export interface ObjectivesPanelOptions {
  objectives: Objective[];
  onClose: () => void;
}

function formatMoney(n: number): string {
  return `$${Math.floor(n).toLocaleString("en-US")}`;
}

export function objectivesPanel(options: ObjectivesPanelOptions): { root: HTMLElement } {
  const { root, body } = panel({
    title: "Objectives",
    testId: "objectives-panel",
    onClose: options.onClose,
  });

  if (options.objectives.length === 0) {
    body.appendChild(emptyState("No objectives.", "The world has not set you any yet."));
    return { root: asBottomSheet(root) };
  }

  const done = options.objectives.filter((o) => o.completed).length;
  body.appendChild(
    h(
      "p",
      { class: "obj__summary" },
      `${done} of ${options.objectives.length} complete. These are suggestions, not orders — the sandbox stays open.`,
    ),
  );

  for (const objective of options.objectives) {
    const isMoney = objective.id === "war-chest";
    const progressText = isMoney
      ? `${formatMoney(objective.progress)} / ${formatMoney(objective.target)}`
      : `${objective.progress} / ${objective.target}`;
    body.appendChild(
      h("section", { class: "obj", "data-testid": `objective-${objective.id}` }, [
        h("div", { class: "obj__head" }, [
          h("h3", { class: "obj__title", text: objective.title }),
          statusChip(
            objective.completed ? "good" : "info",
            objective.completed ? "Done" : "In progress",
          ),
        ]),
        h("p", { class: "obj__desc", text: objective.description }),
        objective.completed
          ? h("p", { class: "obj__done", text: "✓ Complete" })
          : gauge({
              label: "Progress",
              value: objective.target === 0 ? 1 : objective.progress / objective.target,
              format: () => progressText,
              thresholds: { goodAbove: 0.999 },
              testId: `objective-gauge-${objective.id}`,
            }),
      ]),
    );
  }

  return { root: asBottomSheet(root) };
}
