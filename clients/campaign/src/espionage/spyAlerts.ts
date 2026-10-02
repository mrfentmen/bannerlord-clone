/**
 * Enemy spy alerts (Rowan solo task 69).
 *
 * When counter-espionage detects an enemy spy, an alert fires with
 * response options: arrest, turn (double agent), or watch (feed false
 * intel). Each response resolves deterministically from a seed.
 */

export type SpyAlertResponse = "arrest" | "turn" | "watch";

export const SPY_ALERT_RESPONSES: SpyAlertResponse[] = ["arrest", "turn", "watch"];

export interface EnemySpyAlert {
  id: string;
  spyName: string;
  postId: string;
  postName: string;
  /** 0..100 how sure counter-espionage is. */
  certainty: number;
  line: string;
}

export type AlertResolution =
  | { response: SpyAlertResponse; success: boolean; line: string };

const RESPONSE_BLURBS: Record<SpyAlertResponse, string> = {
  arrest: "Arrest the spy. Safe, but the network learns nothing.",
  turn: "Turn them into a double agent. Risky, lucrative.",
  watch: "Watch and feed false intel. Slow, deniable.",
};

export function raiseAlert(
  spyName: string,
  postId: string,
  postName: string,
  certainty: number,
): EnemySpyAlert {
  return {
    id: `alert-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    spyName,
    postId,
    postName,
    certainty: Math.max(0, Math.min(100, Math.round(certainty))),
    line: `A suspected enemy spy — ${spyName} — was spotted at ${postName} (${Math.round(certainty)}% certain).`,
  };
}

/** The response options with their blurbs. */
export function alertResponses(): { response: SpyAlertResponse; blurb: string }[] {
  return SPY_ALERT_RESPONSES.map((response) => ({ response, blurb: RESPONSE_BLURBS[response] }));
}

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function draw(seed: number): number {
  let s = seed >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x21f0aaad);
  s = Math.imul(s ^ (s >>> 15), 0x735a2d97);
  return ((s ^ (s >>> 15)) >>> 0) / 4294967296;
}

/**
 * Respond to an alert. Success odds: arrest 0.9, turn 0.5, watch 0.75,
 * scaled by certainty. Deterministic from alert + response + seed.
 */
export function respondToAlert(
  alert: EnemySpyAlert,
  response: SpyAlertResponse,
  seed: number,
): AlertResolution {
  if (!SPY_ALERT_RESPONSES.includes(response)) throw new Error(`unknown alert response: ${response}`);
  const base = response === "arrest" ? 0.9 : response === "turn" ? 0.5 : 0.75;
  const chance = base * (0.5 + alert.certainty / 200);
  const success = draw(hash(`${alert.id}:${response}`) ^ (seed >>> 0)) < chance;
  const lines: Record<SpyAlertResponse, [string, string]> = {
    arrest: [
      `${alert.spyName} rots in a cell. Their handlers go quiet.`,
      `${alert.spyName} slipped the arrest — it seems the suspicion was misplaced, or they were warned.`,
    ],
    turn: [
      `${alert.spyName} now works for you. Their reports go to your spymaster first.`,
      `${alert.spyName} played along, then vanished with your coin.`,
    ],
    watch: [
      `You feed ${alert.spyName} false intel for months. Their masters act on lies.`,
      `${alert.spyName} noticed the watchers and went to ground.`,
    ],
  };
  const [win, lose] = lines[response];
  return { response, success, line: success ? win : lose };
}
