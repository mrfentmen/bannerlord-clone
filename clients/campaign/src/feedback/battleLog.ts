/**
 * Task 50: the battle log panel. Timestamped moments (charges, routs, hero
 * downs, objectives, orders) accumulate in a scrollable panel, and the whole
 * log exports as plain text for sharing or bug reports.
 */

import { h } from "../ui/dom.js";
import type { BattleMoment, FeedbackSource, Unsubscribe } from "./types.js";

export interface BattleLog {
  root: HTMLElement;
  /** The log as plain text, one timestamped line per moment. */
  exportText(): string;
  destroy(): void;
}

function stamp(at: number): string {
  const d = new Date(at);
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${mm}:${ss}`;
}

const KIND_MARK: Record<BattleMoment["kind"], string> = {
  charge: "➤",
  rout: "✖",
  heroDown: "☠",
  objective: "◈",
  order: "✦",
};

export function createBattleLog(source: FeedbackSource): BattleLog {
  const moments: BattleMoment[] = [];
  const list = h("ol", { class: "fb-battlelog-list" });
  const panel = h("section", { class: "fb-battlelog", "data-testid": "fb-battlelog" });
  const exportBtn = h("button", { class: "fb-battlelog-export", type: "button" });
  exportBtn.textContent = "Export log";
  exportBtn.addEventListener("click", () => {
    const blob = new Blob([exportText()], { type: "text/plain" });
    const a = h("a", {}) as HTMLAnchorElement;
    a.href = URL.createObjectURL(blob);
    a.download = "battle-log.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  panel.append(list, exportBtn);

  const unsubs: Unsubscribe[] = [source.onMoment(onMoment)];

  function onMoment(m: BattleMoment): void {
    moments.push(m);
    const li = h("li", { class: `fb-battlelog-row is-${m.kind}` });
    li.textContent = `[${stamp(m.at)}] ${KIND_MARK[m.kind]} ${m.text}`;
    list.appendChild(li);
    list.scrollTop = list.scrollHeight;
  }

  function exportText(): string {
    return moments.map((m) => `[${stamp(m.at)}] ${m.kind}: ${m.text}`).join("\n");
  }

  return {
    root: panel,
    exportText,
    destroy() {
      for (const u of unsubs) u();
      panel.remove();
    },
  };
}
