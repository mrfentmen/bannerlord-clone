/**
 * Spy assignment map view (Rowan solo task 61).
 *
 * Spies take missions; the map view shows each placed spy with their
 * mission icon. Mission icons are simple glyphs the map layer renders —
 * this module emits the data, the map itself stays in Hana's lane.
 */

export type SpyMissionKind = "gather-intel" | "sabotage" | "steal-plans" | "spread-rumors" | "lay-low";

export const SPY_MISSIONS: SpyMissionKind[] = ["gather-intel", "sabotage", "steal-plans", "spread-rumors", "lay-low"];

/** Map glyph per mission. */
export const MISSION_ICONS: Record<SpyMissionKind, string> = {
  "gather-intel": "◉",
  sabotage: "✸",
  "steal-plans": "▤",
  "spread-rumors": "≋",
  "lay-low": "…",
};

export interface SpyMission {
  spyId: string;
  kind: SpyMissionKind;
  /** Campaign day the mission completes. */
  completesDay: number;
}

export interface SpyMapMarker {
  spyId: string;
  spyName: string;
  postId: string;
  postName: string;
  mission: SpyMissionKind | null;
  icon: string;
  atRisk: boolean;
}

const STORE_KEY = "campaign.spy-missions.v1";

function load(): SpyMission[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(missions: SpyMission[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(missions));
  } catch {
    // Session-only missions.
  }
}

/** Assign a mission to a spy. Replaces any existing mission. */
export function assignMission(spyId: string, kind: SpyMissionKind, completesDay: number): SpyMission {
  if (!SPY_MISSIONS.includes(kind)) throw new Error(`unknown spy mission: ${kind}`);
  const missions = load().filter((m) => m.spyId !== spyId);
  const mission: SpyMission = { spyId, kind, completesDay };
  missions.push(mission);
  save(missions);
  return mission;
}

/** The mission a spy is on, or null. */
export function spyMission(spyId: string): SpyMission | null {
  return load().find((m) => m.spyId === spyId) ?? null;
}

/** Cancel a spy's mission. */
export function cancelMission(spyId: string): void {
  save(load().filter((m) => m.spyId !== spyId));
}

export interface PlacedSpy {
  id: string;
  name: string;
  post: string;
  cover: number;
}

/**
 * Map-view markers: each placed spy with their mission icon.
 * postNames resolves post ids to display names.
 */
export function spyMapMarkers(
  spies: PlacedSpy[],
  postNames: Record<string, string>,
): SpyMapMarker[] {
  const missions = new Map(load().map((m) => [m.spyId, m]));
  return spies.map((s) => {
    const mission = missions.get(s.id)?.kind ?? null;
    return {
      spyId: s.id,
      spyName: s.name,
      postId: s.post,
      postName: postNames[s.post] ?? s.post,
      mission,
      icon: mission ? MISSION_ICONS[mission] : "○",
      atRisk: s.cover < 30,
    };
  });
}
