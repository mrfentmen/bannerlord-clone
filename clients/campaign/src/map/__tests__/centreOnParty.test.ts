/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { createCentreOnParty } from "../centreOnParty.js";
import { createInputRegistry } from "../../input/registry.js";

describe("map centre-on-party control (task 200)", () => {
  it("draws a named button that asks the caller to frame the party", () => {
    const onCentre = vi.fn();
    const { root, destroy } = createCentreOnParty({ onCentre });
    expect(root.tagName).toBe("BUTTON");
    expect(root.getAttribute("aria-label")).toBe("Centre on party");
    (root as HTMLButtonElement).click();
    expect(onCentre).toHaveBeenCalledTimes(1);
    destroy();
  });

  it("draws nothing when there is no party to frame", () => {
    const onCentre = vi.fn();
    const handle = createCentreOnParty({ onCentre, available: false });
    // A button that centres on nothing would promise a view the player cannot get.
    expect(handle.root.querySelector("button")).toBeNull();
    expect(handle.root.getAttribute("data-testid")).toBe("map-centre-on-party-absent");
    expect(onCentre).not.toHaveBeenCalled();
    expect(() => handle.destroy()).not.toThrow();
  });

  it("shows the button by default when availability is not stated", () => {
    const { root } = createCentreOnParty({ onCentre: vi.fn() });
    expect(root.tagName).toBe("BUTTON");
  });

  it("routes through the input registry when given an action id", () => {
    const registry = createInputRegistry();
    registry.registerAction({
      id: "map.centreOnParty",
      label: "Centre on party",
      category: "campaign-map",
      description: "Frames the player's party.",
      defaultKeys: [{ key: " " }],
    });
    const onCentre = vi.fn();
    const handle = createCentreOnParty({
      onCentre,
      inputAction: "map.centreOnParty",
      registry,
    });
    expect(registry.dispatch("map.centreOnParty", "keyboard")).toBe(true);
    expect(onCentre).toHaveBeenCalledTimes(1);
    handle.destroy();
    registry.dispatch("map.centreOnParty", "keyboard");
    expect(onCentre).toHaveBeenCalledTimes(1);
  });

  it("survives an action id the catalog does not declare, with the button intact", () => {
    const registry = createInputRegistry();
    const onCentre = vi.fn();
    const handle = createCentreOnParty({
      onCentre,
      inputAction: "map.notInTheCatalogYet",
      registry,
    });
    (handle.root as HTMLButtonElement).click();
    expect(onCentre).toHaveBeenCalledTimes(1);
  });

  it("does not listen for raw keys — Space belongs to the shared catalog", () => {
    const onCentre = vi.fn();
    const { destroy } = createCentreOnParty({ onCentre });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    // Space is ui.confirm in src/input/actions.ts; a raw listener here would
    // double-fire it against the panel that already owns it.
    expect(onCentre).not.toHaveBeenCalled();
    destroy();
  });

  it("stops firing after destroy", () => {
    const onCentre = vi.fn();
    const handle = createCentreOnParty({ onCentre });
    (handle.root as HTMLButtonElement).click();
    handle.destroy();
    (handle.root as HTMLButtonElement).click();
    expect(onCentre).toHaveBeenCalledTimes(1);
  });

  it("accepts its own testid", () => {
    const { root } = createCentreOnParty({ onCentre: vi.fn(), testId: "photo-centre" });
    expect(root.getAttribute("data-testid")).toBe("photo-centre");
  });
});