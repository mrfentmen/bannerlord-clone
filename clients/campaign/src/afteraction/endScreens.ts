/**
 * Task 70: capture and defeat screens. Data shapers for the victory-with-
 * prisoners and the defeat screens — headlines, consequence lists, and the
 * choices each screen offers. Applying consequences (ransom paid, troops
 * lost) is the campaign layer's job.
 */

import type { AfterActionReport } from "./report.js";

export interface EndScreenChoice {
  id: string;
  label: string;
  hint: string;
}

export interface EndScreen {
  headline: string;
  subhead: string;
  lines: string[];
  choices: EndScreenChoice[];
}

export function victoryScreen(report: AfterActionReport): EndScreen {
  const lines = [
    `${report.playerKills} enemies slain for ${report.playerCasualties.totalLost} of our own.`,
  ];
  const choices: EndScreenChoice[] = [{ id: "continue", label: "Continue", hint: "Return to the campaign." }];
  if (report.captures.length > 0) {
    lines.push(`Captured: ${report.captures.join(", ")}.`);
    choices.unshift(
      { id: "ransom", label: "Ransom prisoners", hint: "Coin now, no recruits." },
      { id: "recruit", label: "Recruit prisoners", hint: "Troops later, less coin." },
    );
  }
  if (report.mvp) {
    lines.push(`MVP: ${report.mvp.unitKind} with ${report.mvp.kills} kills.`);
  }
  return {
    headline: "Victory",
    subhead: report.battleLabel,
    lines,
    choices,
  };
}

export function defeatScreen(report: AfterActionReport): EndScreen {
  return {
    headline: "Defeat",
    subhead: report.battleLabel,
    lines: [
      `We lost ${report.playerCasualties.totalLost} troops and slew ${report.playerKills}.`,
      "The survivors fall back to regroup. The war goes on.",
    ],
    choices: [
      { id: "retreat", label: "Retreat", hint: "Save what remains of the force." },
      { id: "ransom", label: "Pay ransom", hint: "Buy back captured troops with coin." },
    ],
  };
}
