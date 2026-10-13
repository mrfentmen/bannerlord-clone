/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetModalStackForTests,
  focusableIn,
  modalDepth,
  pushModal,
  trapFocus,
} from "../focusTrap.js";

afterEach(() => {
  _resetModalStackForTests();
  document.body.replaceChildren();
});

// jsdom never lays out, so offsetParent is always null. Stub it on the
// elements under test so focusableIn behaves like a real browser.
function markVisible(...els: HTMLElement[]): void {
  for (const el of els) {
    Object.defineProperty(el, "offsetParent", { value: document.body, configurable: true });
  }
}

function press(key: string, shift = false, target: EventTarget = document): void {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, shiftKey: shift, bubbles: true, cancelable: true }),
  );
}

describe("modal focus trap + Escape stack (solo task 17)", () => {
  it("focusableIn finds enabled controls and skips disabled ones", () => {
    document.body.innerHTML = `<div id="d"><button id="ok">ok</button><button id="no" disabled>no</button><span id="t" tabindex="0">t</span></div>`;
    const d = document.getElementById("d")!;
    markVisible(...([...d.querySelectorAll("button, span")] as HTMLElement[]));
    const ids = focusableIn(d).map((el) => el.id).sort();
    expect(ids).toEqual(["ok", "t"]);
  });

  it("wraps Tab from last back to first inside the dialog", () => {
    document.body.innerHTML = `<div id="dlg"><button id="a">a</button><button id="b">b</button></div>`;
    const dlg = document.getElementById("dlg") as HTMLElement;
    const a = document.getElementById("a") as HTMLElement;
    const b = document.getElementById("b") as HTMLElement;
    markVisible(a, b);
    const release = trapFocus(dlg);
    b.focus();
    // Tab on the last element wraps to the first.
    b.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(a);
    // Shift+Tab on the first wraps to the last.
    a.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(b);
    release();
  });

  it("Escape closes only the topmost modal", () => {
    const first = vi.fn();
    const second = vi.fn();
    document.body.innerHTML = `<div id="m1"></div><div id="m2"></div>`;
    pushModal({ element: document.getElementById("m1") as HTMLElement, onClose: first });
    const releaseSecond = pushModal({
      element: document.getElementById("m2") as HTMLElement,
      onClose: second,
    });
    expect(modalDepth()).toBe(2);
    press("Escape");
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    // Simulate the unmount releasing its entry.
    releaseSecond();
    expect(modalDepth()).toBe(1);
    press("Escape");
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("release is idempotent and Escape on an empty stack is a no-op", () => {
    const onClose = vi.fn();
    document.body.innerHTML = `<div id="m"></div>`;
    const release = pushModal({
      element: document.getElementById("m") as HTMLElement,
      onClose,
    });
    release();
    release();
    expect(modalDepth()).toBe(0);
    expect(() => press("Escape")).not.toThrow();
    expect(onClose).not.toHaveBeenCalled();
  });
});
