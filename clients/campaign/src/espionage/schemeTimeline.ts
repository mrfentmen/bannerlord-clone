/**
 * Scheme progress timeline (Rowan solo task 65).
 *
 * Visualizes a scheme's stages with completion state and an ETA: progress
 * 0..100 maps onto four stages, and the remaining seasons come from the
 * scheme's rate. Pure — the panel renders what this returns.
 */

import type { Scheme } from "./types.js";

export interface SchemeStage {
  name: string;
  /** 0..100 completion of this stage. */
  completion: number;
  done: boolean;
  current: boolean;
}

export interface SchemeTimeline {
  schemeId: string;
  stages: SchemeStage[];
  /** Seasons until completion at the current rate, or null when stalled. */
  etaSeasons: number | null;
  overall: number;
  line: string;
}

const STAGE_NAMES = ["Planning", "Infiltration", "Execution", "Exfiltration"];

/** Build the timeline for a scheme. */
export function schemeTimeline(scheme: Scheme): SchemeTimeline {
  const per = 100 / STAGE_NAMES.length;
  const stages: SchemeStage[] = STAGE_NAMES.map((name, i) => {
    const start = i * per;
    const completion = Math.max(0, Math.min(100, ((scheme.progress - start) / per) * 100));
    const done = completion >= 100;
    return { name, completion: Math.round(completion), done, current: false };
  });
  const firstOpen = stages.find((s) => !s.done);
  if (firstOpen) firstOpen.current = true;

  const remaining = Math.max(0, 100 - scheme.progress);
  const etaSeasons = scheme.rate > 0 ? Math.ceil(remaining / scheme.rate) : null;
  const overall = Math.round(Math.min(100, Math.max(0, scheme.progress)));
  const line =
    etaSeasons === null
      ? "The scheme is stalled — no progress is being made."
      : etaSeasons === 0
        ? "The scheme completes this season."
        : `~${etaSeasons} season${etaSeasons === 1 ? "" : "s"} to completion.`;
  return { schemeId: scheme.id, stages, etaSeasons, overall, line };
}
