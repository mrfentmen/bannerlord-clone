/**
 * Clan & family (MASTER_PLAN 3A, tasks 76-84): family tree, marriage
 * alliances, child education, heirs and succession, banner designer, clan
 * laws, companions and loyalty.
 *
 * Data-level domain logic plus DOM viewers. Applying outcomes to the live
 * campaign (troop bonuses, realm splits, map banners) goes through the
 * narrow hooks each file documents — the campaign layer owns the world.
 */

export interface ClanMember {
  id: string;
  name: string;
  gender: "m" | "f";
  birthYear: number;
  deathYear?: number;
  fatherId?: string;
  motherId?: string;
  spouseId?: string;
  traits: string[];
  /** Skill name -> 0-100. */
  skills: Record<string, number>;
}

export type InheritanceLaw = "primogeniture" | "ultimogeniture" | "partible" | "elective";
export type MarriagePolicy = "alliance-first" | "love-match" | "dowry-first";

export interface ClanLaws {
  inheritance: InheritanceLaw;
  marriagePolicy: MarriagePolicy;
}

export interface Companion extends ClanMember {
  /** 0-100 loyalty; below 30 triggers warnings/events (task 84). */
  loyalty: number;
  /** Party id the companion is assigned to, if any. */
  partyId?: string;
  /** Role within the party, if any. */
  role?: string;
}

export interface DowryOffer {
  coin: number;
  land: string[];
}

export interface MarriageProposal {
  suitorId: string;
  targetId: string;
  dowry: DowryOffer;
  /** 0..1 acceptance odds, shown before proposing (task 77). */
  odds: number;
}

export interface TutorAssignment {
  childId: string;
  tutorId: string;
  skill: string;
}

export type BannerPattern = "stripes" | "cross" | "chevron" | "border" | "halved";

export interface ClanBanner {
  primary: string;
  secondary: string;
  pattern: BannerPattern;
  sigil: string;
}

export const DEFAULT_LAWS: ClanLaws = {
  inheritance: "primogeniture",
  marriagePolicy: "alliance-first",
};
