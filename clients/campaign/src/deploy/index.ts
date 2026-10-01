/**
 * Deployment map (MASTER_PLAN task 31): top-down battlefield preview with
 * placeable units. Built against `docs/BATTLE_TERRAIN.md` contract v1.
 */

export { openDeployment, type DeploymentMapHandle } from "./DeploymentMap.js";
export { fetchPatch, samplePatch } from "./terrain.js";
export type {
  BattlePatch,
  Biome,
  CoverObject,
  DeploymentMapOptions,
  InvalidReason,
  Placement,
  ReinforcementEdge,
  RosterUnit,
  SpawnRect,
  SpawnZones,
  UnitKind,
  ValidationResult,
} from "./types.js";
export { CONTRACT_VERSION, PATCH_CELLS, PATCH_RES, PATCH_SIZE_M } from "./types.js";

import { openDeployment } from "./DeploymentMap.js";
import { samplePatch } from "./terrain.js";
import type { RosterUnit } from "./types.js";

const PREVIEW_ROSTER: RosterUnit[] = [
  { id: "inf-1", label: "1st Infantry", kind: "infantry", count: 120, radius_m: 30 },
  { id: "inf-2", label: "2nd Infantry", kind: "infantry", count: 100, radius_m: 30 },
  { id: "arc-1", label: "Longbowmen", kind: "archers", count: 60, radius_m: 25 },
  { id: "cav-1", label: "Outriders", kind: "cavalry", count: 40, radius_m: 35 },
];

import type { Placement } from "./types.js";

export interface DeploymentPreviewOptions {
  onConfirm?: (placements: Placement[]) => void;
  onChange?: (placements: Placement[]) => void;
}

/**
 * Open the deployment map against the generated preview patch. Stand-in for
 * milo's encounter flow until it calls `openDeployment` with a real wire
 * patch and the player's actual roster.
 */
export function openDeploymentPreview(options: DeploymentPreviewOptions = {}): void {
  const handle = openDeployment({
    patch: samplePatch(),
    roster: PREVIEW_ROSTER,
    onClose: () => undefined,
    ...(options.onConfirm ? { onConfirm: options.onConfirm } : {}),
    ...(options.onChange ? { onChange: options.onChange } : {}),
  });
  document.body.append(handle.root);
}
