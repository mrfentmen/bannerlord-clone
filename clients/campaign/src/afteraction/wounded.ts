/**
 * Task 84: wounded units list.
 *
 * The casualties section says how many died. It does not say who came off the
 * field hurt, which is the number the campaign layer needs: a wounded unit is
 * still on the roster, and the surgeon decides how many of them fight again.
 *
 * The list is what the sim reports (`WoundedUnit[]`) and the surgeon's verdict is
 * `battleflow/medicine.ts`'s own `SurgeonReport`, imported as a type only so the
 * saved/died split on screen is the one the surgeon computed rather than a
 * second opinion. Nothing here infers a wounded count from the casualty
 * breakdown: a loss in this sim is a death, and calling the survivors wounded
 * would invent an injury state the simulation does not have.
 *
 * Recovery time is deliberately absent. Nothing in the client models how long a
 * wound keeps a unit out — there is no healing clock to read — and inventing a
 * number per severity would be a guess printed as a fact.
 */

import { h } from "../ui/dom.js";
import type { SurgeonReport } from "../battleflow/medicine.js";
import "./reportContent.css";

export interface WoundedUnit {
  unitId: string;
  name: string;
  kind: string;
  /** Troops of this unit hurt but alive when the fighting stopped. */
  wounded: number;
}

export interface WoundedSummary {
  units: WoundedUnit[];
  /** Hurt troops across every unit. */
  totalWounded: number;
  /** What the surgeon made of them, when there was a surgeon. */
  surgeon: SurgeonReport | null;
  /** One line for the report, e.g. "38 wounded — the surgeons saved 30". */
  line: string;
}

/**
 * The wounded roll-up: units ordered by how many they lost, so the unit the
 * player needs to worry about is first, and `kind` then `name` break ties so the
 * list does not reshuffle between renders.
 */
export function woundedSummary(units: readonly WoundedUnit[], surgeon: SurgeonReport | null = null): WoundedSummary {
  const rows = units
    .filter((u) => u.wounded > 0)
    .slice()
    .sort((a, b) => b.wounded - a.wounded || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  const totalWounded = rows.reduce((sum, u) => sum + u.wounded, 0);
  const line =
    surgeon === null
      ? `${totalWounded} wounded across ${rows.length} unit${rows.length === 1 ? "" : "s"}.`
      : surgeon.line;
  return { units: rows, totalWounded, surgeon, line };
}

export interface WoundedPanel {
  root: HTMLElement;
  /** The roll-up the panel rendered. */
  summary(): WoundedSummary;
  destroy(): void;
}

/**
 * The wounded list for the report. Hidden when nobody was hurt, so the caller can
 * mount it unconditionally.
 */
export function createWoundedPanel(
  units: readonly WoundedUnit[],
  surgeon: SurgeonReport | null = null,
): WoundedPanel {
  const summary = woundedSummary(units, surgeon);
  const root = h("section", { class: "aa-wounded", "data-testid": "aa-wounded", "aria-label": "Wounded" });
  root.hidden = summary.units.length === 0;
  if (summary.units.length > 0) {
    root.appendChild(h("h3", { class: "aa-wounded__title" }, `Wounded (${summary.totalWounded})`));
    const list = h("ul", { class: "aa-wounded__list" });
    for (const unit of summary.units) {
      const row = h("li", { class: "aa-wounded__row", "data-unit-id": unit.unitId });
      row.append(
        h("span", { class: "aa-wounded__name" }, unit.name),
        h("span", { class: "aa-wounded__kind" }, unit.kind),
        h("span", { class: "aa-wounded__count mono" }, `${unit.wounded}`),
      );
      list.appendChild(row);
    }
    root.append(list, h("p", { class: "aa-wounded__line" }, summary.line));
  }
  return {
    root,
    summary: () => summary,
    destroy() {
      root.remove();
    },
  };
}