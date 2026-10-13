/**
 * Clan extinction warning (Rowan solo task 10).
 *
 * When the clan is down to its last living members, the campaign should say
 * so before it is too late: evaluate the roster, and if the clan is at or
 * below the warning threshold, produce a warning with concrete hints
 * (marry, recruit companions, secure an heir). Pure evaluation + DOM panel.
 */

import type { ClanMember } from "./types.js";
import { h } from "../ui/dom.js";
import { modalize } from "../ui/focusTrap.js";

/** Living members at or below this count trigger the warning. */
export const EXTINCTION_WARNING_THRESHOLD = 2;

export interface ExtinctionHint {
  id: "marry" | "recruit" | "heir";
  label: string;
  detail: string;
}

export interface ExtinctionWarning {
  livingCount: number;
  /** Members who are unmarried adults and could marry. */
  unmarriedAdults: ClanMember[];
  hints: ExtinctionHint[];
}

const ADULT_AGE = 18;

/**
 * Evaluate the clan roster. Returns a warning when 2 or fewer members are
 * alive, otherwise null. Hints adapt to the roster: marry (if an unmarried
 * adult exists), recruit (always — companions bolster the clan), heir
 * (if no child exists to carry the line).
 */
export function checkExtinctionRisk(members: ClanMember[], currentYear: number): ExtinctionWarning | null {
  const living = members.filter((m) => m.deathYear === undefined);
  if (living.length > EXTINCTION_WARNING_THRESHOLD) return null;

  const unmarriedAdults = living.filter(
    (m) => m.spouseId === undefined && currentYear - m.birthYear >= ADULT_AGE,
  );
  const hasChild = living.some(
    (m) => m.fatherId !== undefined || m.motherId !== undefined,
  );
  const hints: ExtinctionHint[] = [];
  if (unmarriedAdults.length > 0) {
    hints.push({
      id: "marry",
      label: "Arrange a marriage",
      detail: `${unmarriedAdults.map((m) => m.name).join(", ")} ${unmarriedAdults.length === 1 ? "is" : "are"} unmarried — an alliance marriage can bring new blood and children.`,
    });
  }
  hints.push({
    id: "recruit",
    label: "Recruit companions",
    detail: "Loyal companions can be adopted into the clan and keep it alive if the bloodline fails.",
  });
  if (!hasChild) {
    hints.push({
      id: "heir",
      label: "Secure an heir",
      detail: "No child carries the line. Without an heir, one death ends the campaign.",
    });
  }
  return { livingCount: living.length, unmarriedAdults, hints };
}

export interface ExtinctionWarningPanelOptions {
  warning: ExtinctionWarning;
  onDismiss: () => void;
}

export function extinctionWarningPanel(options: ExtinctionWarningPanelOptions): HTMLElement {
  const { warning } = options;
  const list = h("ul", { class: "extw__list", "data-testid": "extw-hints" });
  for (const hint of warning.hints) {
    list.appendChild(
      h(
        "li",
        { class: "extw__hint", "data-testid": `extw-hint-${hint.id}` },
        h("strong", {}, hint.label),
        h("span", { class: "caption" }, ` — ${hint.detail}`),
      ),
    );
  }
  const root = h(
    "div",
    { class: "extw", role: "alert", "data-testid": "extw-panel" },
    h(
      "h2",
      { "data-testid": "extw-headline" },
      warning.livingCount === 1 ? "Last of the line" : "The clan is dying",
    ),
    h(
      "p",
      { class: "caption" },
      warning.livingCount === 1
        ? "Only one clan member still lives."
        : `Only ${warning.livingCount} clan members still live.`,
    ),
    list,
  );
  const dismiss = h("button", { type: "button", class: "btn", "data-testid": "extw-dismiss" }, "Understood");
  const cleanup = modalize(root, () => {
    cleanup();
    options.onDismiss();
  });
  dismiss.addEventListener("click", () => {
    cleanup();
    options.onDismiss();
  });
  root.appendChild(dismiss);
  return root;
}
