/**
 * The notification center lists every notice, filters by priority and kind, and
 * links each notice to the Why chain and, where the entity is a settlement, to
 * the town panel. Tested with real Notification records, not placeholders.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest";
import { notificationsPanel } from "../NotificationsPanel.js";
import type { Notification } from "../../../data/types.js";

function notice(partial: Partial<Notification> & { id: string }): Notification {
  return {
    day: 3,
    priority: "informational",
    text: "Something happened.",
    entityId: null,
    field: null,
    ...partial,
  };
}

function options(ns: Notification[]) {
  return {
    notifications: ns,
    townIds: new Set(["t-golden"]),
    onWhy: vi.fn(),
    onViewSettlement: vi.fn(),
    onClose: vi.fn(),
  };
}

describe("notificationsPanel", () => {
  it("lists every notice, most urgent first", () => {
    const ns = [
      notice({ id: "n1", priority: "informational", day: 1, text: "Mild news." }),
      notice({ id: "n2", priority: "critical", day: 1, text: "Urgent news." }),
      notice({ id: "n3", priority: "important", day: 5, text: "Notable news." }),
    ];
    const { root } = notificationsPanel(options(ns));
    const items = [...root.querySelectorAll("[data-testid^='notice-center-']")].map((el) =>
      el.getAttribute("data-testid"),
    );
    expect(items).toEqual(["notice-center-n2", "notice-center-n3", "notice-center-n1"]);
  });

  it("filters by priority and kind without losing the list", () => {
    const ns = [
      notice({ id: "n1", priority: "critical", kind: "battle", text: "A battle." }),
      notice({ id: "n2", priority: "informational", kind: "siege", text: "A siege." }),
    ];
    const opts = options(ns);
    const { root } = notificationsPanel(opts);
    const priority = root.querySelector<HTMLSelectElement>("[data-testid='notifications-filter-priority']")!;
    priority.value = "critical";
    priority.dispatchEvent(new Event("change"));
    expect(root.querySelector("[data-testid='notice-center-n1']")).not.toBeNull();
    expect(root.querySelector("[data-testid='notice-center-n2']")).toBeNull();
    const kind = root.querySelector<HTMLSelectElement>("[data-testid='notifications-filter-kind']")!;
    kind.value = "siege";
    kind.dispatchEvent(new Event("change"));
    expect(root.querySelector("[data-testid='notice-center-n1']")).toBeNull();
  });

  it("opens the Why chain for a notice with an entity and field", () => {
    const ns = [notice({ id: "n1", entityId: "t-golden", field: "unrest", text: "Unrest rises." })];
    const opts = options(ns);
    const { root } = notificationsPanel(opts);
    root.querySelector<HTMLButtonElement>("[data-testid='notice-why-n1']")!.click();
    expect(opts.onWhy).toHaveBeenCalledWith("t-golden", "unrest");
  });

  it("offers a settlement jump only when the entity is a town", () => {
    const ns = [
      notice({ id: "n1", entityId: "t-golden", field: "unrest", text: "Unrest rises." }),
      notice({ id: "n2", entityId: "party-1", field: "food", text: "Low food." }),
    ];
    const opts = options(ns);
    const { root } = notificationsPanel(opts);
    root.querySelector<HTMLButtonElement>("[data-testid='notice-town-n1']")!.click();
    expect(opts.onViewSettlement).toHaveBeenCalledWith("t-golden");
    expect(root.querySelector("[data-testid='notice-town-n2']")).toBeNull();
  });

  it("says plainly when there is nothing to show", () => {
    const { root } = notificationsPanel(options([]));
    expect(root.textContent).toContain("No notices yet.");
  });
});
