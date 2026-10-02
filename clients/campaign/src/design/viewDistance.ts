/**
 * View-distance slider (MASTER_PLAN task 149): LOD distances.
 *
 * viewDistance is a max view distance in world units (metres on the
 * real-geography map). The settings slider runs 80-400 km; the scene sets
 * camera.maxZ and fog density from it, and town 3D clusters pop in/out at
 * the set range (map pins stay — they keep settlements findable at
 * campaign zoom). Pure policy, no Babylon, so it unit-tests directly.
 *
 * The old near/far/ultra select maps onto the slider: near=120 km,
 * far=260 km, ultra=400 km. Stored string values migrate through
 * clampViewDistance.
 */

export const VIEW_DISTANCE_MIN = 80_000;
export const VIEW_DISTANCE_MAX = 400_000;
export const VIEW_DISTANCE_DEFAULT = 260_000;

/** Legacy select value -> slider position. */
export function viewDistanceFromLegacy(value: unknown): number {
  if (value === "near") return 120_000;
  if (value === "far") return VIEW_DISTANCE_DEFAULT;
  if (value === "ultra") return VIEW_DISTANCE_MAX;
  return VIEW_DISTANCE_DEFAULT;
}

/** Clamp any input to the slider range (legacy strings migrate). */
export function clampViewDistance(value: unknown): number {
  if (typeof value === "string") return clampViewDistance(viewDistanceFromLegacy(value));
  if (typeof value !== "number" || !Number.isFinite(value)) return VIEW_DISTANCE_DEFAULT;
  return Math.min(VIEW_DISTANCE_MAX, Math.max(VIEW_DISTANCE_MIN, value));
}

/**
 * Fog density for a view distance, piecewise-linear through the old
 * near/far/ultra tuning: (120 km, 16e-6), (260 km, 8.5e-6), (400 km, 4e-6).
 * Farther views get thinner haze so the extra range stays readable.
 */
export function fogDensityFor(maxZ: number): number {
  const z = clampViewDistance(maxZ);
  const points: Array<[number, number]> = [
    [120_000, 0.000016],
    [260_000, 0.0000085],
    [400_000, 0.000004],
  ];
  for (let i = 0; i < points.length - 1; i++) {
    const [z0, f0] = points[i]!;
    const [z1, f1] = points[i + 1]!;
    if (z <= z1) {
      const t = (z - z0) / (z1 - z0);
      return f0 + (f1 - f0) * t;
    }
  }
  return points[points.length - 1]![1];
}
