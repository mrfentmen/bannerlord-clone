/**
 * Custom battle share codes (Rowan solo task 36).
 *
 * Export a battle setup as a short code string ("BL-…") and import it back.
 * The payload is compact JSON, base64url-encoded; imports validate the
 * shape and reject malformed codes with a reason.
 */

import type { BattleConfig } from "./types.js";
import { generateSkirmish } from "./skirmish.js";

const PREFIX = "BL-";

/**
 * Browser-safe base64url encode/decode (no Node Buffer — this code runs
 * in the browser). Handles UTF-8 via TextEncoder/TextDecoder.
 */
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

interface SharePayload {
  v: 1;
  mode: BattleConfig["mode"];
  label: string;
  player: BattleConfig["player"];
  enemy: BattleConfig["enemy"];
  biome: BattleConfig["biome"];
  modifiers: string[];
  seed: number;
}

/** Export a battle setup as a share code. */
export function exportShareCode(config: BattleConfig): string {
  const payload: SharePayload = {
    v: 1,
    mode: config.mode,
    label: config.label,
    player: config.player,
    enemy: config.enemy,
    biome: config.biome,
    modifiers: config.modifiers,
    seed: config.seed,
  };
  const json = JSON.stringify(payload);
  const b64 = base64UrlEncode(json);
  return PREFIX + b64;
}

export interface ShareCodeResult {
  ok: boolean;
  config?: BattleConfig;
  reason?: string;
}

/** Import a share code back into a battle setup. Never throws. */
export function importShareCode(code: string): ShareCodeResult {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) {
    return { ok: false, reason: "not a battle share code (must start with BL-)" };
  }
  const b64 = trimmed.slice(PREFIX.length);
  if (b64.length === 0) return { ok: false, reason: "empty share code" };
  let payload: unknown;
  try {
    const json = base64UrlDecode(b64);
    payload = JSON.parse(json);
  } catch {
    return { ok: false, reason: "share code is corrupted or malformed" };
  }
  const p = payload as Partial<SharePayload>;
  if (p.v !== 1) return { ok: false, reason: `unsupported share code version` };
  if (typeof p.seed !== "number" || !p.player || !p.enemy || !p.biome) {
    return { ok: false, reason: "share code is missing battle data" };
  }
  const config: BattleConfig = {
    mode: p.mode ?? "custom",
    label: p.label ?? "Shared battle",
    player: p.player,
    enemy: p.enemy,
    biome: p.biome,
    modifiers: Array.isArray(p.modifiers) ? p.modifiers : [],
    seed: p.seed,
  };
  return { ok: true, config };
}

/** Round-trip a generated skirmish through a share code (sanity helper). */
export function skirmishShareCode(seed?: number): string {
  return exportShareCode(generateSkirmish(seed));
}
