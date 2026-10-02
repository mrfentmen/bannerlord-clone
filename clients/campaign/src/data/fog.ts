/**
 * Reading the simulation's fog of war, and nothing more.
 *
 * Every function here is pure and takes the snapshot's `fog` block as it arrived. There
 * is no radius maths, no distance test and no sight line anywhere in this file, and
 * there cannot be: the side of the line in `types.ts` puts the answer in the simulation,
 * and a client that measured visibility itself would know which towns a raid was going
 * to hit before the raiders set out.
 *
 * What the client does own is the join. The map is drawn from OpenStreetMap settlements
 * (`src/world/types.ts`) while fog is stated in simulation town ids, so something has to
 * decide which of the three states each of the map's settlements is in. That is the whole
 * job of this module, and it is a decision about presentation, not about the world.
 *
 * The three states, and why a town in the middle one is not a special case:
 *
 *  - `visible` — in this side's sight now, or seen recently enough that the sighting
 *    memory still carries it. Drawn in full, because everything on the town panel is
 *    current.
 *  - `remembered` — found once, not in sight now. The side knows the town is there and
 *    does not know what is happening in it, so it is drawn greyed rather than hidden:
 *    hiding it would claim the player has forgotten a town they have stood in.
 *  - `unseen` — never found. Drawn not at all, which is the one place this client
 *    disagrees with the server's own reading and says so in `UNSEEN_POLICY` below.
 *
 * A settlement the simulation has no town for is never hidden, for the same reason
 * `missingSettlementNode` in `main.ts` shows it: the place is real, with real ground and
 * a real name, and the simulation having nothing to say about it is not the same as this
 * side not knowing it exists.
 *
 * The three states are three questions, and the fourth one is orthogonal to all of them:
 * how old is the reading? A `remembered` town scouted last week and one scouted last
 * year are in the same state and are not remotely the same fact, so recency is carried
 * beside the state rather than folded into it — `FogIndex` still has exactly three sets,
 * and `TownRecency` is read off `FogState.tick` and `FogState.lastSeen`.
 */

import type { FogState, TownState, TownVisibility } from "./types.js";

/**
 * The one place the client's fog rendering is a policy choice rather than a reading.
 *
 * `cmd/apiserver/snapshot.go` sends every unseen town in full, with its name and its
 * population, and its comment says so on purpose: "A town the player's side has never
 * found is still real and still on the map, and its name is still known from the survey
 * the world was built from." That is a defensible server-side position, and this client
 * is the other half of the decision, so the disagreement is written down here instead of
 * being left in the diff.
 *
 * The client hides unseen towns. Two reasons, and they point the same way. The map is
 * built from the full OpenStreetMap survey, so an unseen town is not merely a town the
 * player has not scouted — it is one whose real population, real coordinates and real
 * roads the client is holding in memory and would otherwise draw, which is a spyglass
 * for free and the exact surprise fog exists to deny. And the sim's own stated reason for
 * having fog at all is that "a raid on a town nobody had heard of could never happen,
 * because the attacker would have known about it before leaving": that only holds if the
 * map does not draw the target either.
 *
 * A party marching into a never-found town reveals it, which is what makes the reveal
 * legible instead of arbitrary.
 */
export const UNSEEN_POLICY = "hidden";

/**
 * The three id lists as sets, built once per snapshot.
 *
 * `active` is the single answer to "may the map be filtered at all", and it is false in
 * two different cases that must not be conflated: the simulation published no fog block,
 * or it published one with no vantage point. In both the map is drawn whole, because
 * "nobody is looking" is not the same claim as "there is nothing to see", and reading it
 * as one would blank the world.
 */
export interface FogIndex {
  /** The side the lists are stated against. `null` when there is no vantage point. */
  sideId: string | null;
  /** Whether the map may be filtered by these lists. See above. */
  active: boolean;
  visible: ReadonlySet<string>;
  known: ReadonlySet<string>;
  unseen: ReadonlySet<string>;
}

