/**
 * @vitest-environment jsdom
 *
 * Espionage tests (MASTER_PLAN 3C, tasks 94-100).
 */

import { describe, expect, it } from "vitest";
import {
  advancePlot,
  createCipherGame,
  createCounterEspionage,
  createInformantNetwork,
  createSpyNetwork,
  makeIntelReport,
  planScheme,
  PLOT_STAGES,
  schemeReport,
  startPlot,
  tickScheme,
} from "../index.js";

describe("spy network (task 94)", () => {
  it("places spies and emits map markers", () => {
    const net = createSpyNetwork();
    net.place({ id: "s1", name: "Wren", post: "harbor", cover: 70 });
    net.place({ id: "s2", name: "Mole", post: "rust", cover: 20 });
    const markers = net.markers({ harbor: "Harbor", rust: "Rust Camp" });
    expect(markers).toHaveLength(2);
    expect(markers.find((m) => m.spyName === "Wren")!.postName).toBe("Harbor");
    expect(markers.find((m) => m.spyName === "Mole")!.atRisk).toBe(true);
    // Heat decays cover.
    net.tick({ harbor: 10 });
    expect(net.spies().find((s) => s.id === "s1")!.cover).toBe(60);
  });
});

describe("scheme planner (task 95)", () => {
  it("plans schemes with visible discovery odds", () => {
    const scheme = planScheme("steal-plans", "rust");
    let s = scheme;
    let odds = 0;
    for (let i = 0; i < 3; i++) {
      const t = tickScheme(s, 60, 40);
      s = t.scheme;
      odds = t.discoveryOdds;
    }
    expect(s.progress).toBeGreaterThanOrEqual(99);
    expect(odds).toBeGreaterThan(0);
    expect(odds).toBeLessThan(0.9);
  });
});

describe("informants (task 96)", () => {
  it("bribes buy reliability with diminishing returns", () => {
    const net = createInformantNetwork();
    const cheap = net.recruit("A", "harbor", 100);
    const rich = net.recruit("B", "rust", 10000);
    expect(rich.reliability).toBeGreaterThan(cheap.reliability);
    expect(rich.reliability).toBeLessThanOrEqual(95);
    expect(net.seasonalCost()).toBe(cheap.costPerSeason + rich.costPerSeason);
    net.dismiss(cheap.id);
    expect(net.informants()).toHaveLength(1);
  });
});

describe("counter-espionage (task 97)", () => {
  it("heat exposes low-cover spies", () => {
    const ce = createCounterEspionage();
    ce.assignHeat("harbor", 80);
    const exposed = ce.sweep(
      [
        { id: "s1", name: "Wren", post: "harbor", cover: 90 },
        { id: "s2", name: "Mole", post: "harbor", cover: 10 },
      ],
      () => 0.05,
    );
    // s1: exposure (80-90)->0, never caught. s2: exposure 0.7 > 0.05 roll.
    expect(exposed.map((s) => s.id)).toEqual(["s2"]);
  });
});

describe("cipher minigame (task 98)", () => {
  it("decodes the message letter by letter", () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const game = createCipherGame("attack at dawn", rand);
    expect(game.solved()).toBe(false);
    expect(game.view()).toContain("_");
    // Solve by mapping each cipher letter back through the encoded text.
    const plain = "attack at dawn";
    const pairs = new Map<string, string>();
    for (let i = 0; i < plain.length; i++) {
      const p = plain[i]!;
      if (p === " ") continue;
      pairs.set(game.encoded[i]!.toLowerCase(), p);
    }
    for (const [c, p] of pairs) game.guess(c, p);
    expect(game.solved()).toBe(true);
    expect(game.view()).toBe("attack at dawn");
  });
});

describe("assassination plots (task 99)", () => {
  it("stages advance and exposure burns the plot", () => {
    let plot = startPlot("Warlord Kess");
    for (let i = 0; i < PLOT_STAGES.length; i++) {
      const r = advancePlot(plot, () => 0.99); // never exposed
      plot = r.plot;
    }
    expect(plot.complete).toBe(true);
    expect(plot.exposed).toBe(false);

    const exposed = advancePlot(startPlot("Warlord Kess"), () => 0.0); // always exposed
    expect(exposed.plot.exposed).toBe(true);
    expect(exposed.note).toContain("uncovered");
  });
});

describe("intel reports (task 100)", () => {
  it("reports carry confidence from reliability", () => {
    const r = makeIntelReport("harbor", "Fleet movements spotted.", 80);
    expect(r.confidence).toBeCloseTo(0.8, 5);
    const scheme = planScheme("sow-dissent", "rust");
    expect(schemeReport(scheme)).toContain("0% complete");
  });
});
