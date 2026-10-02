/**
 * Battle plan templates (Rowan solo task 22).
 *
 * Saved deployments (task 38) pin specific units to positions. Plan
 * templates are one level up: a NAMED formation (e.g. "Shield wall") that
 * assigns slots by unit role, so the same plan applies to any army. Applying
 * a template maps the army's units onto slots by role, front to back.
 */

import type { FormationPreset } from "./types.js";

export type PlanUnitRole = "infantry" | "archers" | "cavalry";

export interface PlanSlot {
  role: PlanUnitRole;
  /** Metres right of the formation anchor. */
  dx: number;
  /** Metres forward of the formation anchor. */
  dy: number;
}

export interface PlanTemplate {
  name: string;
  formation: FormationPreset;
  slots: PlanSlot[];
  savedAt: string;
}

/** Built-in plans every player starts with. */
export const BUILTIN_PLANS: PlanTemplate[] = [
  {
    name: "Shield wall",
    formation: "line",
    savedAt: "builtin",
    slots: [
      { role: "infantry", dx: -20, dy: 0 },
      { role: "infantry", dx: 0, dy: 0 },
      { role: "infantry", dx: 20, dy: 0 },
      { role: "archers", dx: -10, dy: -15 },
      { role: "archers", dx: 10, dy: -15 },
      { role: "cavalry", dx: -30, dy: -10 },
      { role: "cavalry", dx: 30, dy: -10 },
    ],
  },
  {
    name: "Hammer and anvil",
    formation: "wedge",
    savedAt: "builtin",
    slots: [
      { role: "infantry", dx: 0, dy: 0 },
      { role: "infantry", dx: -15, dy: -5 },
      { role: "infantry", dx: 15, dy: -5 },
      { role: "cavalry", dx: -40, dy: 10 },
      { role: "cavalry", dx: 40, dy: 10 },
      { role: "archers", dx: 0, dy: -20 },
    ],
  },
];

const STORAGE_KEY = "campaign.planTemplates.v1";
const MAX_PLANS = 20;

function resolveStorage(provided?: Storage): Storage | null {
  if (provided) return provided;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function isPlan(value: unknown): value is PlanTemplate {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.name === "string" &&
    (p.formation === "line" || p.formation === "column" || p.formation === "wedge") &&
    Array.isArray(p.slots) &&
    p.slots.every(
      (s) =>
        typeof s === "object" &&
        s !== null &&
        ["infantry", "archers", "cavalry"].includes((s as PlanSlot).role) &&
        typeof (s as PlanSlot).dx === "number" &&
        typeof (s as PlanSlot).dy === "number",
    )
  );
}

/** All plans: builtins first, then the player's saved ones. */
export function loadPlanTemplates(provided?: Storage): PlanTemplate[] {
  const storage = resolveStorage(provided);
  if (!storage) return [...BUILTIN_PLANS];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [...BUILTIN_PLANS];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...BUILTIN_PLANS];
    return [...BUILTIN_PLANS, ...parsed.filter(isPlan)];
  } catch {
    return [...BUILTIN_PLANS];
  }
}

/** Save a player plan. Returns false when the name is taken or storage fails. */
export function savePlanTemplate(plan: PlanTemplate, provided?: Storage): boolean {
  const name = plan.name.trim();
  if (name === "" || name.length > 60) return false;
  const storage = resolveStorage(provided);
  if (!storage) return false;
  const existing = loadPlanTemplates(storage).filter((p) => p.savedAt !== "builtin");
  if (existing.some((p) => p.name.toLowerCase() === name.toLowerCase())) return false;
  if (existing.length >= MAX_PLANS) return false;
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify([...existing, { ...plan, name, savedAt: new Date().toISOString() }]),
    );
    return true;
  } catch {
    return false;
  }
}

/** Delete a player plan by name. Builtins cannot be deleted. */
export function deletePlanTemplate(name: string, provided?: Storage): boolean {
  const storage = resolveStorage(provided);
  if (!storage) return false;
  const existing = loadPlanTemplates(storage).filter((p) => p.savedAt !== "builtin");
  const next = existing.filter((p) => p.name !== name);
  if (next.length === existing.length) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export interface PlannableUnit {
  id: string;
  role: PlanUnitRole;
}

export interface PlannedPlacement {
  unitId: string;
  dx: number;
  dy: number;
}

/**
 * Map units onto a plan's slots by role. Units without a matching slot go
 * to the rear; slots without a unit stay empty. Deterministic.
 */
export function applyPlanTemplate(units: PlannableUnit[], plan: PlanTemplate): PlannedPlacement[] {
  const byRole = new Map<PlanUnitRole, PlannableUnit[]>();
  for (const u of units) {
    const list = byRole.get(u.role) ?? [];
    list.push(u);
    byRole.set(u.role, list);
  }
  const placed: PlannedPlacement[] = [];
  const used = new Set<string>();
  for (const slot of plan.slots) {
    const candidate = (byRole.get(slot.role) ?? []).find((u) => !used.has(u.id));
    if (!candidate) continue;
    used.add(candidate.id);
    placed.push({ unitId: candidate.id, dx: slot.dx, dy: slot.dy });
  }
  // Leftovers form up behind the formation.
  let rear = -30;
  for (const u of units) {
    if (used.has(u.id)) continue;
    placed.push({ unitId: u.id, dx: 0, dy: rear });
    rear -= 10;
  }
  return placed;
}
