/**
 * Vassal management panel (Rowan solo task 60).
 *
 * Lists the clan's vassals with loyalty and their current assignment.
 * Assignments grant the clan a bonus while the vassal holds them; loyalty
 * shifts with treatment. Persists in localStorage.
 */

export type VassalAssignment = "tax-collector" | "warden" | "emissary" | "unassigned";

export const VASSAL_ASSIGNMENTS: VassalAssignment[] = ["tax-collector", "warden", "emissary", "unassigned"];

export interface Vassal {
  id: string;
  name: string;
  fief: string;
  /** 0..100 loyalty. */
  loyalty: number;
  assignment: VassalAssignment;
}

const STORE_KEY = "campaign.vassals.v1";

const ASSIGNMENT_BONUS: Record<Exclude<VassalAssignment, "unassigned">, string> = {
  "tax-collector": "tax income +10%",
  warden: "fief defense +10%",
  emissary: "diplomacy +10%",
};

function load(): Vassal[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(vassals: Vassal[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(vassals));
  } catch {
    // Session-only vassals.
  }
}

function clampLoyalty(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Add a vassal (loyalty starts at 50). */
export function addVassal(id: string, name: string, fief: string): Vassal[] {
  const vassals = load();
  if (vassals.some((v) => v.id === id)) throw new Error(`vassal already exists: ${id}`);
  vassals.push({ id, name, fief, loyalty: 50, assignment: "unassigned" });
  save(vassals);
  return vassals;
}

/** Vassals sorted by loyalty, lowest first (trouble at the top). */
export function vassals(): Vassal[] {
  return load().sort((a, b) => a.loyalty - b.loyalty);
}

/** Assign a vassal; returns the updated vassal. */
export function assignVassal(id: string, assignment: VassalAssignment): Vassal {
  const vassals = load();
  const v = vassals.find((x) => x.id === id);
  if (!v) throw new Error(`unknown vassal: ${id}`);
  v.assignment = assignment;
  save(vassals);
  return { ...v };
}

/** Shift a vassal's loyalty (gifts raise it, slights lower it). */
export function shiftLoyalty(id: string, delta: number): Vassal {
  const vassals = load();
  const v = vassals.find((x) => x.id === id);
  if (!v) throw new Error(`unknown vassal: ${id}`);
  v.loyalty = clampLoyalty(v.loyalty + delta);
  save(vassals);
  return { ...v };
}

/** The clan bonus an assignment grants, or null when unassigned. */
export function vassalBonus(vassal: Vassal): string | null {
  if (vassal.assignment === "unassigned") return null;
  return ASSIGNMENT_BONUS[vassal.assignment];
}

/** One-line panel row. */
export function vassalRow(v: Vassal): string {
  const bonus = vassalBonus(v);
  return `${v.name} of ${v.fief} — loyalty ${v.loyalty}, ${v.assignment}${bonus ? ` (${bonus})` : ""}`;
}
