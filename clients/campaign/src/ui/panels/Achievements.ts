/**
 * Achievements panel (MASTER_PLAN task 137).
 *
 * Tracking UI over the achievement store: category tabs, unlocked/locked
 * filter, progress bars toward each tier, trophy points total. Read-only —
 * it never records events itself.
 */

import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_CATEGORY_LABEL,
  type AchievementCategory,
  type AchievementProgress,
  type AchievementStore,
} from "../../achievements/index.js";
import { emptyState, panel } from "../kit.js";
import { h } from "../dom.js";

export interface AchievementsPanelOptions {
  store: AchievementStore;
  onClose?: () => void;
  testId?: string;
}

type CategoryFilter = AchievementCategory | "all";
type StateFilter = "all" | "unlocked" | "locked";

const CAT_LABEL: Record<AchievementCategory, string> = ACHIEVEMENT_CATEGORY_LABEL;

export function achievementsPanel(options: AchievementsPanelOptions): HTMLElement {
  const { root, body } =
    options.onClose !== undefined
      ? panel({ title: "Achievements", onClose: options.onClose, testId: options.testId ?? "achievements" })
      : panel({ title: "Achievements", testId: options.testId ?? "achievements" });
  body.classList.add("achieve");
  root.setAttribute("aria-label", "Achievements: tracked trophies");

  let category: CategoryFilter = "all";
  let state: StateFilter = "all";

  const header = h("div", { class: "achieve__header" });
  const summary = h(
    "p",
    { class: "achieve__summary", "aria-live": "polite", "data-testid": "achievements-summary" },
  );
  const toolbar = h("div", { class: "achieve__toolbar" });
  const tabs = h("div", { class: "achieve__tabs", role: "tablist", "aria-label": "Achievement category" });
  const stateTabs = h("div", { class: "achieve__tabs", role: "tablist", "aria-label": "Unlock state" });
  const list = h("div", { class: "achieve__list" });
  body.append(header, toolbar, list);
  header.append(summary);
  toolbar.append(tabs, stateTabs);

  const tabBtns: HTMLButtonElement[] = [];
  function makeTab(
    group: HTMLButtonElement[],
    container: HTMLElement,
    label: string,
    testId: string,
    onPick: () => void,
  ): HTMLButtonElement {
    const btn = h("button", { type: "button", role: "tab", class: "chip", "data-testid": testId }, label) as HTMLButtonElement;
    btn.setAttribute("aria-selected", "false");
    btn.addEventListener("click", () => {
      for (const b of group) {
        b.classList.remove("chip--active");
        b.setAttribute("aria-selected", "false");
      }
      btn.classList.add("chip--active");
      btn.setAttribute("aria-selected", "true");
      onPick();
      render();
    });
    group.push(btn);
    container.appendChild(btn);
    return btn;
  }

  const first = makeTab(tabBtns, tabs, "All", "achievements-tab-all", () => { category = "all"; });
  first.classList.add("chip--active");
  first.setAttribute("aria-selected", "true");
  for (const c of ACHIEVEMENT_CATEGORIES) {
    makeTab(tabBtns, tabs, CAT_LABEL[c], `achievements-tab-${c}`, () => { category = c; });
  }
  const stateBtns: HTMLButtonElement[] = [];
  const sFirst = makeTab(stateBtns, stateTabs, "All", "achievements-state-all", () => { state = "all"; });
  sFirst.classList.add("chip--active");
  sFirst.setAttribute("aria-selected", "true");
  makeTab(stateBtns, stateTabs, "Unlocked", "achievements-state-unlocked", () => { state = "unlocked"; });
  makeTab(stateBtns, stateTabs, "Locked", "achievements-state-locked", () => { state = "locked"; });

  function visible(): AchievementProgress[] {
    return options.store.allProgress().filter((p) => {
      if (category !== "all" && p.def.category !== category) return false;
      if (state === "unlocked" && !p.unlocked) return false;
      if (state === "locked" && p.unlocked) return false;
      return true;
    });
  }

  function render(): void {
    const rows = visible();
    const unlocked = options.store.unlockedCount();
    const total = options.store.allProgress().length;
    const points = options.store.totalPoints();
    summary.textContent = `${unlocked} of ${total} unlocked · ${points} points`;
    list.innerHTML = "";
    if (rows.length === 0) {
      list.append(emptyState("Nothing here yet.", "Locked achievements appear as you play."));
      return;
    }
    for (const p of rows) {
      const masked = !p.unlocked && p.def.hidden === true;
      const title = masked ? "???" : p.def.title;
      const desc = masked ? "A secret. Keep playing." : p.def.description;
      const pct = Math.round((p.current / p.def.count) * 100);
      const bar = h(
        "div",
        { class: "achieve__bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(p.def.count), "aria-valuenow": String(p.current), "aria-label": `${title} progress` },
        h("div", { class: "achieve__fill", style: `width:${pct}%` }),
      );
      const row = h(
        "div",
        { class: "achieve__row", "data-testid": `achievement-${p.def.id}` },
        h(
          "div",
          { class: "achieve__row-head" },
          h("span", { class: "achieve__title" }, title),
          h("span", { class: "achieve__points" }, `${p.def.points} pts`),
        ),
        h("p", { class: "achieve__desc" }, desc),
        bar,
        h(
          "p",
          { class: "achieve__status" },
          p.unlocked ? "Unlocked" : `${p.current} / ${p.def.count}`,
        ),
      );
      if (p.unlocked) row.classList.add("achieve__row--unlocked");
      list.appendChild(row);
    }
  }

  render();
  return root;
}
