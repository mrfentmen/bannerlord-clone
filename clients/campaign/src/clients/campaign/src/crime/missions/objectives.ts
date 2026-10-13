/**
 * Objective primitives — the building blocks every heist, job and bounty
 * is assembled from.
 *
 * Ported from leonida's `missions/objectives.ts` (MIT; license caveat in
 * `../types.ts`). The engine-coupled helpers (teleport, force-mount,
 * spawning) are left out — those belong to the Babylon adapter. What is
 * here is pure: distance checks, timers, event waits, decorators.
 */
import type { V3 } from "../types.js";
import type { MissionContext, Objective, ObjectiveStatus } from "./types.js";

export function horizontal(a: V3, b: V3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

const NO_TARGET = (): V3 | null => null;

/** Go to a position. */
export function goto(pos: V3, radius: number, text: string): Objective {
  const target = { x: pos.x, y: pos.y, z: pos.z };
  return {
    text,
    target: () => target,
    start() {},
    update(ctx) {
      return horizontal(ctx.host.playerPosition(), target) <= radius ? "done" : "running";
    },
    skip() {},
    stop() {},
  };
}

/** Wait until `predicate` is true (polled every tick). */
export function waitFor(
  text: string,
  predicate: (ctx: MissionContext) => boolean,
  target?: () => V3 | null,
): Objective {
  return {
    text,
    target: target ?? NO_TARGET,
    start() {},
    update: (ctx) => (predicate(ctx) ? "done" : "running"),
    skip() {},
    stop() {},
  };
}

/** Wait for an engine event; `predicate` may inspect the event payload. */
export function waitForEvent(
  event: string,
  text: string,
  predicate?: (data?: Record<string, unknown>) => boolean,
): Objective {
  let done = false;
  let off: (() => void) | null = null;
  return {
    text,
    target: NO_TARGET,
    start(ctx) {
      off = ctx.host.on(event, (data) => {
        if (!predicate || predicate(data)) done = true;
      });
    },
    update: () => (done ? "done" : "running"),
    skip() {
      done = true;
    },
    stop() {
      off?.();
      off = null;
    },
  };
}

/** Run `fn` once, immediately — for side effects between objectives. */
export function action(fn: (ctx: MissionContext) => void, text = ""): Objective {
  let ran = false;
  return {
    text,
    target: NO_TARGET,
    start(ctx) {
      fn(ctx);
      ran = true;
    },
    update: () => (ran ? "done" : "running"),
    skip() {
      ran = true;
    },
    stop() {},
  };
}

/** Decorator: the inner objective must finish within `seconds`, else the mission fails. */
export function timed(inner: Objective, seconds: number, failReason: string, showTimer = true): Objective {
  let elapsed = 0;
  return {
    get text() {
      const remaining = Math.max(0, Math.ceil(seconds - elapsed));
      return showTimer ? `${inner.text} (${remaining}s)` : inner.text;
    },
    target: () => inner.target(),
    start(ctx) {
      elapsed = 0;
      inner.start(ctx);
    },
    update(ctx, dt): ObjectiveStatus {
      elapsed += dt;
      if (elapsed >= seconds) {
        ctx.fail(failReason);
        return "failed";
      }
      return inner.update(ctx, dt);
    },
    skip(ctx) {
      inner.skip(ctx);
    },
    stop(ctx) {
      inner.stop(ctx);
    },
  };
}

/**
 * The getaway clock as a decorator: pass when the wanted level drops to 0
 * (or below `maxWanted`) before the timer runs out.
 */
export function escapeWanted(seconds = 300, maxWanted = 0): Objective {
  let elapsed = 0;
  return {
    get text() {
      const remaining = Math.max(0, Math.ceil(seconds - elapsed));
      return `Lose the cops (${remaining}s)`;
    },
    target: NO_TARGET,
    start() {
      elapsed = 0;
    },
    update(ctx, dt): ObjectiveStatus {
      elapsed += dt;
      if (ctx.host.wantedLevel() <= maxWanted) return "done";
      if (elapsed >= seconds) {
        ctx.fail("the cops caught up with you");
        return "failed";
      }
      return "running";
    },
    skip(_ctx) {
      _ctx.host.clearWanted("debug");
    },
    stop() {},
  };
}

/** Survive for `seconds` (the director keeps the pressure on). */
export function survive(seconds: number, text = "Survive"): Objective {
  let elapsed = 0;
  return {
    get text() {
      return `${text} (${Math.max(0, Math.ceil(seconds - elapsed))}s)`;
    },
    target: NO_TARGET,
    start() {
      elapsed = 0;
    },
    update(_ctx, dt): ObjectiveStatus {
      elapsed += dt;
      return elapsed >= seconds ? "done" : "running";
    },
    skip() {},
    stop() {},
  };
}

/** Stay inside `radius` of `center` for `seconds` — the loot-grab shape. */
export function holdPosition(
  center: () => V3 | null,
  radius: number,
  seconds: number,
  text: string,
): Objective {
  let elapsed = 0;
  return {
    get text() {
      return `${text} (${Math.max(0, Math.ceil(seconds - elapsed))}s)`;
    },
    target: () => center(),
    start() {
      elapsed = 0;
    },
    update(ctx, dt): ObjectiveStatus {
      const c = center();
      if (!c) return "running";
      if (horizontal(ctx.host.playerPosition(), c) <= radius) elapsed += dt;
      return elapsed >= seconds ? "done" : "running";
    },
    skip() {},
    stop() {},
  };
}

/**
 * Fully custom objective. `update` returns the status; use `ctx.fail`
 * before returning 'failed' to set the fail reason.
 */
export function custom(opts: {
  text: string;
  target?: () => V3 | null;
  start?: (ctx: MissionContext) => void;
  update: (ctx: MissionContext, dt: number) => ObjectiveStatus;
  skip?: (ctx: MissionContext) => void;
  stop?: (ctx: MissionContext) => void;
}): Objective {
  return {
    text: opts.text,
    target: opts.target ?? NO_TARGET,
    start: (ctx) => opts.start?.(ctx),
    update: (ctx, dt) => opts.update(ctx, dt),
    skip: (ctx) => opts.skip?.(ctx),
    stop: (ctx) => opts.stop?.(ctx),
  };
}
