/**
 * @vitest-environment jsdom
 */
/**
 * Tasks 531/535: clicks and switches reach the mixer.
 *
 * The delegation touches real DOM events (`click`, `change`) on real elements
 * and observes `AudioManager.playUiSound` on the singleton, so the assertions
 * cover the same path a press takes in the running app.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { getAudioManager } from "../AudioManager.js";
import { installUiSounds, playVerdictSound } from "../uiSounds.js";

let root: HTMLElement;
let uninstall: () => void;
let spy: MockInstance;

beforeEach(() => {
  root = document.createElement("div");
  document.body.appendChild(root);
  uninstall = installUiSounds(root);
  spy = vi.spyOn(getAudioManager(), "playUiSound").mockImplementation(() => {});
});

afterEach(() => {
  uninstall();
  root.remove();
  vi.restoreAllMocks();
});

describe("global UI sounds (tasks 531/535)", () => {
  it("plays the click for a button, including a click on its label", () => {
    const button = document.createElement("button");
    const label = document.createElement("span");
    label.textContent = "Start";
    button.appendChild(label);
    root.appendChild(button);

    label.click();
    expect(spy).toHaveBeenCalledWith("click");
  });

  it("stays silent for a click outside any button", () => {
    const plain = document.createElement("div");
    root.appendChild(plain);
    plain.click();
    expect(spy).not.toHaveBeenCalled();
  });

  it("plays the toggle when a checkbox flips", () => {
    const box = document.createElement("input");
    box.type = "checkbox";
    root.appendChild(box);

    box.click();
    expect(box.checked).toBe(true);
    expect(spy).toHaveBeenCalledWith("toggle");
  });

  it("does not play the toggle for text fields or sliders", () => {
    const text = document.createElement("input");
    text.type = "text";
    const range = document.createElement("input");
    range.type = "range";
    root.append(text, range);

    text.dispatchEvent(new Event("change", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
    expect(spy).not.toHaveBeenCalled();
  });

  it("ticks when the pointer arrives on a button from outside", () => {
    const button = document.createElement("button");
    const label = document.createElement("span");
    button.appendChild(label);
    root.appendChild(button);

    button.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, relatedTarget: root }));
    label.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, relatedTarget: button }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("hover");
  });

  it("does not re-tick while moving between a button's own children", () => {
    const button = document.createElement("button");
    const first = document.createElement("span");
    const second = document.createElement("span");
    button.append(first, second);
    root.appendChild(button);

    first.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, relatedTarget: button }));
    second.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, relatedTarget: first }));
    expect(spy).not.toHaveBeenCalled();
  });

  it("stays silent for a pointer over a plain element", () => {
    const plain = document.createElement("div");
    root.appendChild(plain);
    plain.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, relatedTarget: root }));
    expect(spy).not.toHaveBeenCalled();
  });

  it("stops listening when uninstalled", () => {
    const button = document.createElement("button");
    root.appendChild(button);
    uninstall();
    uninstall = () => {};

    button.click();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("accept/refuse verdict sounds (tasks 533/534)", () => {
  it("chimes when an action is accepted", () => {
    playVerdictSound(true);
    expect(spy).toHaveBeenCalledWith("confirm");
  });

  it("buzzes when an action is refused", () => {
    playVerdictSound(false);
    expect(spy).toHaveBeenCalledWith("error");
  });
});
