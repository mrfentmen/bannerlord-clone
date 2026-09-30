/**
 * Single source of truth for every tunable constant, loaded from config/crowd.json.
 *
 * CONSTITUTION.md section 1.2 and TESTING_AND_BALANCE.md section 5: no balance, budget or
 * threshold number is hidden in code. The Python pipeline and the TypeScript renderer read the
 * same file, so a LOD threshold cannot drift between the tool that bakes the assets and the code
 * that draws them.
 */

export interface TroopConfig {
  id: string;
  name: string;
  height_m: number;
}

export interface ImpostorConfig {
  angles: number;
  frames: number;
  cell_px: number;
  clip: string;
}

export interface CrowdConfig {
  troop: TroopConfig;
  skeleton: { max_influences: number; weapon_joint: string };
  clips: Record<string, { source: string; loop: boolean }> & { fps: number };
  budgets: {
    close_tris: Record<string, number>;
    mid_tris: Record<string, number>;
  };
  textures: Record<string, number>;
  grade: Record<string, number | number[]>;
  weapon: Record<string, number | number[] | string>;
  impostor: ImpostorConfig;
  /** Added by tools/lod-tune.mjs once thresholds have been measured rather than guessed. */
  lod?: {
    closeMaxM: number;
    midMaxM: number;
    /** The measured fps each threshold decision rests on. */
    evidence?: unknown;
  };
  /** Added by this file's defaults, see DEFAULT_* below. */
  scene?: Record<string, number>;
}

export interface AnimClip {
  rowStart: number;
  rowCount: number;
  duration: number;
  loop: boolean;
}

export interface AnimHeader {
  width: number;
  height: number;
  joints: string[];
  fps: number;
  clips: Record<string, AnimClip>;
}

/** The snake_case shape tools/pipeline/build_troop.py writes. Translated on load, once. */
interface RawAnimHeader {
  width: number;
  height: number;
  joints: string[];
  fps: number;
  clips: Record<string, { row_start: number; row_count: number; duration_s: number; loop: boolean }>;
}

const REQUIRED_KEYS = [
  "troop", "skeleton", "clips", "budgets", "textures", "grade", "weapon", "impostor",
] as const;

export async function loadConfig(url = "config/crowd.json"): Promise<CrowdConfig> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`cannot read ${url}: HTTP ${r.status}. Run tools/build-assets.mjs.`);
  const cfg = (await r.json()) as CrowdConfig;
  for (const k of REQUIRED_KEYS) {
    if (!(k in cfg)) throw new Error(`config/crowd.json is missing required section "${k}"`);
  }
  return cfg;
}

export async function loadAnimHeader(url = "assets/processed/anim_matrices.json"): Promise<AnimHeader> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`cannot read ${url}: HTTP ${r.status}. Run tools/build-assets.mjs.`);
  const j = (await r.json()) as RawAnimHeader;
  const clips: Record<string, AnimClip> = {};
  for (const [k, v] of Object.entries(j.clips)) {
    clips[k] = {
      rowStart: v.row_start,
      rowCount: v.row_count,
      duration: v.duration_s,
      loop: !!v.loop,
    };
  }
  return { width: j.width, height: j.height, joints: j.joints, fps: j.fps, clips };
}
