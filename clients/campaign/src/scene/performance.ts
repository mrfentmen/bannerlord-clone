/**
 * Performance budgets and the auto quality scaler. MASTER_PLAN.md section 4F.
 *
 * The budgets (task 151) are pinned by src/scene/__tests__/performance-budgets.test.ts,
 * which CI runs, so nobody can quietly lower the bar in a diff.
 *
 * The scaler (task 152) watches the engine frame rate and steps the quality tier
 * down when the frame rate stays under 30fps for 3 seconds: first the LOD bias and
 * render scale drop, then shadows and post-processing go off. The scene applies
 * each tier through the onTierChange callback. Recovery steps back up only after
 * a sustained 55fps, so it does not oscillate.
 *
 * Nothing here touches Babylon directly; it works on frame deltas in milliseconds,
 * so it is testable without a renderer.
 */

/** Task 151: the frame-rate budgets. Do not change these without updating the CI perf test. */
export const PERFORMANCE_BUDGETS = {
  /** Campaign map, desktop: 60fps. */
  campaignMapFps: 60,
  /** A 1k-unit battle, desktop: 30fps. */
  battleFps: 30,
  /** The battle the 30fps budget is measured against. */
  battleUnitCount: 1000,
  platform: "desktop",
} as const;

/** True when the measured fps meets or beats the budget. */
export function withinBudget(averageFps: number, budgetFps: number): boolean {
  return averageFps >= budgetFps;
}

// ---------------------------------------------------------------------------
// FPS monitor: a rolling window over frame deltas.
// ---------------------------------------------------------------------------

export interface FpsMonitor {
  recordFrame(deltaMs: number): void;
  /** Average fps over the current window, 0 when no frames are recorded. */
  averageFps(): number;
  sampleCount(): number;
}

export function createFpsMonitor(windowMs = 1000): FpsMonitor {
  const deltas: number[] = [];
  let elapsedMs = 0;
  return {
    recordFrame(deltaMs: number): void {
      deltas.push(deltaMs);
      elapsedMs += deltaMs;
      while (elapsedMs > windowMs && deltas.length > 0) {
        elapsedMs -= deltas.shift() as number;
      }
    },
    averageFps(): number {
      if (deltas.length === 0 || elapsedMs <= 0) return 0;
      return (deltas.length / elapsedMs) * 1000;
    },
    sampleCount(): number {
      return deltas.length;
    },
  };
}

// ---------------------------------------------------------------------------
// Quality tiers: high -> medium -> low.
// ---------------------------------------------------------------------------

export interface QualityTier {
  name: "high" | "medium" | "low";
  /** Babylon real-time shadows on or off. */
  shadows: boolean;
  /** Multiplier on LOD switch distances: lower shows cheaper geometry sooner. */
  lodBias: number;
  /** The locked post-processing pipeline on or off. */
  postProcessing: boolean;
  /** Render scale relative to the canvas size. */
  renderScale: number;
}

export const QUALITY_TIERS: readonly QualityTier[] = [
  { name: "high", shadows: true, lodBias: 1, postProcessing: true, renderScale: 1 },
  { name: "medium", shadows: true, lodBias: 0.65, postProcessing: true, renderScale: 0.85 },
  { name: "low", shadows: false, lodBias: 0.4, postProcessing: false, renderScale: 0.7 },
] as const;

// ---------------------------------------------------------------------------
// Pure decision logic, so the timing rules are unit-testable.
// ---------------------------------------------------------------------------

/**
 * True when the last `sustainMs` worth of per-second fps samples are ALL below
 * `floorFps`. One-second samples: sustainMs is a multiple of 1000.
 */
export function shouldEngageDrop(fpsPerSecond: number[], floorFps: number, sustainMs: number): boolean {
  const windows = sustainMs / 1000;
  if (fpsPerSecond.length < windows) return false;
  const tail = fpsPerSecond.slice(-windows);
  return tail.every((fps) => fps < floorFps);
}

// ---------------------------------------------------------------------------
// The scaler.
// ---------------------------------------------------------------------------

export interface QualityScaler {
  recordFrame(deltaMs: number): void;
  currentTier(): QualityTier;
  /** Jump back to high quality, e.g. after the user picks "High" in settings. */
  resetToHigh(): void;
}

export interface QualityScalerOptions {
  onTierChange: (tier: QualityTier) => void;
  /** Drop when the frame rate stays under this for dropAfterMs. Default 30. */
  dropFps?: number;
  /** Default 3000: the scaler engages within 3s of a sustained drop. */
  dropAfterMs?: number;
  /** Step back up only after sustaining this. Default 55. */
  recoverFps?: number;
  /** Default 10000: recovery needs a 10s healthy run, so it does not oscillate. */
  recoverAfterMs?: number;
}

export function createQualityScaler(options: QualityScalerOptions): QualityScaler {
  const dropFps = options.dropFps ?? 30;
  const dropAfterMs = options.dropAfterMs ?? 3000;
  const recoverFps = options.recoverFps ?? 55;
  const recoverAfterMs = options.recoverAfterMs ?? 10000;
  let tierIndex = 0;
  let windowMs = 0;
  let windowFrames = 0;
  const fpsPerSecond: number[] = [];

  function evaluate(): void {
    if (fpsPerSecond.length === 0) return;
    if (tierIndex < QUALITY_TIERS.length - 1 && shouldEngageDrop(fpsPerSecond, dropFps, dropAfterMs)) {
      tierIndex += 1;
      fpsPerSecond.length = 0;
      options.onTierChange(QUALITY_TIERS[tierIndex] as QualityTier);
      return;
    }
    const recoverWindows = recoverAfterMs / 1000;
    if (tierIndex > 0 && fpsPerSecond.length >= recoverWindows) {
      const tail = fpsPerSecond.slice(-recoverWindows);
      if (tail.every((fps) => fps >= recoverFps)) {
        tierIndex -= 1;
        fpsPerSecond.length = 0;
        options.onTierChange(QUALITY_TIERS[tierIndex] as QualityTier);
      }
    }
  }

  return {
    recordFrame(deltaMs: number): void {
      windowMs += deltaMs;
      windowFrames += 1;
      if (windowMs >= 1000) {
        fpsPerSecond.push((windowFrames / windowMs) * 1000);
        windowMs = 0;
        windowFrames = 0;
        evaluate();
      }
    },
    currentTier(): QualityTier {
      return QUALITY_TIERS[tierIndex] as QualityTier;
    },
    resetToHigh(): void {
      if (tierIndex !== 0) {
        tierIndex = 0;
        fpsPerSecond.length = 0;
        options.onTierChange(QUALITY_TIERS[0] as QualityTier);
      }
    },
  };
}
