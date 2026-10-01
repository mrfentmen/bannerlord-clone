/**
 * MASTER_PLAN task 28: the in-app install prompt. `beforeinstallprompt` shows
 * the game's own banner (never the browser mini-infobar), "Install" consumes
 * the deferred event exactly once, "Not now" persists a dismissal, and
 * `appinstalled` clears the banner. Browsers that never fire the event see
 * nothing.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  DISMISSED_KEY,
  installInstallPrompt,
  resetInstallPromptForTests,
  type BeforeInstallPromptEventLike,
} from "../installPrompt.js";

class FakePrompt extends Event implements BeforeInstallPromptEventLike {
  prompted = 0;
  outcome: "accepted" | "dismissed";
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;

  constructor(outcome: "accepted" | "dismissed" = "accepted") {
    super("beforeinstallprompt", { cancelable: true });
    this.outcome = outcome;
    this.userChoice = Promise.resolve({ outcome });
  }

  prompt(): Promise<void> {
    this.prompted += 1;
    return Promise.resolve();
  }
}

function memStorage(): { store: Record<string, string> } & Pick<Storage, "getItem" | "setItem"> {
  const store: Record<string, string> = {};
  return {
    store,
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
  };
}

describe("install prompt (task 28)", () => {
  let target: EventTarget;
  let storage: ReturnType<typeof memStorage>;

  beforeEach(() => {
    resetInstallPromptForTests();
    document.body.innerHTML = "";
    target = new EventTarget();
    storage = memStorage();
    installInstallPrompt({ target, storage });
  });

  it("shows a first-party banner when the browser offers installation", () => {
    target.dispatchEvent(new FakePrompt());
    const banner = document.querySelector(".install-banner");
    expect(banner).not.toBeNull();
    expect(banner?.getAttribute("role")).toBe("dialog");
    expect(banner?.querySelector(".install-banner__button")?.textContent).toBe("Install");
  });

  it("suppresses the browser mini-infobar", () => {
    const e = new FakePrompt();
    target.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it("consumes the deferred event exactly once on install", () => {
    const e = new FakePrompt("accepted");
    target.dispatchEvent(e);
    document.querySelector<HTMLElement>(".install-banner__button")?.click();
    expect(e.prompted).toBe(1);
    // Second install click is impossible (banner gone) and the event is consumed.
    expect(document.querySelector(".install-banner")).toBeNull();
    target.dispatchEvent(new FakePrompt());
    expect(document.querySelector(".install-banner")).not.toBeNull();
  });

  it("persists dismissal so the banner does not return", () => {
    target.dispatchEvent(new FakePrompt());
    document
      .querySelectorAll<HTMLElement>(".install-banner__button")
      .item(1)
      .click();
    expect(storage.store[DISMISSED_KEY]).toBe("1");
    document.body.innerHTML = "";
    target.dispatchEvent(new FakePrompt());
    expect(document.querySelector(".install-banner")).toBeNull();
  });

  it("clears the banner when the app is installed", () => {
    target.dispatchEvent(new FakePrompt());
    expect(document.querySelector(".install-banner")).not.toBeNull();
    target.dispatchEvent(new Event("appinstalled"));
    expect(document.querySelector(".install-banner")).toBeNull();
    expect(storage.store[DISMISSED_KEY]).toBe("1");
  });

  it("does nothing when the browser never fires the event", () => {
    expect(document.querySelector(".install-banner")).toBeNull();
  });
});
