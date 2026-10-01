/**
 * Task 68: after-action report. Four populated sections — casualties, kills,
 * MVP unit, timeline — built from the sim's data. Throws on empty data
 * rather than rendering a hollow report.
 */

import type { AfterActionData, CasualtyBreakdown, MvpUnit, TimelineEvent, UnitKills } from "./types.js";
import { casualtyBreakdown } from "./casualties.js";

export interface AfterActionReport {
  battleLabel: string;
  playerWon: boolean;
  durationS: number;
  playerCasualties: CasualtyBreakdown;
  enemyCasualties: CasualtyBreakdown;
  playerKills: number;
  enemyKills: number;
  mvp: MvpUnit | null;
  timeline: TimelineEvent[];
  captures: string[];
}

export function buildReport(
  data: AfterActionData,
  unitKills: UnitKills[],
): AfterActionReport {
  if (data.playerLosses.length === 0 && data.enemyLosses.length === 0) {
    throw new Error("after-action report needs casualty data");
  }
  let mvp: MvpUnit | null = null;
  for (const uk of unitKills) {
    if (!mvp || uk.kills > mvp.kills) mvp = { unitKind: uk.unitKind, kills: uk.kills };
  }
  const timeline = [...data.timeline].sort((a, b) => a.t - b.t);
  return {
    battleLabel: data.battleLabel,
    playerWon: data.playerWon,
    durationS: data.durationS,
    playerCasualties: casualtyBreakdown(data.playerLosses),
    enemyCasualties: casualtyBreakdown(data.enemyLosses),
    playerKills: data.playerKills,
    enemyKills: data.enemyKills,
    mvp,
    timeline,
    captures: [...data.captures],
  };
}
