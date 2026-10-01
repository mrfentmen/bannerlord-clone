/**
 * Codex panel DOM smoke test.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { ALL_CODEX_ENTRIES } from "../../../codex/index.js";
import { codexPanel } from "../Codex.js";

function setup() {
  const root = codexPanel();
  document.body.append(root);
  return root;
}

describe("codexPanel", () => {
  it("renders the full corpus and a live count", () => {
    const root = setup();
    try {
      expect(root.querySelectorAll(".codex__row").length).toBe(ALL_CODEX_ENTRIES.length);
      expect(root.querySelector(".codex__live")?.textContent).toMatch(/entries/);
    } finally {
      root.remove();
    }
  });

  it("filters by category tab", () => {
    const root = setup();
    try {
      const expected = ALL_CODEX_ENTRIES.filter((en) => en.category === "settings").length;
      (root.querySelector('[data-testid="codex-tab-settings"]') as HTMLButtonElement).click();
      expect(root.querySelectorAll(".codex__row").length).toBe(expected);
    } finally {
      root.remove();
    }
  });

  it("searches across title, tags, summary, and body", () => {
    const root = setup();
    try {
      const search = root.querySelector('[data-testid="codex-search"]') as HTMLInputElement;
      search.value = "deployment";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      const rows = root.querySelectorAll(".codex__row");
      expect(rows.length).toBeGreaterThan(0);
      expect(
        [...rows].some((r) => r.getAttribute("data-testid") === "codex-row-mechanic-deployment"),
      ).toBe(true);
    } finally {
      root.remove();
    }
  });

  it("shows the detail view and follows related links", () => {
    const root = setup();
    try {
      (root.querySelector('[data-testid="codex-row-mechanic-deployment"]') as HTMLButtonElement).click();
      const detail = root.querySelector('[data-testid="codex-detail"]');
      expect(detail?.querySelector(".codex__title")?.textContent).toBe("Deployment map");
      const rel = detail?.querySelector(".codex__rel-link") as HTMLButtonElement;
      expect(rel).not.toBeNull();
      rel.click();
      expect(root.querySelector(".codex__title")?.textContent).not.toBe("Deployment map");
    } finally {
      root.remove();
    }
  });

  it("shows an empty state when nothing matches", () => {
    const root = setup();
    try {
      const search = root.querySelector('[data-testid="codex-search"]') as HTMLInputElement;
      search.value = "zzz-no-such-entry";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      expect(root.querySelectorAll(".codex__row").length).toBe(0);
      expect(root.textContent).toMatch(/Nothing in the codex matches/);
    } finally {
      root.remove();
    }
  });

  it("calls onClose when the panel closes", () => {
    let closed = 0;
    const root = codexPanel({ onClose: () => { closed++; } });
    document.body.append(root);
    try {
      (root.querySelector('[aria-label="Close Codex"]') as HTMLButtonElement).click();
      expect(closed).toBe(1);
    } finally {
      root.remove();
    }
  });
});
