/**
 * Armor set bonuses (Rowan solo task 97).
 *
 * Matching armor sets grant bonus stats: equip 2 pieces for the minor
 * bonus, all 4 for the major bonus. `setBonuses` shows which bonuses are
 * active and what the next threshold unlocks. Pure model — the equipment
 * layer supplies the equipped piece ids.
 */

export type ArmorSlot = "helm" | "cuirass" | "gauntlets" | "boots";

export const ARMOR_SLOTS: ArmorSlot[] = ["helm", "cuirass", "gauntlets", "boots"];

export interface ArmorSetBonus {
  /** Pieces required. */
  pieces: number;
  /** Bonus stats, e.g. { armor: 5, speed: 2 }. */
  stats: Record<string, number>;
  label: string;
}

export interface ArmorSet {
  id: string;
  name: string;
  /** Piece id per slot. */
  pieces: Record<ArmorSlot, string>;
  bonuses: ArmorSetBonus[];
}

export const ARMOR_SETS: ArmorSet[] = [
  {
    id: "ironclad",
    name: "Ironclad",
    pieces: { helm: "ironclad-helm", cuirass: "ironclad-cuirass", gauntlets: "ironclad-gauntlets", boots: "ironclad-boots" },
    bonuses: [
      { pieces: 2, stats: { armor: 5 }, label: "Ironclad (2): +5 armor" },
      { pieces: 4, stats: { armor: 12, intimidate: 3 }, label: "Ironclad (4): +12 armor, +3 intimidate" },
    ],
  },
  {
    id: "scout",
    name: "Scout's Weave",
    pieces: { helm: "scout-hood", cuirass: "scout-vest", gauntlets: "scout-gloves", boots: "scout-boots" },
    bonuses: [
      { pieces: 2, stats: { speed: 4 }, label: "Scout's Weave (2): +4 speed" },
      { pieces: 4, stats: { speed: 9, stealth: 4 }, label: "Scout's Weave (4): +9 speed, +4 stealth" },
    ],
  },
  {
    id: "warlord",
    name: "Warlord's Plate",
    pieces: { helm: "warlord-helm", cuirass: "warlord-plate", gauntlets: "warlord-gauntlets", boots: "warlord-sabatons" },
    bonuses: [
      { pieces: 2, stats: { leadership: 3 }, label: "Warlord's Plate (2): +3 leadership" },
      { pieces: 4, stats: { leadership: 7, armor: 6 }, label: "Warlord's Plate (4): +7 leadership, +6 armor" },
    ],
  },
];

export interface ActiveSetBonus {
  setId: string;
  setName: string;
  equipped: number;
  active: ArmorSetBonus[];
  /** Next threshold, or null when the set is complete. */
  next: ArmorSetBonus | null;
  line: string;
}

/**
 * Evaluate set bonuses for equipped piece ids. Returns one entry per
 * set with at least one piece equipped.
 */
export function armorSetBonuses(equippedPieceIds: string[]): ActiveSetBonus[] {
  const equipped = new Set(equippedPieceIds);
  const results: ActiveSetBonus[] = [];
  for (const set of ARMOR_SETS) {
    const count = ARMOR_SLOTS.filter((slot) => equipped.has(set.pieces[slot])).length;
    if (count === 0) continue;
    const active = set.bonuses.filter((b) => count >= b.pieces);
    const next = set.bonuses.find((b) => count < b.pieces) ?? null;
    results.push({
      setId: set.id,
      setName: set.name,
      equipped: count,
      active,
      next,
      line:
        active.length > 0
          ? `${set.name} (${count}/4): ${active.map((b) => b.label).join("; ")}.`
          : `${set.name} (${count}/4): no bonus yet — ${next!.pieces} pieces for "${next!.label}".`,
    });
  }
  return results;
}
