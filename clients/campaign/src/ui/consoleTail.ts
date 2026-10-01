/**
 * Console tail capture (supports MASTER_PLAN task 26).
 *
 * The bug reporter attaches the last console lines to every report, so a
 * "the map went black" bug comes with the warnings that preceded it.
 * Installed once at boot; the original console methods keep working, so
 * nothing about logging behavior changes for the user or for tests.
 */
export type ConsoleLevel = "debug" | "info" | "log" | "warn" | "error";

export interface ConsoleLine {
  level: ConsoleLevel;
  text: string;
  /** Epoch millis. */
  at: number;
}

const DEFAULT_CAPACITY = 200;

let buffer: ConsoleLine[] = [];
let capacity = DEFAULT_CAPACITY;
let installed = false;
const originals = new Map<ConsoleLevel, (...args: unknown[]) => void>();

function format(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a) ?? String(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

/** The captured tail, oldest first. */
export function consoleTail(): ConsoleLine[] {
  return [...buffer];
}

/**
 * Patches the console methods. Idempotent; a second call keeps the first
 * installation (and its buffer) rather than double-wrapping.
 */
export function installConsoleTail(maxLines = DEFAULT_CAPACITY): void {
  if (installed) return;
  installed = true;
  capacity = maxLines;
  const levels: ConsoleLevel[] = ["debug", "info", "log", "warn", "error"];
  for (const level of levels) {
    const original = console[level].bind(console);
    originals.set(level, original);
    console[level] = (...args: unknown[]) => {
      buffer.push({ level, text: format(args).slice(0, 2000), at: Date.now() });
      while (buffer.length > capacity) buffer.shift();
      original(...args);
    };
  }
}

/** Restores the original console methods. Test-only. */
export function uninstallConsoleTail(): void {
  for (const [level, original] of originals) {
    console[level] = original as never;
  }
  originals.clear();
  buffer = [];
  installed = false;
}

/** Test-only: clears the buffer without uninstalling. */
export function clearConsoleTail(): void {
  buffer = [];
}
