/**
 * After-action (MASTER_PLAN 2E, tasks 68-75): report screen data, casualty
 * breakdowns, victory/defeat screens, lifetime war stats, a replay viewer
 * with scrub/speed controls, and shareable battle summaries.
 *
 * All data-level: the sim produces the numbers, this module shapes them for
 * display. Replay playback emits the current event index through a callback
 * the scene adapter draws; this module never touches the scene.
 */

export interface UnitLoss {
  unitKind: string;
  started: number;
  lost: number;
}

export interface TimelineEvent {
  /** Seconds into the battle. */
  t: number;
  label: string;
  kind: "charge" | "rout" | "hero" | "objective" | "order" | "info";
}

export interface AfterActionData {
  battleLabel: string;
  playerWon: boolean;
  durationS: number;
  playerLosses: UnitLoss[];
  enemyLosses: UnitLoss[];
  playerKills: number;
  enemyKills: number;
  /** Captured enemies / equipment, if any. */
  captures: string[];
  timeline: TimelineEvent[];
}

export interface CasualtyRow extends UnitLoss {
  /** 0..1 share of that side's total losses. */
  share: number;
}

export interface CasualtyBreakdown {
  rows: CasualtyRow[];
  totalLost: number;
  totalStarted: number;
}

/** MVP = the unit kind with the most kills credited, ties broken by fewest losses. */
export interface MvpUnit {
  unitKind: string;
  kills: number;
}

/** Per-unit kills credited, reported by the sim alongside losses. */
export interface UnitKills {
  unitKind: string;
  kills: number;
}
