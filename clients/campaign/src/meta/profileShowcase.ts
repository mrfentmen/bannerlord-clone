/**
 * Player profile showcase (Rowan solo task 100).
 *
 * A shareable summary card of the player's career: name, clan, rank,
 * headline stats, top achievements, and reputation title — rendered as
 * plain text and as a compact card object the UI can display or copy.
 * The share code is a base64url payload (browser-safe, no Buffer).
 */

export interface ProfileShowcase {
  playerName: string;
  clanName: string;
  rank: string;
  seasonsPlayed: number;
  battlesWon: number;
  coinEarned: number;
  achievementsUnlocked: number;
  achievementsTotal: number;
  reputationTitle: string;
}

export interface ShowcaseCard {
  profile: ProfileShowcase;
  /** Human-readable summary card. */
  card: string;
  /** Shareable code (base64url of the JSON payload). */
  shareCode: string;
}

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(code: string): string {
  const padded = code.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Build the showcase card from career facts. */
export function buildShowcase(profile: ProfileShowcase): ShowcaseCard {
  const card = [
    `⚔ ${profile.playerName} of ${profile.clanName}`,
    `Rank: ${profile.rank} — ${profile.reputationTitle}`,
    `${profile.seasonsPlayed} seasons · ${profile.battlesWon} battles won · ${profile.coinEarned} coin earned`,
    `Achievements: ${profile.achievementsUnlocked}/${profile.achievementsTotal}`,
  ].join("\n");
  return { profile: { ...profile }, card, shareCode: base64UrlEncode(JSON.stringify(profile)) };
}

/** Decode a share code back into the profile. */
export function parseShowcaseCode(shareCode: string): ProfileShowcase {
  try {
    const profile = JSON.parse(base64UrlDecode(shareCode)) as ProfileShowcase;
    if (typeof profile.playerName !== "string" || typeof profile.clanName !== "string") {
      throw new Error("bad payload");
    }
    return profile;
  } catch {
    throw new Error("invalid showcase share code");
  }
}
