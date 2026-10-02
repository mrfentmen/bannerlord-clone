/**
 * Lifetime statistics page (MASTER_PLAN task 138).
 *
 * Renders the cross-campaign accumulator from meta/lifetimeStats.ts as a
 * stat grid: kills, gold earned, battles (won/lost + win rate), hours
 * played, campaigns, seasons, treaties, schemes. Pure DOM over the store —
 * the panel re-reads on refresh. Kills and gold come from the battle layer's
 * after-action view (both sides' losses plus loot), so they are measured;
 * the panel still supports marking a row whose reporter is not wired.
 */

import { h } from "../ui/dom.js";
import { panel, emptyState } from "../ui/kit.js";
import {
  formatCount,
  formatPlayTime,
  lifetimeHours,
  lifetimeWinRate,
  loadLifetimeStats,
  resetLifetimeStats,
  type LifetimeStatsRecord,
} from "./lifetimeStats.js";
import "./lifetimeStats.css";

export interface LifetimeStatsPanelHandle {
  root: HTMLElement;
  /** Re-render from the live store (e.g. after a battle ends). */
  refresh(): void;
}

interface StatDef {
  id: string;
  glyph: string;
  label: string;
  value: (s: LifetimeStatsRecord) => string;
  sub?: (s: LifetimeStatsRecord) => string | null;
  /** True when the value depends on a reporter that isn't wired yet. */
  pendingSource?: boolean;
}

const STATS: StatDef[] = [
  {
    id: "kills",
    glyph: "⚔️",
    label: "Kills",
    value: (s) => formatCount(s.kills),
  },
  {
    id: "gold",
    glyph: "🪙",
    label: "Gold earned",
    value: (s) => formatCount(s.goldEarned),
  },
  {
    id: "battles",
    glyph: "🏳️",
    label: "Battles fought",
    value: (s) => formatCount(s.battlesFought),
    sub: (s) => {
      const rate = lifetimeWinRate(s);
      return rate === null
        ? "no battles yet"
        : `${formatCount(s.battlesWon)} won · ${formatCount(s.battlesLost)} lost · ${Math.round(rate * 100)}% win rate`;
    },
  },
  {
    id: "hours",
    glyph: "⏳",
    label: "Hours played",
    value: (s) => formatPlayTime(s.playSeconds),
    sub: (s) => `${lifetimeHours(s).toFixed(1)} hours across every campaign`,
  },
  {
    id: "campaigns",
    glyph: "👑",
    label: "Campaigns started",
    value: (s) => formatCount(s.campaignsStarted),
    sub: (s) => `${formatCount(s.seasonsPlayed)} seasons ruled`,
  },
  {
    id: "treaties",
    glyph: "🤝",
    label: "Treaties signed",
    value: (s) => formatCount(s.treatiesSigned),
    sub: () => null,
  },
  {
    id: "schemes",
    glyph: "🕵️",
    label: "Schemes completed",
    value: (s) => formatCount(s.schemesCompleted),
    sub: () => null,
  },
];

export function lifetimeStatsPanel(options: { onClose?: () => void } = {}): LifetimeStatsPanelHandle {
  const { root, body } = panel({
    title: "Lifetime statistics",
    testId: "lifetime-stats-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });

  const note = h(
    "p",
    { class: "lifetime__note", "data-testid": "lifetime-note" },
    "These totals accumulate across every campaign on this machine — won, lost, or abandoned.",
  );
  const grid = h("div", { class: "lifetime__grid", "data-testid": "lifetime-grid" });
  const footer = h("div", { class: "lifetime__footer" });
  body.append(note, grid, footer);

  let armingReset = false;
  const resetBtn = h(
    "button",
    { type: "button", class: "btn btn--quiet", "data-testid": "lifetime-reset" },
    "Reset statistics",
  );
  resetBtn.addEventListener("click", () => {
    if (!armingReset) {
      armingReset = true;
      resetBtn.textContent = "Click again to confirm reset";
      return;
    }
    resetLifetimeStats();
    armingReset = false;
    resetBtn.textContent = "Reset statistics";
    render();
  });
  footer.appendChild(resetBtn);

  function render(): void {
    const stats = loadLifetimeStats();
    grid.textContent = "";
    const anyActivity =
      stats.battlesFought > 0 || stats.playSeconds > 0 || stats.campaignsStarted > 0;
    if (!anyActivity) {
      grid.appendChild(
        emptyState(
          "No history yet.",
          "Fight battles and rule seasons — your lifetime totals start accumulating here.",
        ),
      );
      return;
    }
    for (const def of STATS) {
      const card = h(
        "div",
        {
          class: `lifetime__card${def.pendingSource ? " lifetime__card--pending" : ""}`,
          "data-testid": `lifetime-stat-${def.id}`,
        },
        h("span", { class: "lifetime__glyph", "aria-hidden": "true" }, def.glyph),
        h("p", { class: "lifetime__value" }, def.value(stats)),
        h("p", { class: "lifetime__label" }, def.label),
      );
      const sub = def.sub?.(stats);
      if (sub) card.appendChild(h("p", { class: "lifetime__sub" }, sub));
      grid.appendChild(card);
    }
  }

  render();
  return { root, refresh: render };
}
