/**
 * Gamepad detection + mapping layer (MASTER_PLAN task 1).
 *
 * The registry already maps standard button indices to actions through the
 * `gamepad` field on `ActionDef` (A=0 -> ui.confirm, B=1 -> ui.cancel,
 * LB=4 -> battle.commandMenu). This module owns everything around that:
 * detecting controllers, polling them each frame, edge-detecting buttons,
 * driving menu focus navigation from the d-pad / left stick, and exposing
 * axes + rumble for the camera (task 2) and haptics (task 7) layers.
 *
 * D-pad buttons (12-15) are NOT action-mapped: they always drive focus
 * navigation so a gamepad can work every menu without a mouse.
 */

/** Standard button indices (W3C "standard" mapping). */
export const GAMEPAD_BUTTON = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  L3: 10,
  R3: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
} as const;

/** Axes the standard mapping guarantees. Task 2 consumes these for camera. */
export const GAMEPAD_AXIS = {
  LEFT_X: 0,
  LEFT_Y: 1,
  RIGHT_X: 2,
  RIGHT_Y: 3,
} as const;

export type GamepadDirection = "up" | "down" | "left" | "right";

/** Minimal structural view of a Gamepad, injectable for tests. */
export interface PadSnapshot {
  readonly index: number;
  readonly id: string;
  readonly connected: boolean;
  readonly buttons: ReadonlyArray<{ pressed: boolean; value: number }>;
  readonly axes: ReadonlyArray<number>;
  readonly vibrationActuator?: {
    playEffect(type: string, params: Record<string, number>): Promise<unknown>;
  } | null;
}

export interface GamepadStatus {
  connected: boolean;
  /** Short human label, e.g. "Xbox 360 Controller". Null when none. */
  label: string | null;
  /** Number of connected pads. */
  count: number;
}

export interface GamepadManagerOptions {
  /** Called for every non-dpad button edge: (buttonIndex, pressed, padIndex). */
  onButton?: (index: number, pressed: boolean, padIndex: number) => void;
  /** Called when dpad/stick moves focus: (direction, padIndex). */
  onNavigate?: (direction: GamepadDirection, padIndex: number) => void;
  /** Called when pads connect/disconnect or the label changes. */
  onStatusChange?: (status: GamepadStatus) => void;
  /** Reads navigator.getGamepads(). Injected for tests. */
  getPads?: () => Array<PadSnapshot | null>;
  /** True while the gamepad layer should dispatch. Defaults to always. */
  isEnabled?: () => boolean;
  /** Axis deadzone. Defaults to 0.15. */
  deadzone?: number;
  /** Dpad hold repeat: initial delay ms then interval ms. Defaults 400/180. */
  repeatDelayMs?: number;
  repeatIntervalMs?: number;
}

export interface GamepadManager {
  /** Begin the rAF poll loop. Safe to call twice. */
  start(): void;
  /** Stop the loop. Safe to call twice. */
  stop(): void;
  readonly running: boolean;
  /** Single poll step; the rAF loop calls this, tests call it directly. */
  poll(nowMs?: number): void;
  /** Deadzoned axes of the first connected pad, [lx, ly, rx, ry]. */
  axes(padIndex?: number): [number, number, number, number];
  /**
   * Analog trigger values [LT, RT] in 0..1, for the twin-stick zoom (task 2).
   * Buttons 6/7 of the standard mapping; tiny deadzone so resting triggers
   * read as released.
   */
  triggers(padIndex?: number): [number, number];
  status(): GamepadStatus;
  /**
   * Rumble primitive for task 7's haptics. No-ops cleanly when the pad has no
   * actuator or the effect rejects (desktop, unsupported browsers).
   */
  rumble(
    durationMs?: number,
    strongMagnitude?: number,
    weakMagnitude?: number,
    padIndex?: number,
  ): Promise<void>;
}

interface PadEdgeState {
  prevButtons: boolean[];
  /** Held dpad direction + when the next repeat fires. */
  repeat: { direction: GamepadDirection; nextAt: number } | null;
}

const DIRECTION_BUTTONS: ReadonlyArray<{
  button: number;
  direction: GamepadDirection;
}> = [
  { button: GAMEPAD_BUTTON.DPAD_UP, direction: "up" },
  { button: GAMEPAD_BUTTON.DPAD_DOWN, direction: "down" },
  { button: GAMEPAD_BUTTON.DPAD_LEFT, direction: "left" },
  { button: GAMEPAD_BUTTON.DPAD_RIGHT, direction: "right" },
];

function applyDeadzone(value: number, deadzone: number): number {
  if (Math.abs(value) < deadzone) return 0;
  const sign = value < 0 ? -1 : 1;
  return sign * ((Math.abs(value) - deadzone) / (1 - deadzone));
}

function shortLabel(id: string): string {
  const cleaned = id.replace(/\s*\(.*?\)\s*/g, "").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 48) : "Controller";
}

