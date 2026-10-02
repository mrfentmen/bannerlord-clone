/**
 * Task 73: veteran unit naming — validation and the rename seam.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import { cleanVeteranName, createVeteranNamePanel, VETERAN_NAME_MAX } from "../veteranNames.js";

describe("cleanVeteranName (task 73)", () => {
  it("trims and collapses whitespace", () => {
    expect(cleanVeteranName("  Iron   Wolves ")).toBe("Iron Wolves");
  });

  it("rejects empty and over-long names", () => {
    expect(cleanVeteranName("")).toBeNull();
    expect(cleanVeteranName("   ")).toBeNull();
    expect(cleanVeteranName("x".repeat(VETERAN_NAME_MAX + 1))).toBeNull();
    expect(cleanVeteranName("x".repeat(VETERAN_NAME_MAX))).toBe("x".repeat(VETERAN_NAME_MAX));
    expect(cleanVeteranName(42)).toBeNull();
  });
});

describe("veteran name panel (task 73)", () => {
  it("prefills the current name and renames through onRename", () => {
    let saved = "Sergeant";
    const panel = createVeteranNamePanel(
      { id: "u1", label: "Veteran Sergeant — 12 kills" },
      { getName: () => saved, onRename: (n) => (saved = n) },
    );
    document.body.append(panel.root);
    try {
      const input = panel.root.querySelector("input") as HTMLInputElement;
      expect(input.value).toBe("Sergeant");
      input.value = "  Asha's Iron Wolves  ";
      (panel.root.querySelector(".btn") as HTMLButtonElement).click();
      expect(saved).toBe("Asha's Iron Wolves"); // persisted via the seam
    } finally {
      panel.destroy();
    }
  });

  it("shows an error instead of saving a bad name", () => {
    let saved = "Sergeant";
    const panel = createVeteranNamePanel(
      { id: "u1", label: "Veteran" },
      { getName: () => saved, onRename: (n) => (saved = n) },
    );
    document.body.append(panel.root);
    try {
      const input = panel.root.querySelector("input") as HTMLInputElement;
      input.value = "   ";
      (panel.root.querySelector(".btn") as HTMLButtonElement).click();
      expect(saved).toBe("Sergeant");
      const err = panel.root.querySelector(".aa-veteran-name-error") as HTMLElement;
      expect(err.hidden).toBe(false);
    } finally {
      panel.destroy();
    }
  });
});
