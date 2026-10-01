/**
 * The input registry: one funnel for every gameplay action.
 *
 * Keyboard, gamepad, and touch all arrive here and leave as action ids. Game code
 * subscribes to actions; it never reads `KeyboardEvent` itself.
 *
 * Bindings are data, not code: `setBinding` changes them at runtime (the keybinding
 * editor), `serialize`/`load` persist them (the settings store). Two actions sharing
 * one chord is a conflict the editor surfaces — the registry reports it and still
 * dispatches to both, because silently dropping an order is worse than a double
 * dispatch the player can see and fix.
 */

import { ACTION_DEFS, type ActionDef, type KeyBinding } from "./actions.js";

export type InputSource = "keyboard" | "gamepad" | "touch" | "api";

export interface ActionEvent {
  /** Which action fired. */
  id: string;
  /** Where the press came from. */
  source: InputSource;
  /** The raw keyboard event, present only for keyboard-sourced actions. */
  keyEvent?: KeyboardEvent | undefined;
}

export type ActionHandler = (ev: ActionEvent) => void;

export interface HandlerOptions {
  /**
   * Guard evaluated at dispatch time. The Tab-cycles-settlements handler passes
   * `() => mapCanvas === document.activeElement` so Tab keeps its normal meaning
   * inside panels.
   */
  when?: () => boolean;
}

/** Two actions claiming the same chord. */
export interface BindingConflict {
  action: string;
  key: KeyBinding;
  conflictsWith: string[];
}

interface HandlerEntry {
  handler: ActionHandler;
  when?: (() => boolean) | undefined;
}

const sameChord = (a: KeyBinding, b: KeyBinding): boolean =>
  a.key.toLowerCase() === b.key.toLowerCase() &&
  !!a.ctrl === !!b.ctrl &&
  !!a.shift === !!b.shift &&
  !!a.alt === !!b.alt;

export interface InputRegistry {
  /** Subscribe to an action. Returns an unsubscribe function. */
  on(id: string, handler: ActionHandler, opts?: HandlerOptions): () => void;
  /** Subscribe to an action's key release (hold-to-open patterns). */
  onRelease(id: string, handler: ActionHandler, opts?: HandlerOptions): () => void;
  /** Fire an action directly (gamepad/touch layers, tests). */
  dispatch(id: string, source: InputSource, keyEvent?: KeyboardEvent): boolean;
  /** Fire an action's release handlers directly. */
  dispatchRelease(id: string, source: InputSource, keyEvent?: KeyboardEvent): boolean;
  /**
   * Match a keyboard event against the bindings and dispatch. Returns true when an
   * action fired. Calls `preventDefault()` on the event when the fired action asks
   * for it. No-ops while suspended.
   */
  handleKeyEvent(ev: KeyboardEvent): boolean;
  /**
   * Match a key release against the bindings and dispatch to release handlers.
   * Returns true when a release handler fired. No-ops while suspended.
   */
  handleKeyUp(ev: KeyboardEvent): boolean;
  /** Gamepad button index pressed/released; dispatches the mapped action on press. */
  handleGamepadButton(index: number, pressed: boolean, gamepadIndex?: number): boolean;
  /** All known actions, catalog first then runtime-registered. */
  actions(): ActionDef[];
  /** Register an action a module defines (battle modes add theirs at load). */
  registerAction(def: ActionDef): void;
  bindingFor(id: string): KeyBinding[];
  /** Replace an action's chords. Returns the conflicts the new chords create. */
  setBinding(id: string, keys: KeyBinding[]): BindingConflict[];
  resetAction(id: string): void;
  resetAllBindings(): void;
  onBindingsChanged(fn: () => void): () => void;
  /** Temporarily stop dispatching (the keybinding editor suspends while capturing). */
  suspend(): void;
  resume(): void;
  readonly suspended: boolean;
  /** For the settings store. */
  serialize(): Record<string, KeyBinding[]>;
  load(data: Record<string, KeyBinding[]>): void;
}

