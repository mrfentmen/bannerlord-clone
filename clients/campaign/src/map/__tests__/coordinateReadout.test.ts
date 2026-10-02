/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { createCoordinateReadout } from "../coordinateReadout.js";

describe("map coordinate readout (task 198)", () => {
  it("starts hidden, holding no position", () => {
    const readout = createCoordinateReadout();
    expect(readout.root.getAttribute("data-visible")).toBe("false");
    expect(readout.text()).toBe("");
    readout.destroy();
  });

  it("prints the latitude and longitude the caller resolved", () => {
    const readout = createCoordinateReadout();
    readout.set({ lat: 39.9612, lon: -82.9988 });
    expect(readout.text()).toBe("39.9612°, -82.9988°");
    expect(readout.root.getAttribute("data-visible")).toBe("true");
    readout.destroy();
  });

  it("prints to a fixed precision, so the number stops twitching under the cursor", () => {
    const readout = createCoordinateReadout();
    readout.set({ lat: 39.961234567, lon: -82.9987654321 });
    expect(readout.text()).toBe("39.9612°, -82.9988°");
    readout.destroy();
  });

  it("keeps the sign on a western or southern position", () => {
    const readout = createCoordinateReadout();
    readout.set({ lat: -33.8688, lon: -151.2093 });
    expect(readout.text()).toBe("-33.8688°, -151.2093°");
    readout.destroy();
  });

  it("names what is under the pointer when the caller knows", () => {
    const readout = createCoordinateReadout();
    readout.set({ lat: 40, lon: -80, label: "Columbus" });
    expect(readout.root.querySelector('[data-testid="map-readout-label"]')!.textContent).toBe("Columbus");
    expect(readout.root.getAttribute("aria-label")).toBe("Columbus, 40.0000, -80.0000");
    readout.destroy();
  });

  it("announces politely: it changes on every mouse move", () => {
    const readout = createCoordinateReadout();
    expect(readout.root.getAttribute("role")).toBe("status");
    expect(readout.root.getAttribute("aria-live")).toBe("polite");
    readout.destroy();
  });

  it("clears rather than holding the last position", () => {
    const readout = createCoordinateReadout();
    readout.set({ lat: 39.9612, lon: -82.9988, label: "Columbus" });
    readout.set(null);
    expect(readout.text()).toBe("");
    expect(readout.root.getAttribute("data-visible")).toBe("false");
    expect(readout.root.getAttribute("aria-label")).toBeNull();
    readout.destroy();
  });

  it("refuses a position that is not a number rather than printing NaN", () => {
    const readout = createCoordinateReadout();
    readout.set({ lat: Number.NaN, lon: -82.9988 });
    expect(readout.text()).toBe("");
    expect(readout.root.getAttribute("data-visible")).toBe("false");
    readout.set({ lat: 39.96, lon: Number.POSITIVE_INFINITY });
    expect(readout.text()).toBe("");
    readout.destroy();
  });

  it("takes its own testid when asked", () => {
    const readout = createCoordinateReadout({ testId: "photo-coords" });
    expect(readout.root.getAttribute("data-testid")).toBe("photo-coords");
    readout.destroy();
  });

  it("empties itself and leaves the document on destroy", () => {
    const readout = createCoordinateReadout();
    document.body.appendChild(readout.root);
    readout.set({ lat: 1, lon: 2 });
    readout.destroy();
    expect(document.body.contains(readout.root)).toBe(false);
    expect(readout.root.getAttribute("data-visible")).toBe("false");
  });
});