/**
 * The after-action report screen: renders the four report sections
 * (casualties, kills, MVP, timeline) as DOM.
 */

import { h } from "../ui/dom.js";
import type { AfterActionReport } from "./report.js";
import { sharePct } from "./casualties.js";
import { killDeathSummary } from "./killDeath.js";
import "./reportContent.css";

export function createReportScreen(report: AfterActionReport, onClose: () => void): HTMLElement {
  const root = h("div", { class: "afteraction", "data-testid": "afteraction" });

  const title = h("h2", { class: "afteraction-title" });
  title.textContent = `${report.playerWon ? "Victory" : "Defeat"} — ${report.battleLabel}`;

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

  root.append(title, kills, cas, mvp, tl, close);
  return root;
}