const EMPTY: ReadonlySet<string> = new Set<string>();

// -- how old the news is --------------------------------------------------------
//
// The three states say *whether* a town is being watched. They say nothing about how
// stale the reading is, and on a remembered town that is the only thing left to say: the
// place is known, so the only difference between a town scouted last week and one scouted
// last year is the age of what the client is about to show.
//
// `FogState.tick` is what makes this computable. There was a period where this client
// held `TownState.lastSeenTick` and could not use it: `day` is `Tick % 365` and wraps, and
// `TickUpdate.tick` counted frames the server had pushed since startup, so there was
// nothing in the same unit to subtract. Nothing here computes a radius or decides what is
// visible — the bands below are a reading of two numbers the simulation published, in its
// own unit, against a window it also published.

/**
 * How current a town's last sighting is.
 *
 * Four states rather than three, and the fourth is the interesting one. `remembered`
 * alone cannot tell the player whether the numbers on a town's panel are from yesterday
 * or from last spring, and "Remembered" printed over both is a label that does not
 * discriminate.
 *
 * - `now` — sighted on this very tick. Somebody is standing there looking.
 * - `recent` — inside the sighting memory window. The simulation still counts it as in
 *   `visibleTowns`, which is why this band exists at all: a town in that list with an age
 *   of three days is *not* being watched, it is being remembered by the server on the
 *   client's behalf, and a client that drew it identically to a watched town would be
 *   claiming eyes that are not there.
 * - `old` — past the window. The town is remembered and its news is out of date.
 * - `unknown` — no age could be stated: no clock, no sighting, or a clock and a sighting
 *   that do not go together.
 */
export type TownRecency = "now" | "recent" | "old" | "unknown";

/** How many ticks count as "seen this tick" rather than "seen recently". */
const NOW_TICKS = 0;

/**
 * Ticks since this town was last in any side's sight, or null when that is not knowable.
 *
 * Three sources, in order, and the order matters:
 *
 *  1. `FogState.lastSeen` — the block's own map, which is what the tick frame carries.
 *  2. `FogState.tick` and the caller's `lastSeenTick` — the per-town copy, so a settlement
 *     the join found but the block did not mention still has an age.
 *  3. Nothing, and null.
 *
 * Null is a real answer and not a failure to try: it is the reading behind `unknown`, and
 * every consumer treats it as "no staleness to show" rather than as zero. The alternative
 * — defaulting a missing age to zero — would put every unreadable town in the `now` band,
 * which is the one band that claims somebody is watching.
 *
 * A sighting stamped *after* the block's own clock returns null rather than a negative
 * age. The simulation does not publish one (`buildFog` drops it), but a negative age would
 * compare as younger than now, which is a claim about the world that nothing supports.
 */
export function townAge(
  fog: FogState | undefined,
  townId: string,
  lastSeenTick?: number,
): number | null {
  if (!fog || fog.tick === undefined || fog.tick === null) return null;
  const now = fog.tick;
  // The never-seen sentinel differs between the two producers — -1 from the simulation's
  // field registry, 0 from the fixture — so both are read as "never" rather than one of
  // them being read as a sighting at tick zero.
  const seen = fog.lastSeen?.[townId] ?? (lastSeenTick !== undefined && lastSeenTick > 0 ? lastSeenTick : null);
  if (seen === null) return null;
  const age = now - seen;
  return age >= 0 ? age : null;
}

/**
 * Which of the four recency bands a town is in.
 *
 * The bands are stated against the simulation's own sighting memory rather than a number
 * picked here, because the server decides when a sighting stops counting as sight: `old`
 * means "past the point where the simulation itself would drop this town out of
 * `visibleTowns`", which is a fact about the world rather than a fade this client invented.
 *
 * With no memory window configured (`sightingMemoryDays <= 0`) every sighting with an age
 * is `old`, and that is the correct reading of a server that does not remember anything.
 */
