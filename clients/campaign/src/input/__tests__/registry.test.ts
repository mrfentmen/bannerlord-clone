/**
 * The input registry's contract: chords route to actions, guards gate them, bindings
 * are data the editor can rewrite.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest";
import { ACTION_DEFS } from "../actions.js";
import { createInputRegistry } from "../registry.js";

function key(key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key,
    ctrlKey: !!mods.ctrl,
    shiftKey: !!mods.shift,
    altKey: !!mods.alt,
    bubbles: true,
    cancelable: true,
  });
}

describe("input registry", () => {
  it("routes a default chord to its action", () => {
    const input = createInputRegistry();
    const seen: string[] = [];
    input.on("ui.cancel", (ev) => seen.push(ev.id));
    expect(input.handleKeyEvent(key("Escape"))).toBe(true);
    expect(seen).toEqual(["ui.cancel"]);
  });

  it("ignores keys with no binding", () => {
    const input = createInputRegistry();
    const handler = vi.fn();
    input.on("ui.cancel", handler);
    expect(input.handleKeyEvent(key("F9"))).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("distinguishes chords by modifiers", () => {
    const input = createInputRegistry();
    const next = vi.fn();
    const prev = vi.fn();
    input.on("map.nextSettlement", next);
    input.on("map.prevSettlement", prev);
    input.handleKeyEvent(key("Tab"));
    expect(next).toHaveBeenCalledTimes(1);
    expect(prev).not.toHaveBeenCalled();
    input.handleKeyEvent(key("Tab", { shift: true }));
    expect(prev).toHaveBeenCalledTimes(1);
  });

  it("respects the when guard: a blocked handler does not swallow the key", () => {
    const input = createInputRegistry();
    const blocked = vi.fn();
    input.on("map.nextSettlement", blocked, { when: () => false });
    // No other action claims plain Tab, so nothing fires and the key is unconsumed.
    expect(input.handleKeyEvent(key("Tab"))).toBe(false);
    expect(blocked).not.toHaveBeenCalled();
  });

  it("a passing guard lets the action fire", () => {
    const input = createInputRegistry();
    const handler = vi.fn();
    input.on("map.nextSettlement", handler, { when: () => true });
    expect(input.handleKeyEvent(key("Tab"))).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("unsubscribing stops the handler", () => {
    const input = createInputRegistry();
    const handler = vi.fn();
    const off = input.on("ui.cancel", handler);
    off();
    input.handleKeyEvent(key("Escape"));
    expect(handler).not.toHaveBeenCalled();
  });

  it("preventDefault is called for actions that ask for it", () => {
    const input = createInputRegistry();
    input.on("map.nextSettlement", () => {});
    const ev = key("Tab");
    input.handleKeyEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("preventDefault is NOT called for Escape, so it keeps working in text fields", () => {
    const input = createInputRegistry();
    input.on("ui.cancel", () => {});
    const ev = key("Escape");
    input.handleKeyEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("setBinding rewires the chord and reports conflicts", () => {
    const input = createInputRegistry();
    const attack = vi.fn();
    input.on("battle.orderAttack", attack);
    // Rebind attack onto Escape: conflicts with ui.cancel.
    const conflicts = input.setBinding("battle.orderAttack", [{ key: "Escape" }]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.conflictsWith).toEqual(["ui.cancel"]);
    // Both still fire: the registry never silently drops an order.
    const cancel = vi.fn();
    input.on("ui.cancel", cancel);
    input.handleKeyEvent(key("Escape"));
    expect(attack).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("resetAction restores the default chord", () => {
    const input = createInputRegistry();
    input.setBinding("ui.cancel", [{ key: "F9" }]);
    expect(input.bindingFor("ui.cancel")).toEqual([{ key: "F9" }]);
    input.resetAction("ui.cancel");
    expect(input.bindingFor("ui.cancel")).toEqual([{ key: "Escape" }]);
  });

  it("serialize/load round-trips custom bindings and drops unknown actions", () => {
    const input = createInputRegistry();
    input.setBinding("ui.cancel", [{ key: "F9" }]);
    const data = input.serialize();
    const other = createInputRegistry();
    other.load({ ...data, "nope.notReal": [{ key: "x" }] });
    expect(other.bindingFor("ui.cancel")).toEqual([{ key: "F9" }]);
    expect(other.bindingFor("ui.confirm")).toEqual([{ key: "Enter" }]);
  });

  it("suspend stops all dispatch; resume restores it", () => {
    const input = createInputRegistry();
    const handler = vi.fn();
    input.on("ui.cancel", handler);
    input.suspend();
    expect(input.suspended).toBe(true);
    expect(input.handleKeyEvent(key("Escape"))).toBe(false);
    expect(input.dispatch("ui.cancel", "api")).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    input.resume();
    expect(input.handleKeyEvent(key("Escape"))).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("gamepad buttons route through the same actions", () => {
    const input = createInputRegistry();
    const cancel = vi.fn();
    input.on("ui.cancel", cancel);
    // Button 1 (B/circle) is ui.cancel's default gamepad binding.
    expect(input.handleGamepadButton(1, true)).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(input.handleGamepadButton(1, false)).toBe(false);
    expect(input.handleGamepadButton(9, true)).toBe(false);
  });

  it("registerAction adds a module action; re-registering an owned id throws", () => {
    const input = createInputRegistry();
    input.registerAction({
      id: "battle.setControlGroup1",
      label: "Control group 1",
      category: "battle-command",
      description: "Binds the selection to control group 1.",
      defaultKeys: [{ key: "1", ctrl: true }],
    });
    const fired = vi.fn();
    input.on("battle.setControlGroup1", fired);
    expect(input.handleKeyEvent(key("1", { ctrl: true }))).toBe(true);
    expect(fired).toHaveBeenCalledTimes(1);
    expect(() =>
      input.registerAction({
        id: "battle.ping",
        label: "x",
        category: "battle-command",
        description: "x",
        defaultKeys: [],
      }),
    ).toThrow(/already registered/);
  });

  it("on with an unknown action id throws fast", () => {
    const input = createInputRegistry();
    expect(() => input.on("nope.notReal", () => {})).toThrow();
  });

  it("notifies binding listeners on change", () => {
    const input = createInputRegistry();
    const changed = vi.fn();
    const off = input.onBindingsChanged(changed);
    input.setBinding("ui.cancel", [{ key: "F9" }]);
    expect(changed).toHaveBeenCalledTimes(1);
    off();
    input.resetAction("ui.cancel");
    expect(changed).toHaveBeenCalledTimes(1);
  });
});

describe("key release routing", () => {
  it("onRelease fires on keyup through the same bindings", () => {
    const input = createInputRegistry();
    const pressed = vi.fn();
    const released = vi.fn();
    input.on("battle.commandMenu", pressed);
    input.onRelease("battle.commandMenu", released);
    expect(input.handleKeyEvent(key(" "))).toBe(true);
    expect(pressed).toHaveBeenCalledTimes(1);
    expect(released).not.toHaveBeenCalled();
    expect(input.handleKeyUp(key(" "))).toBe(true);
    expect(released).toHaveBeenCalledTimes(1);
    expect(pressed).toHaveBeenCalledTimes(1);
  });

  it("dispatchRelease fires release handlers directly", () => {
    const input = createInputRegistry();
    const released = vi.fn();
    input.onRelease("battle.commandMenu", released);
    expect(input.dispatchRelease("battle.commandMenu", "keyboard")).toBe(true);
    expect(released).toHaveBeenCalledTimes(1);
  });

  it("release handlers respect when-guards and suspension", () => {
    const input = createInputRegistry();
    const released = vi.fn();
    input.onRelease("battle.commandMenu", released, { when: () => false });
    expect(input.handleKeyUp(key(" "))).toBe(false);
    expect(released).not.toHaveBeenCalled();
    input.suspend();
    expect(input.handleKeyUp(key(" "))).toBe(false);
    input.resume();
  });

  it("onRelease with an unknown action id throws fast", () => {
    const input = createInputRegistry();
    expect(() => input.onRelease("nope.notReal", () => {})).toThrow();
  });

  it("the interface hotkeys ship bound: clan L, party P, journal J (tasks 245, 141, 766)", () => {
    const byId = new Map(ACTION_DEFS.map((d) => [d.id, d]));
    expect(byId.get("ui.clan")?.defaultKeys).toEqual([{ key: "l" }]);
    expect(byId.get("ui.party")?.defaultKeys).toEqual([{ key: "p" }]);
    expect(byId.get("ui.journal")?.defaultKeys).toEqual([{ key: "j" }]);
    const input = createInputRegistry();
    const opened: string[] = [];
    input.on("ui.party", () => opened.push("party"));
    input.on("ui.journal", () => opened.push("journal"));
    input.handleKeyEvent(key("p"));
    input.handleKeyEvent(key("j"));
    expect(opened).toEqual(["party", "journal"]);
  });
});
