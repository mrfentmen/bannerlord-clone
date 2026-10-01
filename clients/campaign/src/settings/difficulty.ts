/**
 * Custom difficulty sliders (MASTER_PLAN task 144).
 *
 * Eight fine-grained multipliers in three groups — damage, economy, AI —
 * plus named presets. The values live in the settings blob (schema v2), so
 * they persist, migrate, and apply live like every other setting.
 *
 * Honest boundary: the client only owns persistence and presentation. The
 * consumers are the simulation lanes — the battle sim reads the damage and
 * battle-AI sliders, the economy service reads income/wages/prices, the
 * campaign AI reads aggression — from the settings blob (localStorage key
 * `campaign.settings`). The client's local battle fallback model is a
 * deliberately simple stand-in and intentionally does not consume these;
 * milo's sim and PAX's provider are the systems of record.
 */

export type DifficultyCategory = "damage" | "economy" | "ai";

export const DIFFICULTY_CATEGORIES: { id: DifficultyCategory; label: string }[] = [
  { id: "damage", label: "Damage" },
  { id: "economy", label: "Economy" },
  { id: "ai", label: "AI" },
];

export type DifficultySliderId =
  | "playerDamage"
  | "enemyDamage"
  | "casualtySeverity"
  | "playerIncome"
  | "troopWages"
  | "marketPrices"
  | "aiAggression"
  | "aiBattleSkill";

export interface DifficultySliderDef {
  id: DifficultySliderId;
  label: string;
  hint: string;
  category: DifficultyCategory;
  min: number;
  max: number;
  step: number;
  def: number;
}

/** The eight sliders the plan asks for. 1.0 = the intended experience. */
export const DIFFICULTY_SLIDERS: readonly DifficultySliderDef[] = [
  {
    id: "playerDamage",
    label: "Damage dealt",
    hint: "Damage your troops deal in battle. Above 100% hits harder.",
    category: "damage",
    min: 0.5,
    max: 2,
    step: 0.05,
    def: 1,
  },
  {
    id: "enemyDamage",
    label: "Damage taken",
    hint: "Damage enemies deal to your troops. Above 100% hurts more.",
    category: "damage",
    min: 0.5,
    max: 2,
    step: 0.05,
    def: 1,
  },
  {
    id: "casualtySeverity",
    label: "Casualty severity",
    hint: "How often wounded troops die instead of recovering. Above 100% is bloodier.",
    category: "damage",
    min: 0.5,
    max: 2,
    step: 0.05,
    def: 1,
  },
  {
    id: "playerIncome",
    label: "Income",
    hint: "Gold from trade, workshops, and fiefs. Below 100% is a leaner campaign.",
    category: "economy",
    min: 0.5,
    max: 2,
    step: 0.05,
    def: 1,
  },
  {
    id: "troopWages",
    label: "Troop wages",
    hint: "Daily upkeep for your party and garrisons. Above 100% strains the treasury.",
    category: "economy",
    min: 0.5,
    max: 2,
    step: 0.05,
    def: 1,
  },
  {
    id: "marketPrices",
    label: "Market prices",
    hint: "What goods cost to buy in towns. Above 100% makes trade margins thinner.",
    category: "economy",
    min: 0.5,
    max: 2,
    step: 0.05,
    def: 1,
  },
  {
    id: "aiAggression",
    label: "AI aggression",
    hint: "How boldly rival lords raid, siege, and declare war. Above 100% is a restless realm.",
    category: "ai",
    min: 0.5,
    max: 2,
    step: 0.05,
    def: 1,
  },
  {
    id: "aiBattleSkill",
    label: "AI battle skill",
    hint: "How well enemy commanders use formations and focus fire. Above 100% punishes mistakes.",
    category: "ai",
    min: 0.5,
    max: 2,
    step: 0.05,
    def: 1,
  },
];

export type DifficultyPresetId = "story" | "normal" | "veteran" | "nightmare";

export interface DifficultyPreset {
  id: DifficultyPresetId;
  label: string;
  description: string;
  values: Record<DifficultySliderId, number>;
}

