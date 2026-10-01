/**
 * Tasks 99-100: assassination plotting and intel reports.
 *
 * Assassination: a staged plot — recruit assets, then each season the plot
 * advances toward the kill window. Every stage carries exposure odds; if
 * exposed, the plot burns and the target's court learns of it.
 *
 * Intel reports: digest what spies and informants deliver into confidence-
 * scored summaries for the reports UI.
 */

import type { IntelReport, Scheme } from "./types.js";

export interface PlotStage {
  name: string;
  /** 0..1 exposure odds when working this stage. */
  exposure: number;
}

export const PLOT_STAGES: PlotStage[] = [
  { name: "Recruit assets", exposure: 0.1 },
  { name: "Learn the routine", exposure: 0.15 },
  { name: "Bribe the guard", exposure: 0.25 },
  { name: "Strike", exposure: 0.4 },
];

export interface AssassinationPlot {
  id: string;
  target: string;
  stage: number; // index into PLOT_STAGES
  exposed: boolean;
  complete: boolean;
}

let nextPlot = 1;

export function startPlot(target: string): AssassinationPlot {
  return { id: `plot-${nextPlot++}`, target, stage: 0, exposed: false, complete: false };
}

export interface PlotAdvance {
  plot: AssassinationPlot;
  note: string;
}

/** Advance one stage; `roll` 0..1 decides exposure against the stage odds. */
export function advancePlot(plot: AssassinationPlot, roll: () => number): PlotAdvance {
  if (plot.exposed || plot.complete) {
    return { plot, note: "The plot is already over." };
  }
  const stage = PLOT_STAGES[plot.stage]!;
  if (roll() < stage.exposure) {
    const burned = { ...plot, exposed: true };
    return { plot: burned, note: `${plot.target}'s court has uncovered the plot.` };
  }
  const next = plot.stage + 1;
  if (next >= PLOT_STAGES.length) {
    const done = { ...plot, stage: next, complete: true };
    return { plot: done, note: `${plot.target} is dead. The court suspects nothing.` };
  }
  return { plot: { ...plot, stage: next }, note: `Plot advances: ${PLOT_STAGES[next]!.name}.` };
}

let nextReport = 1;

/** Build an intel report from a scheme's outcome and the informant's reliability. */
export function makeIntelReport(
  post: string,
  summary: string,
  reliability: number,
): IntelReport {
  return {
    id: `intel-${nextReport++}`,
    post,
    summary,
    confidence: Math.min(1, Math.max(0, reliability / 100)),
  };
}

/** Summarize a completed scheme into a report line for the UI. */
export function schemeReport(scheme: Scheme): string {
  if (scheme.discovered) return `${scheme.kind} against ${scheme.target}: exposed.`;
  if (scheme.progress >= 100) return `${scheme.kind} against ${scheme.target}: succeeded.`;
  return `${scheme.kind} against ${scheme.target}: ${Math.round(scheme.progress)}% complete.`;
}
