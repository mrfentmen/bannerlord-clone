/**
 * Toast notifications (mandate §19): transient, capped, announced.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest";
import { Toast } from "../toast.js";

describe("Toast", () => {
  it("shows a title and text, announced as a status", () => {
    vi.useFakeTimers();
    try {
      const root = document.createElement("div");
      document.body.replaceChildren(root);
      const toast = new Toast(root);
      toast.show("Objective complete", "Muster a warband");
      const el = root.querySelector(".toast")!;
      expect(el.getAttribute("role")).toBe("status");
      expect(el.textContent).toContain("Objective complete");
      expect(el.textContent).toContain("Muster a warband");
      // Auto-dismisses after the timeout.
      vi.advanceTimersByTime(5000);
      expect(root.querySelector(".toast")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("caps the stack at three", () => {
    vi.useFakeTimers();
    try {
      const root = document.createElement("div");
      document.body.replaceChildren(root);
      const toast = new Toast(root);
      for (let i = 0; i < 5; i += 1) toast.show(`Title ${i}`, `Text ${i}`);
      expect(root.querySelectorAll(".toast")).toHaveLength(3);
      // The newest survive.
      expect(root.textContent).toContain("Title 4");
      expect(root.textContent).not.toContain("Title 0");
    } finally {
      vi.useRealTimers();
    }
  });
});
