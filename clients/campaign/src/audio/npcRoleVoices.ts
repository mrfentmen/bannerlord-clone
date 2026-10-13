/**
 * NPC role voice assignment for content-pack dialogue.
 *
 * The content packs include voiced lines for specific NPC roles:
 * bartender, shopkeeper, merchant, townsman, townswoman, etc.
 * This module maps NPC types to their voice lines and provides
 * triggers to play them.
 *
 * Voice lines are in `public/audio/vox/` with IDs like
 * `vox-bartender-1`, `vox-shopkeeper-2`, etc. Each has a transcript
 * (.txt) with the spoken lines.
 */

import { getAudioManager } from "./AudioManager.js";

/** NPC roles with content-pack voice lines. */
export type NpcRole =
  | "bartender"
  | "shopkeeper"
  | "merchant"
  | "townsman"
  | "townswoman"
  | "captain"
  | "medic"
  | "scout"
  | "gunner"
  | "infantry"
  | "troop"
  | "companion"
  | "leader";

/** Manifest ID for a role's voice line. */
function roleVoiceId(role: NpcRole, variant: number): string {
  return `vox-${role}-${variant}`;
}

/** How many variants exist per role (from content packs). */
const ROLE_VARIANTS: Record<NpcRole, number> = {
  bartender: 2,
  shopkeeper: 2,
  merchant: 1,
  townsman: 3,
  townswoman: 3,
  captain: 4,
  medic: 3,
  scout: 3,
  gunner: 3,
  infantry: 3,
  troop: 4,
  companion: 3,
  leader: 6,
};

let lastPlayAt = 0;
const COOLDOWN_MS = 2000;

function cooledDown(): boolean {
  const now = Date.now();
  if (now - lastPlayAt < COOLDOWN_MS) return false;
  lastPlayAt = now;
  return true;
}

/**
 * Play a role-specific voice line. Use when the player interacts with
 * an NPC of a known role (e.g., clicking the bartender).
 * Picks a random variant for variety.
 */
export function playRoleVoice(role: NpcRole): void {
  if (!cooledDown()) return;
  const variants = ROLE_VARIANTS[role] ?? 1;
  const variant = 1 + Math.floor(Math.random() * variants);
  const id = roleVoiceId(role, variant);
  void getAudioManager().playSfx(id).catch(() => {});
}

/**
 * Map a notable's title/type to an NPC role for voice selection.
 * Falls back to townsman/townswoman based on name.
 */
export function roleForNotable(title: string, name: string): NpcRole {
  const t = title.toLowerCase();
  if (t.includes("bartender") || t.includes("tavern")) return "bartender";
  if (t.includes("shop") || t.includes("store")) return "shopkeeper";
  if (t.includes("merchant") || t.includes("trader")) return "merchant";
  if (t.includes("captain")) return "captain";
  if (t.includes("medic") || t.includes("doctor")) return "medic";
  if (t.includes("scout")) return "scout";
  // Gender guess from name ending (crude but works for ambient chatter)
  const femaleNames = ["a", "e", "i", "y"];
  const lastChar = name.slice(-1).toLowerCase();
  if (femaleNames.includes(lastChar)) return "townswoman";
  return "townsman";
}
