/**
 * Task 117: guided first battle. A scripted intro battle: advisor voiceover
 * lines keyed to triggers the sim reports. The script is data — the sim
 * fires triggers, the UI shows the advisor line and objective.
 */

import type { BattleScriptStep } from "./types.js";

export const FIRST_BATTLE_SCRIPT: BattleScriptStep[] = [
  { step: 0, advisor: "Stay calm. This is a small raider band — perfect for your first command.", trigger: "battle-started", objective: "Survive the battle" },
  { step: 1, advisor: "Those are your infantry. Select them with the 1 key.", trigger: "player-prompted", objective: "Select your infantry (1)" },
  { step: 2, advisor: "Now right-click that hill. High ground wins fights.", trigger: "infantry-selected", objective: "Order infantry to the hill" },
  { step: 3, advisor: "Enemy sighted. Hold position — let them come to you.", trigger: "enemy-sighted", objective: "Hold position" },
  { step: 4, advisor: "They're wavering! Press F to charge and finish it.", trigger: "enemy-wavering", objective: "Order the charge (F)" },
  { step: 5, advisor: "Well fought. Every veteran was a recruit once.", trigger: "battle-won", objective: "Battle complete" },
];

export interface BattleGuide {
  /** Advisor line + objective for a trigger; null when the script has nothing. */
  onTrigger(trigger: string): BattleScriptStep | null;
  steps(): BattleScriptStep[];
  reset(): void;
}

export function createBattleGuide(script: BattleScriptStep[] = FIRST_BATTLE_SCRIPT): BattleGuide {
  const fired = new Set<string>();
  return {
    onTrigger(trigger) {
      const step = script.find((s) => s.trigger === trigger && !fired.has(s.trigger)) ?? null;
      if (step) fired.add(step.trigger);
      return step;
    },
    steps: () => [...script],
    reset() {
      fired.clear();
    },
  };
}
