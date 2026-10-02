import { describe, expect, it } from "vitest";
import {
  createPingStore,
  describePing,
  PING_LABELS,
  PING_TTL_MS,
} from "../pings.js";

describe("battlefield ping system (solo task 25)", () => {
  it("places pings visible to AI allies", () => {
    const store = createPingStore();
    const ping = store.ping("attack", 100, 200, 0);
    expect(ping.kind).toBe("attack");
    const active = store.activePings(1000);
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe(ping.id);
  });

  it("expires pings after the TTL", () => {
    const store = createPingStore();
    store.ping("defend", 0, 0, 0);
    expect(store.activePings(PING_TTL_MS - 1)).toHaveLength(1);
    expect(store.expire(PING_TTL_MS)).toBe(1);
    expect(store.activePings(PING_TTL_MS)).toHaveLength(0);
  });

  it("labels every ping kind", () => {
    expect(Object.keys(PING_LABELS)).toEqual(["attack", "defend", "fallback", "watch"]);
    const store = createPingStore();
    const ping = store.ping("fallback", 10, 20, 0);
    expect(describePing(ping)).toContain("Fall back here");
  });

  it("clears all pings", () => {
    const store = createPingStore();
    store.ping("attack", 0, 0, 0);
    store.ping("watch", 1, 1, 0);
    store.clear();
    expect(store.pings).toHaveLength(0);
  });

  it("is deterministic for the same inputs", () => {
    const a = createPingStore();
    const b = createPingStore();
    a.ping("attack", 5, 5, 100);
    b.ping("attack", 5, 5, 100);
    expect(a.activePings(200).map((p) => [p.kind, p.x, p.y])).toEqual(
      b.activePings(200).map((p) => [p.kind, p.x, p.y]),
    );
  });
});