export function townRecency(
  fog: FogState | undefined,
  townId: string,
  lastSeenTick?: number,
): TownRecency {
  const age = townAge(fog, townId, lastSeenTick);
  if (age === null) return "unknown";
  if (age <= NOW_TICKS) return "now";
  const memory = fog?.sightingMemoryDays ?? 0;
  return age <= memory ? "recent" : "old";
}

/**
 * How old the remembered half of a map is, as one pair of numbers.
 *
 * Counted by its own function rather than inside `countByVisibility`, because the two
 * answer different questions and only one of them has the town's age in hand. This one
 * does; the census does not, and asking the census to carry ages would mean passing two
 * maps where one of them duplicates the other's information.
 *
 * `stale` is a *subset of* `remembered`, not a fourth state beside the three, and that is
 * what keeps the census's arithmetic intact: `visible + remembered + unseen + unsighted`
 * still equals the total, with staleness read off the side rather than added to it.
 */
export interface FogStaleness {
  /** Places whose last sighting is older than the sighting memory. */
  stale: number;
  /** The oldest age among places that have one, in ticks. Null when none does. */
  oldestDays: number | null;
}

export const NO_STALENESS: FogStaleness = { stale: 0, oldestDays: null };

/**
 * Count the stale places and find the oldest one.
 *
 * Both arguments are keyed by the *client's* settlement id, the same key the census uses,
 * so the two readings are of one map rather than of two things that were joined separately.
 * A place missing from `ages` has no stated age and is not counted: it is drawn as its
 * state says and nothing further is claimed about it.
 */
export function tallyStaleness(
  recency: ReadonlyMap<string, TownRecency>,
  ages: ReadonlyMap<string, number>,
): FogStaleness {
  let stale = 0;
  let oldestDays: number | null = null;
  for (const [id, band] of recency) {
    if (band === "old") stale += 1;
    const age = ages.get(id);
    if (age === undefined) continue;
    if (oldestDays === null || age > oldestDays) oldestDays = age;
  }
  return { stale, oldestDays };
}

/**
 * Index a snapshot's fog block.
 *
 * A missing block is an ordinary input, not an error: `SimSnapshot.fog` is optional
 * precisely so that a simulation without visibility does not stop the client from
 * starting. The result is an inactive index, which every consumer below treats as "draw
 * the whole map".
 */
export function buildFogIndex(fog: FogState | undefined): FogIndex {
  if (!fog) {
    return { sideId: null, active: false, visible: EMPTY, known: EMPTY, unseen: EMPTY };
  }
  const visible = new Set(fog.visibleTowns);
  const known = new Set(fog.knownTowns);
  const unseen = new Set(fog.unseenTowns);
  // A null `sideId` is the server saying it has no player to state visibility from. The
  // lists it sends in that case are empty by construction, so trusting them would blank
  // every town on the map, which is the wrong answer to "no vantage point".
  return { sideId: fog.sideId, active: fog.sideId !== null, visible, known, unseen };
}

/**
 * Which of the three states one town is in.
 *
 * Membership of the three explicit lists decides it, in the order visible, remembered,
 * unseen, and never by subtraction. The `town` argument is only consulted for a town that
 * is in none of them, which the server should not produce; it exists so a list the client
 * cannot read degrades to the town's own flags rather than to a guess. That fallback ends
 * at `remembered`, not at `visible`, because a town the simulation published a record for
 * is at least known to be there and drawing it as watched would be the optimistic error.
 */
export function townVisibility(
  index: FogIndex,
  townId: string,
  town?: Pick<TownState, "visible" | "known">,
): TownVisibility {
  if (!index.active) return "visible";
  if (index.visible.has(townId)) return "visible";
  if (index.known.has(townId)) return "remembered";
  if (index.unseen.has(townId)) return "unseen";
  if (town?.visible) return "visible";
  if (town?.known) return "remembered";
  return "remembered";
}

