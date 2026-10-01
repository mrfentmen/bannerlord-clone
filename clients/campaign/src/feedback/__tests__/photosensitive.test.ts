/**
 * Photosensitivity guard (MASTER_PLAN task 24): the flash registry, the
 * 3 Hz audit, and the burst-coalescing gate.
 *
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  MIN_FLASH_INTERVAL_MS,
  auditPhotosensitivity,
  createFlashGate,
  formatPhotosensitivityReport,
  listFlashSources,
  registerFlashSource,
  registerPhotosensitivityCommand,
  unregisterFlashSource,
} from "../photosensitive.js";
import { createThreatIndicator } from "../threatIndicator.js";
import { createDirectionIndicator } from "../directionIndicator.js";
import type {
  DamageTick,
  FeedbackProjection,
  FeedbackSource,
  ThreatHit,
  TrackedUnit,
  Unsubscribe,
} from "../types.js";

const noop = (): Unsubscribe => () => {};

function fakeSource(): FeedbackSource & {
  emitThreat(t: ThreatHit): void;
  emitDamage(d: DamageTick): void;
} {
  const threats = new Set<(t: ThreatHit) => void>();
  const damages = new Set<(d: DamageTick) => void>();
  return {
    onHeroKill: () => noop(),
    onDamage: (fn) => {
      damages.add(fn);
      return () => damages.delete(fn);
    },
    onThreat: (fn) => {
      threats.add(fn);
      return () => threats.delete(fn);
    },
    onMoment: () => noop(),
    onPlayerHealth: () => noop(),
    objectives: () => [],
    onObjectivesChanged: () => noop(),
    units: (): TrackedUnit[] => [{ id: "u1", side: "ally", x: 0, z: 0, alive: true }],
    onUnitsChanged: () => noop(),
    emitThreat: (t) => threats.forEach((fn) => fn(t)),
    emitDamage: (d) => damages.forEach((fn) => fn(d)),
  };
}

const projection: FeedbackProjection = {
  fieldToScreen: (x: number, z: number) => ({ x: x * 10 + 400, y: z * 10 + 300 }),
  viewport: () => ({ w: 800, h: 600 }),
};

afterEach(() => {
  // The registry is module-global: never leak test profiles into other tests.
  for (const p of listFlashSources()) unregisterFlashSource(p.id);
});

describe("flash gate", () => {
  it("allows the first flash, coalesces bursts under 1/3 s", () => {
    let t = 1000;
    const gate = createFlashGate({ now: () => t });
    expect(gate.request("a")).toBe(true);
    expect(gate.request("a")).toBe(false); // same tick: burst
    t += MIN_FLASH_INTERVAL_MS / 2;
    expect(gate.request("a")).toBe(false); // still inside the window
    t += MIN_FLASH_INTERVAL_MS; // well past the window
    expect(gate.request("a")).toBe(true);
  });

  it("tracks sources independently", () => {
    let t = 0;
    const gate = createFlashGate({ now: () => t });
    expect(gate.request("a")).toBe(true);
    expect(gate.request("b")).toBe(true);
    expect(gate.request("a")).toBe(false);
    expect(gate.request("b")).toBe(false);
  });
});

describe("flash registry", () => {
  it("re-registering an id replaces the profile instead of duplicating", () => {
    registerFlashSource({ id: "x", label: "X", kind: "js", maxRateHz: 1 });
    registerFlashSource({ id: "x", label: "X2", kind: "js", maxRateHz: 2 });
    const all = listFlashSources().filter((p) => p.id === "x");
    expect(all).toHaveLength(1);
    expect(all[0]?.maxRateHz).toBe(2);
  });

  it("unregister removes the profile", () => {
    registerFlashSource({ id: "x", label: "X", kind: "js", maxRateHz: 1 });
    unregisterFlashSource("x");
    expect(listFlashSources().some((p) => p.id === "x")).toBe(false);
  });
});

describe("photosensitivity audit", () => {
  it("passes sources at or under 3 Hz", () => {
    registerFlashSource({ id: "ok", label: "OK", kind: "css", maxRateHz: 3 });
    const findings = auditPhotosensitivity();
    expect(findings).toHaveLength(1);
    expect(findings[0]?.pass).toBe(true);
  });

  it("fails anything over 3 Hz", () => {
    registerFlashSource({
      id: "strobe",
      label: "Bad strobe",
      kind: "js",
      maxRateHz: 10,
      note: "deliberate test offender",
    });
    const findings = auditPhotosensitivity();
    const bad = findings.find((f) => f.id === "strobe");
    expect(bad?.pass).toBe(false);
    expect(bad?.detail).toContain("EXCEEDS");
  });

  it("report summarizes pass/fail counts", () => {
    registerFlashSource({ id: "ok", label: "OK", kind: "css", maxRateHz: 1 });
    registerFlashSource({ id: "bad", label: "Bad", kind: "js", maxRateHz: 5 });
    const report = formatPhotosensitivityReport(auditPhotosensitivity());
    expect(report).toContain("PASS");
    expect(report).toContain("FAIL");
    expect(report).toContain("2 source(s) audited, 1 over the 3 Hz limit");
  });

  it("registers a debug-console command that prints the audit", () => {
    const cmds = new Map<string, (args: string[]) => string>();
    registerPhotosensitivityCommand({ register: (n, fn) => cmds.set(n, fn) });
    expect(cmds.has("photosensitivity")).toBe(true);
    const out = cmds.get("photosensitivity")!([]);
    expect(out).toContain("audited");
  });
});

describe("emitter wiring", () => {
  it("threat indicator registers its flash profile and unregisters on destroy", () => {
    const src = fakeSource();
    const ind = createThreatIndicator(src, projection);
    const findings = auditPhotosensitivity();
    const f = findings.find((x) => x.id === "fb-threat-flash");
    expect(f).toBeDefined();
    expect(f?.pass).toBe(true);
    expect(f?.maxRateHz).toBeLessThanOrEqual(3);
    ind.destroy();
    expect(auditPhotosensitivity().some((x) => x.id === "fb-threat-flash")).toBe(false);
  });

  it("direction indicator registers its flash profile and unregisters on destroy", () => {
    const src = fakeSource();
    const ind = createDirectionIndicator(src, projection);
    const f = auditPhotosensitivity().find((x) => x.id === "fb-direction-arc");
    expect(f).toBeDefined();
    expect(f?.pass).toBe(true);
    ind.destroy();
    expect(auditPhotosensitivity().some((x) => x.id === "fb-direction-arc")).toBe(false);
  });

  it("a burst of threat events produces at most one flash per 1/3 s", () => {
    const src = fakeSource();
    const ind = createThreatIndicator(src, projection);
    const layer = ind.root;
    const threat: ThreatHit = { unitId: "u1", fromX: 10, fromZ: 0, rear: false, at: 0 };
    for (let i = 0; i < 10; i++) src.emitThreat(threat);
    // The shared gate uses real time: all 10 events land in one burst, so
    // only the first may create a flash element.
    expect(layer.querySelectorAll(".fb-threat-edge")).toHaveLength(1);
    ind.destroy();
  });
});