export function createGamepadManager(opts: GamepadManagerOptions = {}): GamepadManager {
  const getPads =
    opts.getPads ??
    (() => {
      if (typeof navigator === "undefined" || !("getGamepads" in navigator)) return [];
      try {
        return Array.from(navigator.getGamepads());
      } catch {
        return [];
      }
    });
  const isEnabled = opts.isEnabled ?? (() => true);
  const deadzone = opts.deadzone ?? 0.15;
  const repeatDelayMs = opts.repeatDelayMs ?? 400;
  const repeatIntervalMs = opts.repeatIntervalMs ?? 180;

  let rafId: number | null = null;
  const edgeStates = new Map<number, PadEdgeState>();
  let lastStatusKey = "";

  function connectedPads(): PadSnapshot[] {
    return getPads().filter(
      (p): p is PadSnapshot => !!p && p.connected !== false,
    );
  }

  function emitStatus(): void {
    const pads = connectedPads();
    const status: GamepadStatus = {
      connected: pads.length > 0,
      label: pads.length > 0 ? shortLabel(pads[0]!.id) : null,
      count: pads.length,
    };
    const key = `${status.connected}|${status.label}|${status.count}`;
    if (key !== lastStatusKey) {
      lastStatusKey = key;
      opts.onStatusChange?.(status);
    }
  }

  function stickDirection(pad: PadSnapshot): GamepadDirection | null {
    const x = applyDeadzone(pad.axes[GAMEPAD_AXIS.LEFT_X] ?? 0, deadzone);
    const y = applyDeadzone(pad.axes[GAMEPAD_AXIS.LEFT_Y] ?? 0, deadzone);
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) return null;
    return Math.abs(x) >= Math.abs(y) ? (x > 0 ? "right" : "left") : y > 0 ? "down" : "up";
  }

  function navigate(dir: GamepadDirection, padIndex: number): void {
    opts.onNavigate?.(dir, padIndex);
  }

  function poll(nowMs?: number): void {
    emitStatus();
    if (!isEnabled()) return;
    const now = nowMs ?? performance.now();
    const pads = connectedPads();
    const seen = new Set<number>();
    for (const pad of pads) {
      seen.add(pad.index);
      let state = edgeStates.get(pad.index);
      if (!state) {
        state = { prevButtons: [], repeat: null };
        edgeStates.set(pad.index, state);
      }
      const pressed = pad.buttons.map((b) => !!b.pressed);

      // D-pad: navigation with hold-repeat.
      let dpadDir: GamepadDirection | null = null;
      for (const { button, direction } of DIRECTION_BUTTONS) {
        if (pressed[button]) {
          dpadDir = direction;
          break;
        }
      }
      const stickDir = dpadDir ?? stickDirection(pad);
      if (stickDir) {
        if (!state.repeat || state.repeat.direction !== stickDir) {
          navigate(stickDir, pad.index);
          state.repeat = { direction: stickDir, nextAt: now + repeatDelayMs };
        } else if (now >= state.repeat.nextAt) {
          navigate(stickDir, pad.index);
          state.repeat.nextAt = now + repeatIntervalMs;
        }
      } else {
        state.repeat = null;
      }

      // Every other button: edge -> action mapping. D-pad buttons are
      // navigation-only (handled above), never action-mapped.
      const dpadSet = new Set(DIRECTION_BUTTONS.map((d) => d.button));
      for (let i = 0; i < pressed.length; i++) {
        if (dpadSet.has(i)) continue;
        const was = state.prevButtons[i] ?? false;
        if (pressed[i] && !was) opts.onButton?.(i, true, pad.index);
        else if (!pressed[i] && was) opts.onButton?.(i, false, pad.index);
      }
      state.prevButtons = pressed;
    }
    for (const index of [...edgeStates.keys()]) {
      if (!seen.has(index)) edgeStates.delete(index);
    }
  }

  function tick(): void {
    poll();
    rafId = requestAnimationFrame(tick);
  }

  async function rumble(
    durationMs = 120,
    strongMagnitude = 0.6,
    weakMagnitude = 0.3,
    padIndex = 0,
  ): Promise<void> {
    const pad = connectedPads().find((p) => p.index === padIndex) ?? connectedPads()[0];
    const actuator = pad?.vibrationActuator;
    if (!actuator || typeof actuator.playEffect !== "function") return;
    try {
      await actuator.playEffect("dual-rumble", {
        duration: durationMs,
        strongMagnitude,
        weakMagnitude,
      });
    } catch {
      // Unsupported or rejected: rumble is best-effort, never fatal.
    }
  }

  return {
    start() {
      if (rafId !== null) return;
      emitStatus();
      rafId = requestAnimationFrame(tick);
    },
    stop() {
      if (rafId === null) return;
      cancelAnimationFrame(rafId);
      rafId = null;
    },
    get running() {
      return rafId !== null;
    },
    poll,
    axes(padIndex = 0) {
      const pads = connectedPads();
      const pad = pads.find((p) => p.index === padIndex) ?? pads[0];
      if (!pad) return [0, 0, 0, 0];
      return [
        applyDeadzone(pad.axes[GAMEPAD_AXIS.LEFT_X] ?? 0, deadzone),
        applyDeadzone(pad.axes[GAMEPAD_AXIS.LEFT_Y] ?? 0, deadzone),
        applyDeadzone(pad.axes[GAMEPAD_AXIS.RIGHT_X] ?? 0, deadzone),
        applyDeadzone(pad.axes[GAMEPAD_AXIS.RIGHT_Y] ?? 0, deadzone),
      ];
    },
    triggers(padIndex = 0) {
      const pads = connectedPads();
      const pad = pads.find((p) => p.index === padIndex) ?? pads[0];
      if (!pad) return [0, 0];
      const read = (i: number): number => {
        const v = pad.buttons[i]?.value ?? 0;
        return v < 0.05 ? 0 : Math.min(1, v);
      };
      return [read(GAMEPAD_BUTTON.LT), read(GAMEPAD_BUTTON.RT)];
    },
    status() {
      const pads = connectedPads();
      return {
        connected: pads.length > 0,
        label: pads.length > 0 ? shortLabel(pads[0]!.id) : null,
        count: pads.length,
      };
    },
    rumble,
  };
}
