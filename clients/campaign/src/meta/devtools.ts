/**
 * Tasks 143-144: performance profiler UI data and the debug console.
 *
 * Profiler: a ring buffer of frame times with p50/p95/avg stats for the
 * frame-time graph. Recording is cheap — the renderer pushes samples.
 *
 * Debug console: dev commands behind an explicit flag. Commands are pure
 * functions over a debug context the app provides; the console never
 * touches game state directly.
 */

export interface FrameStats {
  count: number;
  avg: number;
  p50: number;
  p95: number;
  worst: number;
}

export interface Profiler {
  push(frameMs: number): void;
  stats(): FrameStats | null;
  samples(): number[];
  reset(): void;
}

export function createProfiler(capacity = 300): Profiler {
  const buf: number[] = [];
  return {
    push(frameMs) {
      buf.push(frameMs);
      if (buf.length > capacity) buf.shift();
    },
    samples: () => [...buf],
    reset() {
      buf.length = 0;
    },
    stats() {
      if (buf.length === 0) return null;
      const sorted = [...buf].sort((a, b) => a - b);
      const avg = buf.reduce((s, x) => s + x, 0) / buf.length;
      const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
      return { count: buf.length, avg, p50: at(0.5), p95: at(0.95), worst: sorted[sorted.length - 1]! };
    },
  };
}

export type DebugCommand = (args: string[]) => string;

export interface DebugConsole {
  enabled(): boolean;
  enable(): void;
  commands(): string[];
  register(name: string, fn: DebugCommand): void;
  run(line: string): string;
}

export function createDebugConsole(): DebugConsole {
  let on = false;
  const cmds = new Map<string, DebugCommand>();
  cmds.set("help", () => [...cmds.keys()].join(", "));
  cmds.set("ping", () => "pong");
  return {
    enabled: () => on,
    enable() {
      on = true;
    },
    commands: () => [...cmds.keys()],
    register(name, fn) {
      if (!/^[a-z0-9-]+$/.test(name)) throw new Error("command names must be lowercase alphanumeric");
      cmds.set(name, fn);
    },
    run(line) {
      if (!on) return "debug console is disabled";
      const [name = "", ...args] = line.trim().split(/\s+/);
      const cmd = cmds.get(name);
      if (!cmd) return `unknown command: ${name}`;
      try {
        return cmd(args);
      } catch (e) {
        return `error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  };
}
