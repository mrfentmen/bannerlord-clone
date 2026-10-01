/**
 * Task 75: shareable battle summary. A compact text card for a battle —
 * copyable to the clipboard and downloadable as a .txt file.
 */

import type { AfterActionReport } from "./report.js";
import { sharePct } from "./casualties.js";

export function battleSummaryText(report: AfterActionReport): string {
  const lines = [
    `${report.playerWon ? "VICTORY" : "DEFEAT"} — ${report.battleLabel}`,
    `Duration: ${Math.round(report.durationS / 60)}m ${Math.round(report.durationS % 60)}s`,
    `Kills: ${report.playerKills} inflicted / ${report.enemyKills} suffered`,
    `Losses: ${report.playerCasualties.totalLost} ours / ${report.enemyCasualties.totalLost} theirs`,
  ];
  if (report.mvp) lines.push(`MVP: ${report.mvp.unitKind} (${report.mvp.kills} kills)`);
  const worst = [...report.playerCasualties.rows].sort((a, b) => b.share - a.share)[0];
  if (worst && worst.share > 0) {
    lines.push(`Hardest hit: ${worst.unitKind} — ${worst.lost} lost (${sharePct(worst.share)})`);
  }
  if (report.captures.length > 0) lines.push(`Captured: ${report.captures.join(", ")}`);
  return lines.join("\n");
}

export async function copyBattleSummary(report: AfterActionReport): Promise<boolean> {
  const text = battleSummaryText(report);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadBattleSummary(report: AfterActionReport): void {
  const blob = new Blob([battleSummaryText(report)], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "battle-summary.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
