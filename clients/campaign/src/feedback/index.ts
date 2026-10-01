/**
 * Assembles the battle-feedback suite (tasks 49-57) over one overlay.
 * The hub owns a single rAF loop that refreshes the per-frame components
 * (objective markers, edge arrows); event-driven components update on
 * arrival. Everything is destroyed together.
 */

import { h } from "../ui/dom.js";
import type { FeedbackProjection, FeedbackSource } from "./types.js";
import { createKillFeed, type KillFeed } from "./killFeed.js";
import { createBattleLog, type BattleLog } from "./battleLog.js";
import { createDamageNumbers, type DamageNumbers } from "./damageNumbers.js";
import { createDirectionIndicator, type DirectionIndicator } from "./directionIndicator.js";
import { createThreatIndicator, type ThreatIndicator } from "./threatIndicator.js";
import { createObjectiveMarkers, type ObjectiveMarkers } from "./objectiveMarkers.js";
import { createEdgeIndicators, type EdgeIndicators } from "./edgeIndicators.js";
import { createHealthVignette, type HealthVignette } from "./healthVignette.js";
import { createImpactFX, type ImpactFX } from "./impact.js";
export {
  MAX_FLASH_HZ,
  MIN_FLASH_INTERVAL_MS,
  auditPhotosensitivity,
  createFlashGate,
  flashGate,
  formatPhotosensitivityReport,
  listFlashSources,
  registerFlashSource,
  registerPhotosensitivityCommand,
  unregisterFlashSource,
  type FlashAuditFinding,
  type FlashGate,
  type FlashKind,
  type FlashProfile,
} from "./photosensitive.js";

export interface BattleFeedbackOptions {
  /** Element the screen shake applies to (the canvas wrapper). Without it,
   *  shake is a no-op; everything else still works. */
  shakeTarget?: HTMLElement;
}

export interface BattleFeedback {
  root: HTMLElement;
  killFeed: KillFeed;
  battleLog: BattleLog;
  damageNumbers: DamageNumbers;
  direction: DirectionIndicator;
  threat: ThreatIndicator;
  objectives: ObjectiveMarkers;
  edges: EdgeIndicators;
  vignette: HealthVignette;
  impact: ImpactFX;
  /** The battle log as plain text (task 50 accept). */
  exportLog(): string;
  destroy(): void;
}

export function createBattleFeedback(
  source: FeedbackSource,
  projection: FeedbackProjection,
  opts: BattleFeedbackOptions = {},
): BattleFeedback {
  const root = h("div", { class: "fb-root", "data-testid": "fb-root" });
  const killFeed = createKillFeed(source);
  const battleLog = createBattleLog(source);
  const damageNumbers = createDamageNumbers(source, projection);
  const direction = createDirectionIndicator(source, projection);
  const threat = createThreatIndicator(source, projection);
  const objectives = createObjectiveMarkers(source, projection);
  const edges = createEdgeIndicators(source, projection);
  const vignette = createHealthVignette(source);
  const impact = createImpactFX(
    source,
    opts.shakeTarget ? { shakeTarget: opts.shakeTarget } : {},
  );
  root.append(
    killFeed.root,
    battleLog.root,
    damageNumbers.root,
    direction.root,
    threat.root,
    objectives.root,
    edges.root,
    vignette.root,
    impact.root,
  );

  let raf = 0;
  let alive = true;
  const loop = (): void => {
    if (!alive) return;
    objectives.refresh();
    edges.refresh();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    root,
    killFeed,
    battleLog,
    damageNumbers,
    direction,
    threat,
    objectives,
    edges,
    vignette,
    impact,
    exportLog: () => battleLog.exportText(),
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      killFeed.destroy();
      battleLog.destroy();
      damageNumbers.destroy();
      direction.destroy();
      threat.destroy();
      objectives.destroy();
      edges.destroy();
      vignette.destroy();
      impact.destroy();
      root.remove();
    },
  };
}
