/**
 * The after-action report screen: renders the four report sections
 * (casualties, kills, MVP, timeline) as DOM.
 */

import { h } from "../ui/dom.js";
import type { AfterActionReport } from "./report.js";
import type { MvpCitation, UnitPerformance } from "../battleflow/mvp.js";
import { sharePct } from "./casualties.js";
import { killDeathSummary } from "./killDeath.js";
import { mvpBoard } from "./mvpHighlight.js";
import { createRematchButton } from "./rematch.js";
import { battleRating } from "./rating.js";
import { createOutcomePanel } from "./outcomeNotices.js";
import "./reportContent.css";

/** What the caller can add to the report without changing its sections. */
export interface ReportScreenOptions {
  /**
   * Per-unit performance from the sim, so the MVP section can highlight the
   * soldier rather than only the unit kind. Omitted when the sim did not
   * report individuals.
   */
  units?: readonly UnitPerformance[];
  /** The sim's MVP citation, when it computed one. */
  citation?: MvpCitation | null;
  /**
   * Start the same battle again. Task 89: the report grows a "Fight again"
   * control only when the caller can honour it, so a report with no second
   * fight available shows no button rather than one that does nothing.
   */
  onRematch?: () => void;
  /** Who is waiting on the field, named beside the rematch control. */
  rematchOpponent?: string;
}

export function createReportScreen(
  report: AfterActionReport,
  onClose: () => void,
  options: ReportScreenOptions = {},
): HTMLElement {
  const root = h("div", { class: "afteraction", "data-testid": "afteraction" });

  const title = h("h2", { class: "afteraction-title" });
  title.textContent = `${report.playerWon ? "Victory" : "Defeat"} — ${report.battleLabel}`;

  // Task 90: the grade sits beside the title, and always states its grounds —
  // a letter the player cannot check is a letter they have to take on trust.
  const rating = battleRating(report);
  const ratingStamp = h("div", { class: "afteraction-rating", "data-grade": rating.grade, "data-testid": "afteraction-rating" });
  ratingStamp.append(
    h("span", { class: "afteraction-rating__grade" }, rating.grade),
    h("span", { class: "afteraction-rating__basis" }, rating.basis),
  );

  const header = h("div", { class: "afteraction-header" }, title, ratingStamp);

  const kills = h("section", { class: "afteraction-section" });
  const killsTitle = h("h3", {});
  killsTitle.textContent = "Kills";
  const killsBody = h("p", {});
  killsBody.textContent = `${report.playerKills} inflicted, ${report.enemyKills} suffered.`;
  // Task 78: the two counts alone make the player do the arithmetic that decides
  // whether the battle was worth fighting.
  const exchange = h("p", { class: "afteraction-exchange" });
  exchange.textContent = killDeathSummary(report);
  kills.append(killsTitle, killsBody, exchange);

  const cas = h("section", { class: "afteraction-section" });
  const casTitle = h("h3", {});
  casTitle.textContent = "Casualties";
  cas.appendChild(casTitle);
  for (const [label, breakdown] of [
    ["Ours", report.playerCasualties],
    ["Theirs", report.enemyCasualties],
  ] as const) {
    const side = h("div", { class: "afteraction-side" });
    const sideTitle = h("h4", {});
    sideTitle.textContent = `${label} — ${breakdown.totalLost} lost`;
    side.appendChild(sideTitle);
    for (const row of breakdown.rows) {
      const line = h("p", {});
      line.textContent = `${row.unitKind}: ${row.lost}/${row.started} (${sharePct(row.share)})`;
      side.appendChild(line);
    }
    cas.appendChild(side);
  }

  const mvp = h("section", { class: "afteraction-section" });
  const mvpTitle = h("h3", {});
  mvpTitle.textContent = "MVP unit";
  const mvpBody = h("p", {});
  mvpBody.textContent = report.mvp
    ? `${report.mvp.unitKind} — ${report.mvp.kills} kills`
    : "No unit stood out.";
  mvp.append(mvpTitle, mvpBody);

  // Task 79: when the sim reported individuals, the MVP is a soldier, and a
  // highlight is only honest if the rest of the field is shown under it.
  if (options.units && options.units.length > 0) {
    const highlight = mvpBoard(options.units, options.citation ?? null);
    if (highlight.leader) {
      const leader = h("div", { class: "afteraction-mvp", "data-testid": "afteraction-mvp" });
      leader.append(
        h("p", { class: "afteraction-mvp__name" }, `${highlight.leader.name} (${highlight.leader.kind})`),
        h("p", { class: "afteraction-mvp__line" }, highlight.line),
      );
      mvp.appendChild(leader);
      const board = h("ol", { class: "afteraction-mvp-board" });
      for (const row of highlight.rows) {
        const li = h("li", { class: row.isLeader ? "afteraction-mvp-row afteraction-mvp-row--leader" : "afteraction-mvp-row" });
        li.textContent = `${row.name} (${row.kind}) — ${row.kills} kills`;
        board.appendChild(li);
      }
      mvp.appendChild(board);
    }
  }

  const tl = h("section", { class: "afteraction-section" });
  const tlTitle = h("h3", {});
  tlTitle.textContent = "Timeline";
  tl.appendChild(tlTitle);
  const list = h("ol", { class: "afteraction-timeline" });
  for (const ev of report.timeline) {
    const li = h("li", {});
    li.textContent = `${Math.floor(ev.t / 60)}:${String(Math.floor(ev.t % 60)).padStart(2, "0")} — ${ev.label}`;
    list.appendChild(li);
  }
  tl.appendChild(list);

  const close = h("button", { type: "button", class: "afteraction-close" }) as HTMLButtonElement;
  close.textContent = "Continue";
  close.addEventListener("click", onClose);

  const actions = h("div", { class: "afteraction-actions" }, close);
  if (options.onRematch) {
    actions.appendChild(
      createRematchButton({ onRematch: options.onRematch, opponent: options.rematchOpponent }).root,
    );
  }

  // Tasks 95-97: whatever the battle earned — heroic, flawless, pyrrhic — sits
  // directly under the title, where the outcome is read before the detail.
  const outcomes = createOutcomePanel(report).root;

  root.append(header, outcomes, kills, cas, mvp, tl, actions);
  return root;
}
