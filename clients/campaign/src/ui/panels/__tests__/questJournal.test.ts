/**
 * Quest journal panel DOM smoke test.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { QuestJournal, seedQuests } from "../../../journal/index.js";
import { questJournalPanel } from "../QuestJournal.js";

function setup() {
  const journal = new QuestJournal(seedQuests());
  const root = questJournalPanel({ journal });
  document.body.append(root);
  return { journal, root };
}

describe("questJournalPanel", () => {
  it("renders the full roster and a live count", () => {
    const { root } = setup();
    try {
      expect(root.querySelectorAll(".journal__row").length).toBe(120);
      expect(root.querySelector(".journal__live")?.textContent).toMatch(/120 quests/);
    } finally {
      root.remove();
    }
  });

  it("filters by status tab", () => {
    const { journal, root } = setup();
    try {
      const expected = journal.countByStatus().failed;
      (root.querySelector('[data-testid="journal-tab-failed"]') as HTMLButtonElement).click();
      expect(root.querySelectorAll(".journal__row").length).toBe(expected);
      expect(root.querySelector(".journal__live")?.textContent).toMatch(new RegExp(`${expected} quests`));
    } finally {
      root.remove();
    }
  });

  it("filters by category and search together", () => {
    const { root } = setup();
    try {
      const select = root.querySelector('[data-testid="journal-category"]') as HTMLSelectElement;
      select.value = "bounty";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      const search = root.querySelector('[data-testid="journal-search"]') as HTMLInputElement;
      search.value = "arsonist";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      const rows = root.querySelectorAll(".journal__row");
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.textContent?.toLowerCase()).toContain("arsonist");
      }
    } finally {
      root.remove();
    }
  });

  it("shows the detail view on row select", () => {
    const { root } = setup();
    try {
      (root.querySelector(".journal__row") as HTMLButtonElement).click();
      const detail = root.querySelector('[data-testid="journal-detail"]');
      expect(detail).not.toBeNull();
      expect(detail?.querySelectorAll(".journal__objective").length).toBeGreaterThan(0);
    } finally {
      root.remove();
    }
  });

  it("shows an empty state when nothing matches", () => {
    const { root } = setup();
    try {
      const search = root.querySelector('[data-testid="journal-search"]') as HTMLInputElement;
      search.value = "zzz-no-such-quest";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      expect(root.querySelectorAll(".journal__row").length).toBe(0);
      expect(root.textContent).toMatch(/No quests match/);
    } finally {
      root.remove();
    }
  });
});