/**
 * Every simulation town's state, keyed by town id.
 *
 * Built once per snapshot rather than per settlement, because the map asks the question
 * once for every settlement on the region and the lists are the same three sets each
 * time. The caller joins this against its own settlement ids.
 */
export function fogByTownId(
  index: FogIndex,
  towns: readonly Pick<TownState, "id" | "visible" | "known">[],
): Map<string, TownVisibility> {
  const out = new Map<string, TownVisibility>();
  for (const town of towns) out.set(town.id, townVisibility(index, town.id, town));
  return out;
}

/** How many of the map's own settlements ended up in each state. A count, not a model. */
export interface MapFogCensus {
  visible: number;
  remembered: number;
  unseen: number;
  /**
   * Settlements drawn in full because the simulation has no town for them, or because
   * fog is not being applied at all. Kept separate from `visible` so the panel can say
   * why they are lit.
   */
  unsighted: number;
  /** Every settlement the map is drawing, so the panel can state a total. */
  total: number;
  /**
   * Of the three states above, how many are remembered *and* out of date.
   *
   * A subset of `remembered` rather than a fourth state beside it, deliberately: the four
   * figures `visible + remembered + unseen + unsighted` have to keep summing to `total`,
   * and adding a bucket would break the arithmetic the indicator's totals rest on.
   */
  stale: number;
  /**
   * The oldest stated age on this map, in ticks. `null` when nothing on it has one.
   *
   * The single most useful fog number there is, because "remembered" and "remembered from
   * last year" are very different things to plan a campaign around, and a count of states
   * cannot tell them apart.
   */
  oldestDays: number | null;
  /**
   * Whether the three states above are being enforced on the map at all.
   *
   * Carried on the census rather than recomputed by each consumer, because the two
   * questions — "what are the counts" and "is this map filtered" — have to agree, and
   * two independent readings of the same index is how a panel ends up reporting zero
   * towns in sight above a map that is plainly showing them all.
   */
  applied: boolean;
}

/**
 * The sentence the data-source panel shows, and whether the map is being filtered.
 *
 * `census` is the client's own count of what it drew, and `fog` is the server's count of
 * what it knows. They are reported as two separate things on purpose: they answer
 * different questions, they will not agree while the region holds settlements outside the
 * running simulation, and a panel that presented the server's numbers as though they
 * described this map would be making a claim it cannot support.
 */
export interface FogReport {
  /** Whether the map is actually being filtered. Drives the wording, not just the number. */
  applied: boolean;
  /** One or two lines, in the product's voice, for the data-source panel. */
  detail: string;
}

export function reportFog(fog: FogState | undefined, census: MapFogCensus): FogReport {
  if (!fog) {
    return {
      applied: false,
      detail:
        `The simulation is not publishing fog of war, so nothing is being hidden. ` +
        `All ${census.total} settlements on this map are drawn in full. This is not a statement that ` +
        "this side can see all of it; it is a statement that the simulation has not said.",
    };
  }
  if (fog.sideId === null) {
    return {
      applied: false,
      detail:
        "The simulation reported no vantage point for this session, so there is no side to state " +
        `visibility from. All ${census.total} settlements are drawn in full rather than reporting an ` +
        "empty world, which is a different claim.",
    };
  }
  const radius = fog.sightRadiusKm > 0 ? `${fog.sightRadiusKm.toFixed(0)} km` : "an unstated radius";
  // The staleness clause is conditional and reads in the past tense on purpose. It says
  // how old the oldest news is rather than when it will expire, because the client does
  // not know whether the party is ever going back there and "will go stale in 3 days"
  // would be a promise about the player's plans.
  const staleness = census.stale > 0
    ? ` The oldest thing this side knows is ${census.oldestDays?.toFixed(0) ?? "some"} ticks old, ` +
      `and ${census.stale} of the remembered places are past the ${fog.sightingMemoryDays.toFixed(0)}-day ` +
      "sighting memory."
    : "";
  return {
    applied: true,
    detail:
      `Fog of war is applied for ${fog.sideId}, at a sight radius of ${radius} and a sighting memory of ` +
      `${fog.sightingMemoryDays.toFixed(0)} days. On this map: ${census.visible} in sight, ` +
      `${census.remembered} remembered but not watched, ${census.unseen} never found and not drawn` +
      (census.unsighted > 0 ? `, and ${census.unsighted} the simulation runs no town for.` : ".") +
      staleness,
  };
}

