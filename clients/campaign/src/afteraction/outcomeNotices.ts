/**
 * Task 97: where the outcome notices live.
 *
 * Tasks 95, 96 and 97 each decide whether a battle earns a notice; this puts
 * whichever of them fired onto the report, in a fixed order — the two bonuses
 * first, the warning last, because the last thing on screen should be the thing
 * that needs acting on.
 *
 * The kind is carried on the element as `data-kind` for the border, and the label
 * spells the notice out in words, so a notice is never distinguished by colour
 * alone.
 */

import { h } from "../ui/dom.js";
import type { AfterActionReport } from "./report.js";
import { heroicVictory } from "./heroicVictory.js";
import { pyrrhicVictory } from "./pyrrhicVictory.js";
import { flawlessVictory } from "./flawlessVictory.js";
import "./reportContent.css";

export type OutcomeKind = "heroic" | "flawless" | "pyrrhic";

export interface OutcomeNotice {
  kind: OutcomeKind;
  label: string;
  line: string;
}

const LABEL: Record<OutcomeKind, string> = {
  heroic: "Heroic victory",
  flawless: "Flawless victory",
  pyrrhic: "Pyrrhic victory",
};

/** Every notice this battle earned, in the order they should be read. */
export function outcomeNotices(report: AfterActionReport): OutcomeNotice[] {
  const notices: OutcomeNotice[] = [];
  const heroic = heroicVictory(report);
  if (heroic) notices.push({ kind: "heroic", label: LABEL.heroic, line: heroic.line });
  const flawless = flawlessVictory(report);
  if (flawless) notices.push({ kind: "flawless", label: LABEL.flawless, line: flawless.line });
  const pyrrhic = pyrrhicVictory(report);
  if (pyrrhic) notices.push({ kind: "pyrrhic", label: LABEL.pyrrhic, line: pyrrhic.line });
  return notices;
}

export interface OutcomePanel {
  root: HTMLElement;
  notices(): OutcomeNotice[];
  destroy(): void;
}

/**
 * The outcome notices for a battle. Hidden when the battle earned none — most
 * battles do — so the caller can mount it unconditionally.
 */
export function createOutcomePanel(report: AfterActionReport): OutcomePanel {
  const notices = outcomeNotices(report);
  const root = h("section", { class: "aa-outcomes", "data-testid": "aa-outcomes", "aria-label": "Battle outcome" });
  root.hidden = notices.length === 0;
  for (const notice of notices) {
    const card = h("div", { class: "aa-outcome", "data-kind": notice.kind });
    card.append(
      h("p", { class: "aa-outcome__label" }, notice.label),
      h("p", { class: "aa-outcome__line" }, notice.line),
    );
    root.appendChild(card);
  }
  return {
    root,
    notices: () => notices,
    destroy() {
      root.remove();
    },
  };
}