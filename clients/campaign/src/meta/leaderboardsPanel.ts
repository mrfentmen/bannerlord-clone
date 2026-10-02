/**
 * Local leaderboards panel (MASTER_PLAN task 141).
 *
 * Mode tabs (quick battles / arena / tournaments), each showing the top 10
 * entries as a ranked table with medal glyphs for the top three. Pure DOM
 * over meta/leaderboards.ts — the caller owns nothing; the store is read
 * fresh on every render. Each tab has a two-step clear-board button.
 */

import { h } from "../ui/dom.js";
import { panel, emptyState } from "../ui/kit.js";
import {
  LEADERBOARD_LABEL,
  LEADERBOARD_MODES,
  bestScore,
  clearBoard,
  topScores,
  type BoardEntry,
  type LeaderboardMode,
} from "./leaderboards.js";
import "./leaderboards.css";

export interface LeaderboardsPanelHandle {
  root: HTMLElement;
  /** Re-render from the live store (e.g. after a result is submitted). */
  refresh(): void;
}

const RANK_GLYPH = ["🥇", "🥈", "🥉"];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function leaderboardsPanel(options: { onClose?: () => void } = {}): LeaderboardsPanelHandle {
  const { root, body } = panel({
    title: "Local leaderboards",
    testId: "leaderboards-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });

  const note = h(
    "p",
    { class: "boards__note", "data-testid": "boards-note" },
    "Best results on this machine — top 10 per mode. Campaign-map bouts land on Quick battles when they finish, arena bouts when recorded, and tournament champions when a bracket completes.",
  );
  const tabs = h("div", { class: "boards__tabs", role: "tablist", "aria-label": "Leaderboard mode" });
  const tableWrap = h("div", { class: "boards__table-wrap", "data-testid": "boards-table" });
  const footer = h("div", { class: "boards__footer" });
  body.append(note, tabs, tableWrap, footer);

  let mode: LeaderboardMode = "quick-battle";
  let armingClear = false;
  const clearBtn = h(
    "button",
    { type: "button", class: "btn btn--quiet", "data-testid": "boards-clear" },
    "Clear board",
  );
  clearBtn.addEventListener("click", () => {
    if (!armingClear) {
      armingClear = true;
      clearBtn.textContent = "Click again to confirm";
      return;
    }
    clearBoard(mode);
    armingClear = false;
    clearBtn.textContent = "Clear board";
    render();
  });
  footer.appendChild(clearBtn);

  function renderTabs(): void {
    tabs.textContent = "";
    for (const m of LEADERBOARD_MODES) {
      const on = m === mode;
      const tab = h(
        "button",
        {
          type: "button",
          role: "tab",
          "aria-selected": String(on),
          class: `boards__tab${on ? " boards__tab--on" : ""}`,
          "data-testid": `boards-tab-${m}`,
        },
        LEADERBOARD_LABEL[m],
      );
      tab.addEventListener("click", () => {
        mode = m;
        armingClear = false;
        clearBtn.textContent = "Clear board";
        render();
      });
      tabs.appendChild(tab);
    }
  }

  function renderTable(): void {
    tableWrap.textContent = "";
    const entries = topScores(mode);
    if (entries.length === 0) {
      tableWrap.appendChild(
        emptyState(
          `No ${LEADERBOARD_LABEL[mode].toLowerCase()} results yet.`,
          "Finish a bout — your best results land here, ranked by score.",
        ),
      );
      return;
    }
    const table = h("table", { class: "boards__table" });
    const thead = h(
      "thead",
      {},
      h(
        "tr",
        {},
        h("th", { scope: "col" }, "Rank"),
        h("th", { scope: "col" }, "Name"),
        h("th", { scope: "col" }, "Score"),
        h("th", { scope: "col" }, "Detail"),
        h("th", { scope: "col" }, "Date"),
      ),
    );
    const tbody = h("tbody", {});
    entries.forEach((entry: BoardEntry, i: number) => {
      tbody.appendChild(
        h(
          "tr",
          { class: `boards__row${i < 3 ? " boards__row--top" : ""}`, "data-testid": `boards-row-${i}` },
          h("td", { class: "boards__rank" }, RANK_GLYPH[i] ?? String(i + 1)),
          h("td", { class: "boards__name" }, entry.name),
          h("td", { class: "boards__score" }, entry.score.toLocaleString("en-US")),
          h("td", { class: "boards__detail" }, entry.detail ?? "—"),
          h("td", { class: "boards__date" }, formatDate(entry.dateISO)),
        ),
      );
    });
    table.append(thead, tbody);
    tableWrap.appendChild(table);
    const best = bestScore(mode);
    if (best) {
      tableWrap.appendChild(
        h(
          "p",
          { class: "boards__best", "data-testid": "boards-best" },
          `Best: ${best.name} — ${best.score.toLocaleString("en-US")} points`,
        ),
      );
    }
  }

  function render(): void {
    renderTabs();
    renderTable();
  }

  render();
  return { root, refresh: render };
}
