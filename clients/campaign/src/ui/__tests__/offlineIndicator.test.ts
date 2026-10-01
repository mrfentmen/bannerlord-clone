/**
 * MASTER_PLAN task 27: the offline indicator appears within five seconds of
 * losing connectivity (event-driven, with a 2s poll as backstop) and confirms
 * when the connection returns.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installOfflineIndicator,
  resetOfflineIndicatorForTests,
} from "../offlineIndicator.js";

let online = true;
Object.defineProperty(window.navigator, "onLine", {
  configurable: true,
  get: () => online,
});

describe("offline indicator (task 27)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    online = true;
    resetOfflineIndicatorForTests();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    resetOfflineIndicatorForTests();
    vi.useRealTimers();
  });

  it("shows a banner when the browser fires offline", () => {
    installOfflineIndicator();
    online = false;
    window.dispatchEvent(new Event("offline"));
    const banner = document.querySelector(".offline-banner:not(.offline-banner--back)");
    expect(banner).not.toBeNull();
    expect(banner?.getAttribute("role")).toBe("status");
    expect(banner?.textContent).toContain("offline");
  });

  it("detects loss via the poll even without the event, within 5s", () => {
    installOfflineIndicator({ pollIntervalMs: 2000 });
    online = false; // no event dispatched
    vi.advanceTimersByTime(2000);
    expect(document.querySelector(".offline-banner")).not.toBeNull();
    // Worst case: just under one poll interval after the drop.
    vi.advanceTimersByTime(3000);
    expect(document.querySelectorAll(".offline-banner")).toHaveLength(1);
  });

  it("clears the banner and confirms on reconnect", () => {
    installOfflineIndicator();
    online = false;
    window.dispatchEvent(new Event("offline"));
    expect(document.querySelector(".offline-banner")).not.toBeNull();

    online = true;
    window.dispatchEvent(new Event("online"));
    expect(document.querySelector(".offline-banner:not(.offline-banner--back)")).toBeNull();
    const back = document.querySelector(".offline-banner--back");
    expect(back?.textContent).toContain("Back online");

    vi.advanceTimersByTime(4000);
    expect(document.querySelector(".offline-banner--back")).toBeNull();
  });

  it("starts with the banner when booting offline", () => {
    online = false;
    installOfflineIndicator();
    expect(document.querySelector(".offline-banner")).not.toBeNull();
  });

  it("never stacks duplicate banners", () => {
    installOfflineIndicator();
    online = false;
    window.dispatchEvent(new Event("offline"));
    vi.advanceTimersByTime(10000);
    expect(document.querySelectorAll(".offline-banner:not(.offline-banner--back)")).toHaveLength(1);
  });
});