/**
 * What the persistent HUD fog indicator shows.
 *
 * The counts are the client's own, from `MapFogCensus`, because they describe the map
 * this client is drawing. The server's `FogCounts` describes the simulation's whole
 * world, which is a larger set than this region's settlements, and presenting the two
 * as one number would be a claim about a map that is not on screen.
 *
 * `applied: false` is a first-class state rather than three zeroes. With no vantage
 * point the honest reading is "nobody is looking", and an indicator that showed
 * `0 / 0 / 0` next to a fully drawn map would be actively lying.
 */
export interface FogIndicator {
  applied: boolean;
  visible: number;
  remembered: number;
  unseen: number;
  /** Every settlement the map is drawing. The denominator for the three counts. */
  total: number;
  /** Settlements drawn in full that the simulation holds no town for. */
  unsighted: number;
  /** Of the remembered, how many are past the sighting memory. A subset of `remembered`. */
  stale: number;
  /** The oldest stated age on the map, in ticks. Null when nothing has one. */
  oldestDays: number | null;
}

/**
 * The indicator's figures, from the census.
 *
 * `total` is the number of settlements on the map, not the sum of the three states, so
 * that the unwatched settlements are visible as a gap rather than silently inflating
 * one of the three buckets.
 */
export function fogIndicator(census: MapFogCensus): FogIndicator {
  return {
    applied: census.applied,
    visible: census.visible,
    remembered: census.remembered,
    unseen: census.unseen,
    total: census.total,
    unsighted: census.unsighted,
    stale: census.stale,
    oldestDays: census.oldestDays,
  };
}

/**
 * The count of settlements the client is drawing in each state, for `reportFog`.
 *
 * `watched` is which settlements the simulation actually holds a town for. It is a
 * separate argument rather than something inferred from the states, because "drawn in
 * full" and "in this side's sight" are different claims and the census has to keep them
 * apart: a settlement with no town record is drawn, and counting it as `visible` would
 * report the map's full settlement total back to the player as towns they can see.
 *
 * Every watched settlement is counted in one of the three states; every unwatched one
 * lands in `unsighted`. So the four figures always sum to `total`, which is the
 * property the HUD indicator's arithmetic depends on.
 *
 * `staleness` is read off the side rather than added in, because it is a subset of
 * `remembered`: a place whose last sighting is older than the sighting memory cannot be
 * `visible` on any well-formed block, and a census that counted it again as a fourth state
 * would report more places than the map has.
 */
export function countByVisibility(
  states: ReadonlyMap<string, TownVisibility>,
  watched: ReadonlySet<string> | null,
  staleness: FogStaleness | null = null,
): MapFogCensus {
  const census: MapFogCensus = {
    visible: 0,
    remembered: 0,
    unseen: 0,
    unsighted: 0,
    total: 0,
    stale: staleness?.stale ?? 0,
    oldestDays: staleness?.oldestDays ?? null,
    // A null `watched` means the caller is not tracking the join, so the census cannot
    // make the distinction and counts every drawn settlement as a fogged one. That is
    // the same reading `buildFogIndex` gives a missing block: the whole map is drawn.
    applied: watched !== null,
  };
  for (const [id, state] of states) {
    census.total += 1;
    if (watched !== null && !watched.has(id)) census.unsighted += 1;
    else census[state] += 1;
  }
  return census;
}

/** Whether a settlement should be drawn at all. The one place `UNSEEN_POLICY` is applied. */
export function isDrawn(state: TownVisibility): boolean {
  return state !== "unseen";
}
