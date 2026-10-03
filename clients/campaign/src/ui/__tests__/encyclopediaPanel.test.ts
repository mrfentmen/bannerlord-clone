/**
 * The encyclopedia panel (mandate §9): search, kind filters, and in-panel link
 * navigation between related entries.
 *
 * The index comes from the test fixture's real-shaped snapshot; the panel is the only
 * thing under test.
 *
 * @vitest-environment jsdom
 */

import { beforeAll, describe, expect, it } from "vitest";
import { encyclopediaPanel } from "../panels/EncyclopediaPanel.js";
import { buildEncyclopedia, type Encyclopedia } from "../../data/encyclopedia.js";
import { createFixtureSimulationProvider } from "../../data/fixture/index.js";
import type { SimSnapshot } from "../../data/types.js";

let encyclopedia: Encyclopedia;
let snapshot: SimSnapshot;

beforeAll(async () => {
  const provider = createFixtureSimulationProvider();
  snapshot = await provider.getSnapshot();
  encyclopedia = buildEncyclopedia(snapshot);
});

function openPanel(): HTMLElement {
  const { root } = encyclopediaPanel({ encyclopedia, onClose: () => {} });
  document.body.replaceChildren(root);
  return root;
}

describe("encyclopediaPanel", () => {
  it("lists every entry and filters by kind", () => {
    const root = openPanel();
    const items = root.querySelectorAll(".ency__item");
    expect(items.length).toBe(encyclopedia.entries.length);

    // Turn off two kinds: only settlements remain.
    const chips = [...root.querySelectorAll<HTMLButtonElement>(".ency__kinds .btn")];
    expect(chips).toHaveLength(3);
    chips[1]!.click(); // Factions off
    chips[2]!.click(); // Characters off
    const settled = root.querySelectorAll(".ency__item");
    expect(settled.length).toBe(encyclopedia.entries.filter((e) => e.kind === "settlement").length);
    expect(settled.length).toBeGreaterThan(0);
  });

  it("searches by name", () => {
    const root = openPanel();
    const town = snapshot.towns[0]!;
    const search = root.querySelector<HTMLInputElement>(".ency__search")!;
    search.value = town.name.slice(0, 4);
    search.dispatchEvent(new Event("input", { bubbles: true }));
    const names = [...root.querySelectorAll(".ency__name")].map((el) => el.textContent);
    expect(names).toContain(town.name);
  });

  it("navigates links between related entries and back", () => {
    const root = openPanel();
    const town = snapshot.towns.find((t) => t.holderId);
    if (!town) return; // fixture without holders: nothing to navigate
    const entry = encyclopedia.byId.get(town.id)!;
    const holderLink = entry.links.find((l) => l.label.startsWith("Holder:"));
    if (!holderLink) return;

    // Open the settlement via search, then follow the holder link.
    const search = root.querySelector<HTMLInputElement>(".ency__search")!;
    search.value = town.name;
    search.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector<HTMLButtonElement>(".ency__item")!.click();
    expect(root.querySelector(".ency__title")!.textContent).toBe(town.name);

    const linkBtn = [...root.querySelectorAll<HTMLButtonElement>(".ency__link")].find((b) =>
      b.textContent!.startsWith("Holder:"),
    )!;
    linkBtn.click();
    const holder = encyclopedia.byId.get(holderLink.entryId)!;
    expect(root.querySelector(".ency__title")!.textContent).toBe(holder.name);

    // Back returns to the settlement.
    const back = [...root.querySelectorAll<HTMLButtonElement>(".btn--quiet")].find(
      (b) => b.textContent === "← Back",
    )!;
    back.click();
    expect(root.querySelector(".ency__title")!.textContent).toBe(town.name);
  });

  it("shows an empty state for a hopeless search", () => {
    const root = openPanel();
    const search = root.querySelector<HTMLInputElement>(".ency__search")!;
    search.value = "zzz-no-such-place";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelectorAll(".ency__item")).toHaveLength(0);
    expect(root.textContent).toContain("No entries match.");
  });

  it("keeps search focus and text when toggling kind filters", () => {
    const root = openPanel();
    const search = root.querySelector<HTMLInputElement>(".ency__search")!;
    search.value = "gold";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    search.focus();
    const chips = [...root.querySelectorAll<HTMLButtonElement>(".ency__kinds .btn")];
    chips[1]!.click(); // Factions off
    // The search box is the same element, still focused, text intact.
    expect(root.querySelector(".ency__search")).toBe(search);
    expect(document.activeElement).toBe(search);
    expect(search.value).toBe("gold");
    expect(chips[1]!.getAttribute("aria-pressed")).toBe("false");
  });

  it("opens directly on a deep-linked entry", () => {
    const town = snapshot.towns[0]!;
    const { root } = encyclopediaPanel({ encyclopedia, initialEntryId: town.id, onClose: () => {} });
    document.body.replaceChildren(root);
    // The detail view, not the search list: the title is the town's name and there
    // is no search box on screen.
    expect(root.querySelector(".ency__title")!.textContent).toBe(town.name);
    expect(root.querySelector(".ency__search")).toBeNull();
  });

  it("falls back to search for an unknown deep-link id", () => {
    const { root } = encyclopediaPanel({ encyclopedia, initialEntryId: "no-such-entry", onClose: () => {} });
    document.body.replaceChildren(root);
    expect(root.querySelector(".ency__search")).not.toBeNull();
    expect(root.querySelector(".ency__title")).toBeNull();
  });
});