export function createInputRegistry(): InputRegistry {
  const defs = new Map<string, ActionDef>();
  for (const d of ACTION_DEFS) defs.set(d.id, d);

  const handlers = new Map<string, HandlerEntry[]>();
  const releaseHandlers = new Map<string, HandlerEntry[]>();
  const bindings = new Map<string, KeyBinding[]>();
  const changed = new Set<() => void>();
  let suspended = false;

  function dispatchTo(
    map: Map<string, HandlerEntry[]>,
    id: string,
    source: InputSource,
    keyEvent?: KeyboardEvent,
  ): boolean {
    if (suspended) return false;
    const list = map.get(id);
    if (!list || list.length === 0) return false;
    const ev: ActionEvent = { id, source, keyEvent };
    let fired = false;
    for (const { handler, when } of list) {
      if (when && !when()) continue;
      handler(ev);
      fired = true;
    }
    return fired;
  }

  const currentBindings = (id: string): KeyBinding[] =>
    bindings.get(id) ?? defs.get(id)?.defaultKeys ?? [];

  const emitChanged = (): void => {
    for (const fn of changed) fn();
  };

  const registry: InputRegistry = {
    on(id, handler, opts) {
      if (!defs.has(id)) throw new Error(`[input] unknown action id: ${id}`);
      const list = handlers.get(id) ?? [];
      const entry: HandlerEntry = { handler, when: opts?.when };
      list.push(entry);
      handlers.set(id, list);
      return () => {
        const l = handlers.get(id);
        if (!l) return;
        const at = l.indexOf(entry);
        if (at >= 0) l.splice(at, 1);
      };
    },

    onRelease(id, handler, opts) {
      if (!defs.has(id)) throw new Error(`[input] unknown action id: ${id}`);
      const list = releaseHandlers.get(id) ?? [];
      const entry: HandlerEntry = { handler, when: opts?.when };
      list.push(entry);
      releaseHandlers.set(id, list);
      return () => {
        const l = releaseHandlers.get(id);
        if (!l) return;
        const at = l.indexOf(entry);
        if (at >= 0) l.splice(at, 1);
      };
    },

    dispatch(id, source, keyEvent) {
      return dispatchTo(handlers, id, source, keyEvent);
    },

    dispatchRelease(id, source, keyEvent) {
      return dispatchTo(releaseHandlers, id, source, keyEvent);
    },

    handleKeyEvent(ev) {
      if (suspended) return false;
      const chord: KeyBinding = { key: ev.key, ctrl: ev.ctrlKey, shift: ev.shiftKey, alt: ev.altKey };
      let firedAny = false;
      let prevent = false;
      for (const [id, def] of defs) {
        if (!currentBindings(id).some((k) => sameChord(k, chord))) continue;
        // A chord that matches but whose handlers are all `when`-blocked falls
        // through to the next action: a context-blocked binding must not swallow
        // the key for another action that claims the same chord.
        if (registry.dispatch(id, "keyboard", ev)) {
          firedAny = true;
          if (def.preventDefault) prevent = true;
        }
      }
      if (prevent) ev.preventDefault();
      return firedAny;
    },

    handleKeyUp(ev) {
      if (suspended) return false;
      const chord: KeyBinding = { key: ev.key, ctrl: ev.ctrlKey, shift: ev.shiftKey, alt: ev.altKey };
      let firedAny = false;
      for (const [id] of defs) {
        if (!currentBindings(id).some((k) => sameChord(k, chord))) continue;
        if (registry.dispatchRelease(id, "keyboard", ev)) firedAny = true;
      }
      return firedAny;
    },

    handleGamepadButton(index, pressed) {
      if (suspended || !pressed) return false;
      let firedAny = false;
      for (const [id, def] of defs) {
        if (def.gamepad?.includes(index)) {
          if (registry.dispatch(id, "gamepad")) firedAny = true;
        }
      }
      return firedAny;
    },

    actions() {
      return [...defs.values()];
    },

    registerAction(def) {
      if (defs.has(def.id)) throw new Error(`[input] action already registered: ${def.id}`);
      defs.set(def.id, def);
      emitChanged();
    },

    bindingFor(id) {
      if (!defs.has(id)) throw new Error(`[input] unknown action id: ${id}`);
      return [...currentBindings(id)];
    },

    setBinding(id, keys) {
      if (!defs.has(id)) throw new Error(`[input] unknown action id: ${id}`);
      bindings.set(id, keys.map((k) => ({ ...k })));
      emitChanged();
      const conflicts: BindingConflict[] = [];
      for (const key of keys) {
        const others: string[] = [];
        for (const [otherId] of defs) {
          if (otherId === id) continue;
          if (currentBindings(otherId).some((k) => sameChord(k, key))) others.push(otherId);
        }
        if (others.length > 0) conflicts.push({ action: id, key: { ...key }, conflictsWith: others });
      }
      return conflicts;
    },

    resetAction(id) {
      if (!defs.has(id)) throw new Error(`[input] unknown action id: ${id}`);
      bindings.delete(id);
      emitChanged();
    },

    resetAllBindings() {
      bindings.clear();
      emitChanged();
    },

    onBindingsChanged(fn) {
      changed.add(fn);
      return () => {
        changed.delete(fn);
      };
    },

    suspend() {
      suspended = true;
    },

    resume() {
      suspended = false;
    },

    get suspended() {
      return suspended;
    },

    serialize() {
      const out: Record<string, KeyBinding[]> = {};
      for (const [id, keys] of bindings) out[id] = keys.map((k) => ({ ...k }));
      return out;
    },

    load(data) {
      bindings.clear();
      for (const [id, keys] of Object.entries(data)) {
        if (!defs.has(id as string)) continue; // bindings for removed actions are dropped
        if (!Array.isArray(keys)) continue;
        bindings.set(
          id as string,
          keys.filter((k) => typeof k?.key === "string").map((k) => ({ ...k })),
        );
      }
      emitChanged();
    },
  };

  return registry;
}
