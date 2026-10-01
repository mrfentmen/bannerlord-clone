/**
 * Task 63: tournament prize viewer. The prizes on offer, with stats, for
 * inspection before entering. Prizes are data — awarding them to a campaign
 * inventory is the campaign layer's job.
 */

export interface Prize {
  id: string;
  name: string;
  kind: "weapon" | "armor" | "mount" | "coin" | "title";
  stats: Record<string, string>;
  blurb: string;
}

export const TOURNAMENT_PRIZES: Prize[] = [
  {
    id: "prize-sabre",
    name: "Champion's Sabre",
    kind: "weapon",
    stats: { damage: "+18%", speed: "+5%", tier: "3" },
    blurb: "The arena master's own blade, notched in forty bouts.",
  },
  {
    id: "prize-mail",
    name: "Rusted Laurel Mail",
    kind: "armor",
    stats: { protection: "+22%", weight: "heavy", tier: "3" },
    blurb: "Dented, patched, and still the best armor in the yard.",
  },
  {
    id: "prize-charger",
    name: "Midnight Charger",
    kind: "mount",
    stats: { speed: "+15%", charge: "+30%", tier: "3" },
    blurb: "A black charger that has never thrown its rider.",
  },
  {
    id: "prize-purse",
    name: "Winner's Purse",
    kind: "coin",
    stats: { coin: "2,500" },
    blurb: "Coin of the realm, counted twice in front of the crowd.",
  },
  {
    id: "prize-title",
    name: "Champion of the Yard",
    kind: "title",
    stats: { renown: "+50", upkeep: "-10%" },
    blurb: "A title that opens gates and empties taverns.",
  },
];

export function prizeById(id: string): Prize {
  const p = TOURNAMENT_PRIZES.find((x) => x.id === id);
  if (!p) throw new Error(`unknown prize: ${id}`);
  return p;
}
