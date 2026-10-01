/**
 * Diplomacy (MASTER_PLAN 3E, tasks 109-115): envoys, alliance negotiation,
 * non-aggression pacts, vassalage, gifts, reputation, and summits.
 *
 * Negotiation rounds, pact terms, and reputation math live here. The AI
 * side's decisions are the campaign layer's — this module structures the
 * offers, counter-offers, and terms both sides sign.
 */

export interface Envoy {
  id: string;
  name: string;
  mission: string;
  target: string;
  /** Seasons until the envoy returns. */
  eta: number;
  captured: boolean;
}

export interface AllianceOffer {
  from: string;
  to: string;
  terms: string[];
  /** 0..100 demanded commitment from the other side. */
  demand: number;
}

export interface NonAggressionPact {
  parties: [string, string];
  seasonsLeft: number;
  terms: string[];
  violated: boolean;
}

export interface VassalageTerms {
  overlord: string;
  vassal: string;
  tributePerSeason: number;
  militaryObligation: number; // troops owed on call
  autonomy: number; // 0..100
}

export interface Summit {
  id: string;
  host: string;
  attendees: string[];
  agenda: string[];
}
