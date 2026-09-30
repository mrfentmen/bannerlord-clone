/**
 * One call to get the real world: the files, the heightfield, the projection, and the
 * route graph, with progress reported for the boot skeleton.
 *
 * Kept separate from `main.ts` so the boot sequence reads as a sequence and so this
 * can be exercised without a DOM.
 */

import { indexSettlements, loadWorldData, makeProjection } from "./load.js";
import type { Projection, SettlementIndex } from "./types.js";
import { buildRouteGraph, type RouteGraph } from "../scene/network.js";
import type { WorldData } from "./types.js";

export interface BuiltWorld {
  data: WorldData;
  projection: Projection;
  graph: RouteGraph;
  settlements: SettlementIndex;
}

export type BootStage = "survey" | "terrain" | "graph";
export type ProgressFn = (stage: string, loaded: number, total: number) => void;

export async function buildWorld(baseUrl: string, onProgress?: ProgressFn): Promise<BuiltWorld> {
  onProgress?.("survey", 0, 3);
  const data = await loadWorldData({
    baseUrl,
    onStage: (stage, loaded, total) => onProgress?.(stage, loaded, total),
  });

  onProgress?.("graph", 0, 1);
  const projection = makeProjection(data.region, data.heightfield);
  const graph = buildRouteGraph(data.roads, data.settlements, projection);
  onProgress?.("graph", 1, 1);

  return { data, projection, graph, settlements: indexSettlements(data.settlements) };
}
