/**
 * Task 24: photosensitivity guard — no flashing above 3 Hz anywhere in the
 * client (WCAG 2.3.1 "Three Flashes or Below Threshold").
 *
 * Two halves:
 *
 * 1. A registry of every flash-emitting effect in this lane. Each effect
 *    registers a profile with its worst-case flash rate; `auditPhotosensitivity`
 *    flags anything over the 3 Hz limit. That is the audit half of the
 *    acceptance criterion.
 * 2. A runtime flash gate. JS-driven flashes (threat edge, direction arc)
 *    are event-driven, so a burst of events could strobe them faster than
 *    3 Hz. The gate coalesces: at most one flash per source per 1/3 s.
 *
 * Honest boundary: shaders and particle systems inside the 3D scene are the
 * scene lane's (Hana's), not this registry's. They are covered by the
 * scene's own reduced-motion path — `html[data-reduce-motion]` kills every
 * CSS animation/transition client-wide (see ui.css), and
 * CampaignScene.setReduceMotion handles the shader side. CSS-driven flashes
 * registered here (vignette pulse, ping ring) are likewise neutralized by
 * that kill-switch; the JS gate covers what CSS cannot.
 */

export const MAX_FLASH_HZ = 3;
/** Minimum gap between two flashes from the same source: 1/3 s. */
export const MIN_FLASH_INTERVAL_MS = 1000 / MAX_FLASH_HZ;

export type FlashKind = "css" | "js";

export interface FlashProfile {
  /** Stable id, e.g. "fb-threat-flash". Re-registering an id replaces it. */
  id: string;
  /** Human label for audit output. */
  label: string;
  kind: FlashKind;
  /** Worst-case flashes per second this effect can produce. */
  maxRateHz: number;
  /** How the rate was derived, for the audit trail. */
  note?: string;
}

export interface FlashAuditFinding {
  id: string;
  label: string;
  kind: FlashKind;
  maxRateHz: number;
  pass: boolean;
  detail: string;
}

const registry = new Map<string, FlashProfile>();

export function registerFlashSource(profile: FlashProfile): void {
  registry.set(profile.id, { ...profile });
}

export function unregisterFlashSource(id: string): void {
  registry.delete(id);
}

export function listFlashSources(): FlashProfile[] {
  return [...registry.values()];
}

/**
 * The audit half of task 24: every registered flash source checked against
 * the 3 Hz ceiling. Returns one finding per source; `pass` is false for
 * anything over the limit.
 */
export function auditPhotosensitivity(): FlashAuditFinding[] {
  return listFlashSources().map((p) => {
    const pass = p.maxRateHz <= MAX_FLASH_HZ;
    return {
      id: p.id,
      label: p.label,
      kind: p.kind,
      maxRateHz: p.maxRateHz,
      pass,
      detail: pass
        ? `${p.maxRateHz.toFixed(2)} Hz ≤ ${MAX_FLASH_HZ} Hz${p.note ? ` — ${p.note}` : ""}`
        : `EXCEEDS ${MAX_FLASH_HZ} Hz at ${p.maxRateHz.toFixed(2)} Hz${p.note ? ` — ${p.note}` : ""}`,
    };
  });
}

export function formatPhotosensitivityReport(findings: FlashAuditFinding[]): string {
  const lines = findings.map((f) =>
    `${f.pass ? "PASS" : "FAIL"} [${f.kind}] ${f.label} (${f.id}): ${f.detail}`,
  );
  const failures = findings.filter((f) => !f.pass).length;
  lines.push(
    `${findings.length} source(s) audited, ${failures} over the ${MAX_FLASH_HZ} Hz limit.`,
    "Note: 3D scene shaders/particles are the scene lane's; they are covered by",
    "its reduced-motion path (data-reduce-motion kills CSS animation; the scene",
    "adapter handles shaders), not by this registry.",
  );
  return lines.join("\n");
}

export interface FlashGateOptions {
  /** Clock source; defaults to performance.now. Inject a fake in tests. */
  now?: () => number;
}

export interface FlashGate {
  /**
   * Ask to fire a flash for `sourceId`. Returns true when the flash may
   * proceed; false when it must be skipped because the same source flashed
   * within the last 1/3 s (burst coalescing). Sources are independent.
   */
  request(sourceId: string): boolean;
}

export function createFlashGate(options: FlashGateOptions = {}): FlashGate {
  const now = options.now ?? (() => performance.now());
  const lastFired = new Map<string, number>();
  return {
    request(sourceId: string): boolean {
      const t = now();
      const last = lastFired.get(sourceId);
      if (last !== undefined && t - last < MIN_FLASH_INTERVAL_MS) return false;
      lastFired.set(sourceId, t);
      return true;
    },
  };
}

/**
 * The shared gate the lane's flash emitters use. Unit tests should build
 * their own via createFlashGate with an injected clock instead of touching
 * this singleton.
 */
export const flashGate: FlashGate = createFlashGate();

/** Registers a `photosensitivity` command that prints the flash audit. */
export function registerPhotosensitivityCommand(console: {
  register(name: string, fn: (args: string[]) => string): void;
}): void {
  console.register("photosensitivity", () =>
    formatPhotosensitivityReport(auditPhotosensitivity()),
  );
}
