/**
 * Tasks 113-115: gift diplomacy, diplomatic reputation, and summits.
 *
 * Gifts: relation gain scales with the gift's value relative to the
 * recipient's wealth and with how much they already like you (diminishing).
 *
 * Reputation: breaking deals lowers honor; honor modifies every future
 * negotiation's accept odds. The ledger is append-only — broken deals are
 * never forgotten, only outweighed by kept ones.
 *
 * Summits: multi-faction gatherings. Each attendee votes on each agenda
 * item; items pass by simple majority of those present.
 */

export interface GiftResult {
  value: number;
  recipient: string;
  relationGain: number;
}

/**
 * `recipientWealth` scales the gift: a rich lord shrugs at 100 coin.
 * `currentRelation` 0..100 gives diminishing returns.
 */
export function sendGift(value: number, recipient: string, recipientWealth: number, currentRelation: number): GiftResult {
  if (value <= 0) throw new Error("gift must have positive value");
  const scale = value / Math.max(100, recipientWealth / 10);
  const room = Math.max(0, 100 - currentRelation);
  const relationGain = Math.min(room, scale * 10);
  return { value, recipient, relationGain };
}

export interface ReputationLedger {
  honor(): number;
  recordKept(deal: string): void;
  recordBroken(deal: string): void;
  history(): { deal: string; kept: boolean }[];
}

export function createReputationLedger(): ReputationLedger {
  const log: { deal: string; kept: boolean }[] = [];
  return {
    honor() {
      // Starts at 50; kept deals +3, broken deals -12. Broken deals haunt.
      return Math.min(100, Math.max(0, 50 + log.reduce((s, e) => s + (e.kept ? 3 : -12), 0)));
    },
    recordKept: (deal) => {
      log.push({ deal, kept: true });
    },
    recordBroken: (deal) => {
      log.push({ deal, kept: false });
    },
    history: () => [...log],
  };
}

export interface SummitVote {
  agendaItem: string;
  votes: Record<string, boolean>; // attendee -> in favor
  passed: boolean;
}

export function holdSummit(host: string, attendees: string[], agenda: string[]): { id: string; host: string; attendees: string[]; agenda: string[] } {
  if (attendees.length < 2) throw new Error("a summit needs at least two attendees");
  return { id: `summit-${host}-${attendees.length}`, host, attendees: [...attendees], agenda: [...agenda] };
}

/** Vote an agenda item; passes by simple majority of attendees present. */
export function voteAgendaItem(
  attendees: string[],
  agendaItem: string,
  votes: Record<string, boolean>,
): SummitVote {
  const present = attendees.filter((a) => a in votes);
  const inFavor = present.filter((a) => votes[a]).length;
  return { agendaItem, votes: { ...votes }, passed: inFavor > present.length / 2 };
}
