/**
 * Battlefield ping system (Rowan solo task 25).
 *
 * The player pings a map location (attack / defend / fall back / watch);
 * the ping is visible to AI allies, who read the active ping list and steer
 * toward it. Pings expire after 30 seconds. Pure state + a DOM marker layer
 * the battle scene mounts; the AI hook is `activePings()`.
 */

export type PingKind = "attack" | "defend" | "fallback" | "watch";

export const PING_KINDS: PingKind[] = ["attack", "defend", "fallback", "watch"];

export const PING_LABELS: Record<PingKind, string> = {
  attack: "Attack here",
  defend: "Defend here",
  fallback: "Fall back here",
  watch: "Watch this",
};

/** How long a ping stays live, ms. */
export const PING_TTL_MS = 30_000;

export interface Ping {
  id: string;
  kind: PingKind;
  /** Map position, metres. */
  x: number;
  y: number;
  createdAt: number;
}

export interface PingStore {
  pings: Ping[];
  /** Place a ping. Returns the ping. */
  ping(kind: PingKind, x: number, y: number, nowMs: number): Ping;
  /** Remove expired pings. Returns how many were removed. */
  expire(nowMs: number): number;
  /** Pings AI allies can see right now (unexpired). */
  activePings(nowMs: number): Ping[];
  clear(): void;
}

let nextId = 1;

export function createPingStore(): PingStore {
  const pings: Ping[] = [];
  return {
    pings,
    ping(kind, x, y, nowMs) {
      const ping: Ping = { id: `ping-${nextId++}`, kind, x, y, createdAt: nowMs };
      pings.push(ping);
      return ping;
    },
    expire(nowMs) {
      const before = pings.length;
      for (let i = pings.length - 1; i >= 0; i--) {
        if (nowMs - pings[i]!.createdAt >= PING_TTL_MS) pings.splice(i, 1);
      }
      return before - pings.length;
    },
    activePings(nowMs) {
      return pings.filter((p) => nowMs - p.createdAt < PING_TTL_MS);
    },
    clear() {
      pings.length = 0;
    },
  };
}

/** One-line description for the AI log / screen reader. */
export function describePing(ping: Ping): string {
  return `${PING_LABELS[ping.kind]} (${Math.round(ping.x)}, ${Math.round(ping.y)})`;
}
