/**
 * @vitest-environment jsdom
 *
 * Gamepad focus-navigation tests (MASTER_PLAN task 1).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { focusableElements, focusFirst, moveFocus } from "../nav.js";

function rect(x: number, y: number, w = 100, h = 40): DOMRect {
  return {
    x,
    y,
    width: w,
    height: h,
    top: y,
    left: x,
    right: x + w,
    bottom: y + h,
    toJSON: () => ({}),
  } as DOMRect;
}

function layOut(el: HTMLElement, x: number, y: number, w = 100, h = 40): void {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue(rect(x, y, w, h));
}

describe("gamepad focus navigation (task 1)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("collects focusables and skips disabled/hidden ones", () => {
    document.body.innerHTML = `
      <button id="a">A</button>
      <button id="b" disabled>B</button>
      <button id="c" hidden>C</button>
      <a id="d" href="#">D</a>
      <div id="e" tabindex="0">E</div>
      <div id="f" tabindex="-1">F</div>
    `;
    const ids = focusableElements().map((el) => el.id);
    expect(ids).toEqual(["a", "d", "e"]);
  });

  it("focuses the topmost element when nothing is focused", () => {
    document.body.innerHTML = `<button id="low">Low</button><button id="high">High</button>`;
    const low = document.getElementById("low")!;
    const high = document.getElementById("high")!;
    layOut(low, 0, 200);
    layOut(high, 0, 50);
    const focused = moveFocus("down");
    expect(focused?.id).toBe("high");
    expect(document.activeElement?.id).toBe("high");
  });

  it("moves down to the nearest element below", () => {
    document.body.innerHTML = `
      <button id="top">Top</button>
      <button id="mid">Mid</button>
      <button id="far">Far</button>
    `;
    const top = document.getElementById("top")!;
    const mid = document.getElementById("mid")!;
    const far = document.getElementById("far")!;
    layOut(top, 0, 0);
    layOut(mid, 0, 100);
    layOut(far, 0, 500);
    top.focus();
    expect(moveFocus("down")?.id).toBe("mid");
    expect(moveFocus("down")?.id).toBe("far");
  });

  it("prefers the closest in the perpendicular axis", () => {
    document.body.innerHTML = `
      <button id="top">Top</button>
      <button id="aligned">Aligned</button>
      <button id="offset">Offset</button>
    `;
    const top = document.getElementById("top")!;
    const aligned = document.getElementById("aligned")!;
    const offset = document.getElementById("offset")!;
    layOut(top, 100, 0);
    layOut(aligned, 100, 100);
    layOut(offset, 400, 110);
    top.focus();
    expect(moveFocus("down")?.id).toBe("aligned");
  });

  it("moves in all four directions and stays put at the edge", () => {
    document.body.innerHTML = `
      <button id="n">N</button><button id="s">S</button>
      <button id="w">W</button><button id="e">E</button>
    `;
    const n = document.getElementById("n")!;
    const s = document.getElementById("s")!;
    const w = document.getElementById("w")!;
    const e = document.getElementById("e")!;
    layOut(n, 100, 0, 80, 40);
    layOut(s, 100, 200, 80, 40);
    layOut(w, 0, 100, 80, 40);
    layOut(e, 220, 100, 80, 40);
    const center = document.createElement("button");
    center.id = "c";
    document.body.appendChild(center);
    layOut(center, 100, 100, 80, 40);
    center.focus();
    expect(moveFocus("up")?.id).toBe("n");
    expect(moveFocus("down")?.id).toBe("c");
    center.focus();
    expect(moveFocus("left")?.id).toBe("w");
    center.focus();
    expect(moveFocus("right")?.id).toBe("e");
    n.focus();
    expect(moveFocus("up")).toBeNull();
    expect(document.activeElement?.id).toBe("n");
  });

  it("returns null when nothing is focusable", () => {
    document.body.innerHTML = `<p>no controls</p>`;
    expect(moveFocus("down")).toBeNull();
    expect(focusFirst()).toBeNull();
  });
});
