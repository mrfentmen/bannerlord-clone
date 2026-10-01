/**
 * Onboarding (MASTER_PLAN 3F, tasks 116-122): interactive tutorial hints,
 * guided first battle script, tooltip registry with coverage tracking,
 * contextual help overlay, glossary, video guides, and new-player
 * protection.
 *
 * Battle execution stays in the sim's lane — the guided battle is a script
 * of advisor lines and step triggers, not battle mechanics.
 */

export interface TutorialHint {
  id: string;
  /** Screen or UI area this hint belongs to. */
  context: string;
  text: string;
}

export interface BattleScriptStep {
  step: number;
  advisor: string;
  /** Trigger the sim reports, e.g. "battle-started", "enemy-sighted". */
  trigger: string;
  objective: string;
}

export interface GlossaryTerm {
  term: string;
  definition: string;
  tags: string[];
}

export interface VideoGuide {
  id: string;
  title: string;
  duration: string;
  url: string;
}
