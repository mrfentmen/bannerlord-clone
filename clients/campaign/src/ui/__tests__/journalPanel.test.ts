/**
 * The journal panel (mandate §8): newest-first entries with kind chips.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { journalPanel } from "../panels/JournalPanel.js";
import { syncJournal, type JournalStore } from "../../data/journal.js";

describe("journalPanel", () => {
  it("reads newest first and shows an empty state when there is no history", () => {
    const empty: JournalStore = { entries: [], nextSeq: 0 };
    const { root: emptyRoot } = journalPanel({ store: empty, onClose: () => {} });
    expect(emptyRoot.textContent).toContain("Nothing has happened yet.");

    const store = syncJournal(
      empty,
      [
        { id: "n1", day: 4, priority: "important", text: "A defeated B near C", entityId: "town-1", field: null, kind: "battle" },
        { id: "n2", day: 9, priority: "important", text: "X stormed Y", entityId: "town-2", field: null, kind: "siege" },
      ],
      [{ id: "muster", title: "Muster a warband" }],
    );
    const { root } = journalPanel({ store, onClose: () => {} });
    const texts = [...root.querySelectorAll(".journal__text")].map((el) => el.textContent);
    expect(texts[0]).toContain("Muster a warband");
    expect(texts).toContain("A defeated B near C");
    expect(texts).toContain("X stormed Y");
    expect(root.textContent).toContain("Day 9");
  });
});
