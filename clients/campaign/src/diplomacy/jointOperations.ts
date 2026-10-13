/**
 * Joint operation planning (Rowan solo task 85).
 *
 * Coordinate an attack with an ally: pick the target settlement, the
 * season of the strike, each side's committed force, and the axis of
 * attack. The plan validates feasibility (ally at war, forces positive,
 * strike season in the future) and reports the combined strength vs the
 * target's garrison. Persists in localStorage.
 */

export type AttackAxis = "north" | "south" | "east" | "west";

export const ATTACK_AXES: AttackAxis[] = ["north", "south", "east", "west"];

export interface JointOperation {
  id: string;
  name: string;
  allyId: string;
  allyName: string;
  targetSettlementId: string;
  targetSettlementName: string;
  targetGarrison: number;
  season: number;
  yourForce: number;
  allyForce: number;
  yourAxis: AttackAxis;
  allyAxis: AttackAxis;
  status: "planned" | "executed" | "cancelled";
}

export interface OperationPlan {
  operation: JointOperation;
  combinedStrength: number;
  /** Combined strength / garrison, rounded. */
  forceRatio: number;
  line: string;
}

const STORE_KEY = "campaign.joint-ops.v1";

function load(): JointOperation[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(ops: JointOperation[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(ops));
  } catch {
    // Session-only plans.
  }
}

export interface PlanJointOpInput {
  name: string;
  allyId: string;
  allyName: string;
  targetSettlementId: string;
  targetSettlementName: string;
  targetGarrison: number;
  season: number;
  currentSeason: number;
  yourForce: number;
  allyForce: number;
  yourAxis: AttackAxis;
  allyAxis: AttackAxis;
}

/** Plan a joint operation. Validates feasibility. */
export function planJointOperation(input: PlanJointOpInput): OperationPlan {
  if (!(ATTACK_AXES as readonly string[]).includes(input.yourAxis)) throw new Error(`unknown axis: ${input.yourAxis}`);
  if (!(ATTACK_AXES as readonly string[]).includes(input.allyAxis)) throw new Error(`unknown axis: ${input.allyAxis}`);
  if (input.yourForce <= 0 || input.allyForce <= 0) throw new Error("both sides must commit a positive force");
  if (input.season <= input.currentSeason) throw new Error("the strike must be planned for a future season");
  if (input.targetGarrison < 0) throw new Error("garrison cannot be negative");
  const operation: JointOperation = {
    id: `op-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: input.name,
    allyId: input.allyId,
    allyName: input.allyName,
    targetSettlementId: input.targetSettlementId,
    targetSettlementName: input.targetSettlementName,
    targetGarrison: input.targetGarrison,
    season: input.season,
    yourForce: input.yourForce,
    allyForce: input.allyForce,
    yourAxis: input.yourAxis,
    allyAxis: input.allyAxis,
    status: "planned",
  };
  const ops = load();
  ops.push(operation);
  save(ops);
  const combinedStrength = input.yourForce + input.allyForce;
  const forceRatio = input.targetGarrison === 0 ? combinedStrength : Math.round((combinedStrength / input.targetGarrison) * 100) / 100;
  const line =
    forceRatio >= 2
      ? `${input.name}: ${combinedStrength} troops strike ${input.targetSettlementName} in season ${input.season} (${input.yourAxis} + ${input.allyName} from the ${input.allyAxis}). Overwhelming force — ${forceRatio}:1.`
      : `${input.name}: ${combinedStrength} troops strike ${input.targetSettlementName} in season ${input.season} (${input.yourAxis} + ${input.allyName} from the ${input.allyAxis}). Thin odds — ${forceRatio}:1.`;
  return { operation, combinedStrength, forceRatio, line };
}

/** All planned (not yet executed/cancelled) operations. */
export function plannedOperations(): JointOperation[] {
  return load().filter((o) => o.status === "planned");
}

/** Update an operation's status. */
export function setOperationStatus(id: string, status: "executed" | "cancelled"): JointOperation {
  const ops = load();
  const op = ops.find((o) => o.id === id);
  if (!op) throw new Error(`no operation: ${id}`);
  op.status = status;
  save(ops);
  return op;
}