export const DIFFICULTY_PRESETS: Record<DifficultyPresetId, DifficultyPreset> = {
  story: {
    id: "story",
    label: "Story",
    description: "For players here for the campaign, not the grind. You hit harder, the realm hits softer.",
    values: {
      playerDamage: 1.5,
      enemyDamage: 0.6,
      casualtySeverity: 0.6,
      playerIncome: 1.4,
      troopWages: 0.7,
      marketPrices: 0.8,
      aiAggression: 0.7,
      aiBattleSkill: 0.6,
    },
  },
  normal: {
    id: "normal",
    label: "Normal",
    description: "The intended experience. Every slider at 100%.",
    values: {
      playerDamage: 1,
      enemyDamage: 1,
      casualtySeverity: 1,
      playerIncome: 1,
      troopWages: 1,
      marketPrices: 1,
      aiAggression: 1,
      aiBattleSkill: 1,
    },
  },
  veteran: {
    id: "veteran",
    label: "Veteran",
    description: "For seasoned commanders. The realm pushes back on every front.",
    values: {
      playerDamage: 0.9,
      enemyDamage: 1.3,
      casualtySeverity: 1.3,
      playerIncome: 0.8,
      troopWages: 1.2,
      marketPrices: 1.15,
      aiAggression: 1.25,
      aiBattleSkill: 1.3,
    },
  },
  nightmare: {
    id: "nightmare",
    label: "Nightmare",
    description: "Every mistake costs gold or blood. Not for the faint of heart.",
    values: {
      playerDamage: 0.75,
      enemyDamage: 1.6,
      casualtySeverity: 1.6,
      playerIncome: 0.65,
      troopWages: 1.4,
      marketPrices: 1.3,
      aiAggression: 1.5,
      aiBattleSkill: 1.6,
    },
  },
};

export const DIFFICULTY_PRESET_IDS = Object.keys(DIFFICULTY_PRESETS) as DifficultyPresetId[];

export interface DifficultySettings {
  /** The preset these values match, or "custom" once any slider moves off-preset. */
  preset: DifficultyPresetId | "custom";
  values: Record<DifficultySliderId, number>;
}

export const DEFAULT_DIFFICULTY: DifficultySettings = {
  preset: "normal",
  values: { ...DIFFICULTY_PRESETS.normal.values },
};

function clampSlider(def: DifficultySliderDef, v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return def.def;
  return Math.min(def.max, Math.max(def.min, v));
}

/** Which preset (if any) these exact values match. */
export function difficultyPresetFor(values: Record<DifficultySliderId, number>): DifficultyPresetId | "custom" {
  for (const id of DIFFICULTY_PRESET_IDS) {
    const p = DIFFICULTY_PRESETS[id]!.values;
    if (DIFFICULTY_SLIDERS.every((s) => values[s.id] === p[s.id])) return id;
  }
  return "custom";
}

/**
 * Validate a stored difficulty blob. Never throws: garbage becomes defaults,
 * out-of-range values clamp, and the preset label is recomputed from the
 * values so a stale label can never disagree with the sliders.
 */
export function parseDifficulty(raw: unknown): DifficultySettings {
  const v = typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const rawValues = typeof v.values === "object" && v.values !== null && !Array.isArray(v.values)
    ? (v.values as Record<string, unknown>)
    : {};
  const values = {} as Record<DifficultySliderId, number>;
  for (const s of DIFFICULTY_SLIDERS) values[s.id] = clampSlider(s, rawValues[s.id]);
  return { preset: difficultyPresetFor(values), values };
}

/** One click: the whole preset bundle. Returns a fresh object. */
export function applyDifficultyPreset(id: DifficultyPresetId): DifficultySettings {
  return { preset: id, values: { ...DIFFICULTY_PRESETS[id].values } };
}

/** Move one slider. Returns a fresh object with the preset label recomputed. */
export function withDifficultyValue(
  d: DifficultySettings,
  id: DifficultySliderId,
  value: number,
): DifficultySettings {
  const def = DIFFICULTY_SLIDERS.find((s) => s.id === id)!;
  const values = { ...d.values, [id]: clampSlider(def, value) };
  return { preset: difficultyPresetFor(values), values };
}

/** Short human label: the preset name, or "Custom". */
export function difficultySummary(d: DifficultySettings): string {
  return d.preset === "custom" ? "Custom" : DIFFICULTY_PRESETS[d.preset].label;
}
