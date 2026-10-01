/**
 * Task 86: feast hosting. Invite guests, see the cost up front and a
 * benefit preview: relation deltas per guest plus a realm-wide prestige
 * bump. Hosting is the data; spending the coin is the campaign layer.
 */

export interface FeastGuest {
  id: string;
  name: string;
  /** 0..100 how much they like you now. */
  relation: number;
  /** 1..3 rank weight: higher ranks cost more to impress. */
  rank: number;
}

export interface FeastPreview {
  cost: number;
  /** guestId -> relation delta. */
  relationDeltas: Record<string, number>;
  prestige: number;
}

const BASE_COST = 200;

export function previewFeast(guests: FeastGuest[], lavishness: 1 | 2 | 3): FeastPreview {
  const cost = BASE_COST * lavishness + guests.reduce((s, g) => s + g.rank * 40 * lavishness, 0);
  const relationDeltas: Record<string, number> = {};
  for (const g of guests) {
    // Diminishing returns: guests who already love you gain less.
    const room = Math.max(0, 100 - g.relation);
    relationDeltas[g.id] = Math.min(room, (6 + lavishness * 4) / g.rank);
  }
  return { cost, relationDeltas, prestige: guests.length * lavishness * 2 };
}

export interface Feast {
  guests: FeastGuest[];
  lavishness: 1 | 2 | 3;
  preview: FeastPreview;
}

export function planFeast(guests: FeastGuest[], lavishness: 1 | 2 | 3): Feast {
  if (guests.length === 0) throw new Error("a feast needs at least one guest");
  return { guests, lavishness, preview: previewFeast(guests, lavishness) };
}
