/**
 * What a failed boot is, and what can honestly still be shown.
 *
 * `main.ts` used to answer an unreachable simulation with a full-screen fatal error and
 * then rethrow, which in a production build is a white screen: the player gets nothing
 * at all, including the map that had already loaded. `CONSTITUTION.md` section 1.3 asks
 * for a plain message and a way to recover, and section 3.2 asks that something shaped
 * like the real thing is on screen before the request. A white screen is neither.
 *
 * So this module answers two questions and nothing else:
 *
 *  1. **What went wrong, in a sentence a player can read.** `classifyBootFailure` turns
 *     any thrown value into a `BootFailure` with a kind, a player sentence and a
 *     developer detail that stays out of the screen (`ART_DIRECTION.md` section 10.3).
 *  2. **What is still true without the simulation.** `surveyFacts` reads the same world
 *     files the map was just drawn from and counts only what those files contain. It is
 *     the input to the offline option on the degraded screen.
 *
 * The line this file exists to hold: **the client never presents a number as simulation
 * state unless the simulation sent it.** An offline count of surveyed settlements is a
 * count of a CSV, so it is real and quotable. Prices, unrest, holdings, the ledger and
 * the cause log have no source at all when the provider is unreachable, so nothing here
 * has an opinion about them, and `surveyFacts` has no field that could carry one. This
 * is the same rule `classifySettlement` follows when a place has no Census figure: say
 * it is unsurveyed rather than substitute a band midpoint (`CONSTITUTION.md` 1.1).
 */

import type { WorldData } from "../world/types.js";

/**
 * Why the boot stopped.
 *
 * `unreachable` and `refused` are both transport: the answer may change without anything
 * on the client changing, so retrying is honest. `unreadable` means the service answered
 * with something this client cannot make sense of, which a retry will not fix, so the
 * degraded screen still offers Retry but says a second identical request is unlikely to
 * help. `unknown` is the honest bucket for a failure this client has never seen before:
 * CONSTITUTION.md section 1.3 forbids swallowing it, so it is named rather than folded
 * into a friendlier kind it may not be.
 */
export type BootFailureKind = "unreachable" | "refused" | "unreadable" | "unknown";

export interface BootFailure {
  kind: BootFailureKind;
  /** One plain sentence, in the voice of the finished product. Never a path or a status code. */
  playerMessage: string;
  /** For the developer console only. Never rendered (`ART_DIRECTION.md` 10.3). */
  developerDetail: string;
  /** Whether asking again could plausibly succeed. Drives the Retry button's wording. */
  retryable: boolean;
  /** True when the world files themselves loaded, so the map underneath is real. */
  worldAvailable: boolean;
}

/** `SimulationUnavailableError`'s own shape, read without importing the fixture's module. */
interface UnavailableLike {
  name?: unknown;
  playerMessage?: unknown;
  developerDetail?: unknown;
  retryable?: unknown;
}

function isUnavailableLike(err: unknown): err is UnavailableLike {
  return typeof err === "object" && err !== null && (err as UnavailableLike).name === "SimulationUnavailableError";
}

/**
 * The sentence for a kind, when the provider did not supply one worth showing.
 *
 * Each is about the situation rather than the mechanism: a player who is told "the
 * request was refused" learns nothing they can act on, and a player who is told "the
 * simulation is not configured" is being told about a build flag, which
 * `ART_DIRECTION.md` section 10.3 keeps off the screen.
 */
const MESSAGE_FOR: Record<BootFailureKind, string> = {
  unreachable: "The world simulation is not answering. It may not be running.",
  refused: "The world simulation refused the request. It may not be running.",
  unreadable: "The world simulation answered, but with something this client cannot read.",
  unknown: "The world simulation could not be read, and the client cannot say why.",
};

/**
 * Turn any thrown value into something the UI can show a player.
 *
 * Total by construction: it takes `unknown` and returns a `BootFailure`, so no caller can
 * reach a catch block that forgot to handle the shape of what arrived. That matters here
 * specifically because `main.ts` has a top-level `await` — an unhandled rejection there is
 * exactly the white screen this module exists to remove.
 *
 * A `SimulationUnavailableError` is trusted for its player message because the provider
 * already wrote it to that standard and there is a test holding it there. Anything else is
 * treated as a sentence we compose, with the original string kept for the console: an
 * exception message from a library is allowed to contain a URL and a port number, and
 * those do not belong on a player's screen.
 */
