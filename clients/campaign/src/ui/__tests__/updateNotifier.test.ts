/**
 * MASTER_PLAN task 29: the update notifier polls /build.json and offers a
 * reload when the served build hash stops matching the running bundle. It
 * never reloads on its own, and it stays silent when the check fails.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkForUpdatesNow,
  installUpdateNotifier,
  isNewerBuild,
  resetUpdateNotifierForTests,
} from "../updateNotifier.js";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("update notifier (task 29)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetUpdateNotifierForTests();
    document.body.innerHTML = "";
  });

  it("compares hashes purely", () => {
    expect(isNewerBuild("a", "b")).toBe(true);
    expect(isNewerBuild("a", "a")).toBe(false);
    expect(isNewerBuild("a", "")).toBe(false);
    expect(isNewerBuild("a", undefined)).toBe(false);
    expect(isNewerBuild("a", 42)).toBe(false);
  });

  it("offers a reload when the served hash differs", async () => {
    const reload = vi.fn();
    await checkForUpdatesNow({
      currentHash: "old",
      fetch: () => Promise.resolve(jsonResponse({ hash: "new" })),
      reload,
    });
    const banner = document.querySelector(".update-banner");
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("new version");
    (banner?.querySelector(".update-banner__button") as HTMLButtonElement).click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("stays silent when the hashes match", async () => {
    await checkForUpdatesNow({
      currentHash: "same",
      fetch: () => Promise.resolve(jsonResponse({ hash: "same" })),
    });
    expect(document.querySelector(".update-banner")).toBeNull();
  });

  it("stays silent when the check fails", async () => {
    await checkForUpdatesNow({
      currentHash: "old",
      fetch: () => Promise.reject(new Error("offline")),
    });
    expect(document.querySelector(".update-banner")).toBeNull();

    await checkForUpdatesNow({
      currentHash: "old",
      fetch: () => Promise.resolve(jsonResponse({ nope: 1 })),
    });
    expect(document.querySelector(".update-banner")).toBeNull();

    await checkForUpdatesNow({
      currentHash: "old",
      fetch: () => Promise.resolve(jsonResponse({ hash: "new" }, false)),
    });
    expect(document.querySelector(".update-banner")).toBeNull();
  });

  it("dismisses without reloading", async () => {
    await checkForUpdatesNow({
      currentHash: "old",
      fetch: () => Promise.resolve(jsonResponse({ hash: "new" })),
      reload: vi.fn(),
    });
    const dismiss = document.querySelector(".update-banner__button--quiet") as HTMLButtonElement;
    dismiss.click();
    expect(document.querySelector(".update-banner")).toBeNull();
  });

  it("polls on an interval once installed", async () => {
    const fetch = vi.fn(() => Promise.resolve(jsonResponse({ hash: "same" })));
    installUpdateNotifier({ currentHash: "same", fetch, pollIntervalMs: 1000, skipInDev: false });
    installUpdateNotifier({ currentHash: "same", fetch, pollIntervalMs: 1000, skipInDev: false });
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(4);
  });
});
