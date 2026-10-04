/**
 * City notables: 10-15 NPCs per city with lore and portraits (del order 2026-10-04).
 *
 * Each city in the national network gets a roster of notable residents —
 * merchants, artisans, elders, fixers — Bannerlord-style. Names come from
 * the ethnicity generator (seeded per city so rosters are stable); lore is
 * hand-written per NPC; portraits are assigned from the generated portrait
 * library by ethnicity/gender/age.
 */

export interface CityNotable {
  id: string;
  cityId: string;
  name: string;
  title: string;
  ethnicityId: string;
  gender: "male" | "female";
  /** Portrait library key: `{ethnicity}-{gender}-{age}` e.g. `irish-male-middle`. */
  portraitKey: string;
  /** 2-3 sentences of personal lore. */
  lore: string;
  /** Notable type for UI grouping. */
  type: "merchant" | "artisan" | "elder" | "fixer" | "scholar" | "captain";
  power: number;
}

/** All city notable rosters, keyed by city id. */
export const CITY_NOTABLES: Record<string, CityNotable[]> = {};

export function addNotables(cityId: string, notables: Omit<CityNotable, "id" | "cityId">[]): void {
  CITY_NOTABLES[cityId] = notables.map((n, i) => ({
    ...n,
    id: `${cityId}-notable-${i + 1}`,
    cityId,
  }));
}

/** Get notables for a city, or an empty array. */
export function notablesForCity(cityId: string): CityNotable[] {
  return CITY_NOTABLES[cityId] ?? [];
}

/** Total notable count across all cities. */
export function totalNotableCount(): number {
  return Object.values(CITY_NOTABLES).reduce((sum, list) => sum + list.length, 0);
}