export function classifyBootFailure(err: unknown, worldAvailable = false): BootFailure {
  if (isUnavailableLike(err)) {
    const kind: BootFailureKind =
      err.retryable === false ? "unreadable" : looksLikeTransport(err.developerDetail) ? kindOfTransport(err.developerDetail) : "unreachable";
    return {
      kind,
      playerMessage:
        typeof err.playerMessage === "string" && err.playerMessage.trim().length > 0
          ? err.playerMessage
          : MESSAGE_FOR[kind],
      developerDetail:
        typeof err.developerDetail === "string" && err.developerDetail.length > 0
          ? err.developerDetail
          : `provider rejected the snapshot read with no detail: ${describe(err)}`,
      retryable: err.retryable !== false,
      worldAvailable,
    };
  }
  const detail = describe(err);
  return {
    kind: "unknown",
    playerMessage: MESSAGE_FOR.unknown,
    developerDetail: `the snapshot read threw a value this client does not recognise: ${detail}`,
    retryable: true,
    worldAvailable,
  };
}

/** The provider's own detail carries the HTTP status or the thrown transport error. */
function looksLikeTransport(detail: unknown): boolean {
  return typeof detail === "string" && /->\s*HTTP\s*\d|threw/.test(detail);
}

function kindOfTransport(detail: unknown): "unreachable" | "refused" {
  if (typeof detail !== "string") return "unreachable";
  // A 4xx is the service saying no to this client; a 5xx or a thrown fetch is the service
  // not being there. Both read the same way to a player, but the distinction decides
  // whether the detail names a status the operator needs.
  const status = /->\s*HTTP\s*(\d{3})/.exec(detail);
  if (!status) return "unreachable";
  const code = Number(status[1]);
  return code >= 400 && code < 500 ? "refused" : "unreachable";
}

function describe(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    // A value that cannot even be stringified is still a failure worth a console line,
    // and `String` on it cannot throw for an ordinary object. The catch is not empty: it
    // returns the fallback, which is the only honest thing left to say.
    return String(err);
  }
}

/**
 * What the world files alone can say, with the simulation switched off.
 *
 * Every field is a count of something in `public/world/**` or a number derived from it by
 * a documented rule. Nothing here describes the state of the world, because nothing in
 * those files does: `DATA-MANIFEST.md` section 1 is explicit that terrain, roads, places
 * and populations are real and that town fields, prices, unrest, rulers and the ledger
 * are the simulation's and are not here yet.
 *
 * `surveyed` and `unsurveyed` are kept apart on purpose. Eleven of the mapped places in
 * the Front Range region, and more in a wider one, have no Census figure, and the count
 * of places *with* a figure is a different and smaller fact than the count of places. A
 * single "487 settlements" would quietly claim every one of them has a population.
 */
export interface SurveyFacts {
  regionName: string;
  /** ISO date from `region.json`, or an empty string when the file does not carry one. */
  retrieved: string;
  settlements: number;
  /** Places with a real population figure behind them. */
  surveyed: number;
  /** Places with none. The client says so rather than substituting a guess. */
  unsurveyed: number;
  roads: number;
  rail: number;
  /** How the unsurveyed places are described wherever they appear. */
  unsurveyedWording: string;
}

/** The wording used for a place with no population figure, everywhere in the client. */
export const UNSURVEYED = "Not surveyed";

/**
 * Count what is in the loaded world data. Reads nothing else and asks nothing of the
 * simulation, so it is safe to call on the degraded path where no provider exists.
 */
export function surveyFacts(world: WorldData | null | undefined): SurveyFacts {
  const settlements = world?.settlements ?? [];
  let surveyed = 0;
  for (const s of settlements) {
    if (s.population !== null && Number.isFinite(s.population) && s.population >= 0) surveyed += 1;
  }
  return {
    regionName: world?.region.name ?? "",
    retrieved: world?.region.retrieved ?? "",
    settlements: settlements.length,
    surveyed,
    unsurveyed: settlements.length - surveyed,
    roads: world?.roads.length ?? 0,
    rail: world?.rail.length ?? 0,
    unsurveyedWording: UNSURVEYED,
  };
}
