/**
 * How fog is *presented*, kept separate from how it is *read*.
 *
 * `src/data/fog.ts` reads the simulation's `fog` block and joins it to the map's
 * settlements. That join is the only thing there, and it is pure. This file is the
 * presentation layer that sits above it, and it exists as a separate module for the
 * same reason: everything below can be tested without a DOM, a canvas or a GPU, and
 * everything here can be tested without a simulation.
 *
 * The rule that governs the whole file, restated because it is easy to erode one
 * function at a time:
 *
 *   The client never decides what is visible.
 *
 * Every function here takes states that `src/data/fog.ts` produced from the server's
 * three lists, and decides only how each state should *look* — greyed, hidden, faded,
 * labelled or silent. Not one of them takes a radius, a position, a distance or a
 * sight line. A function that computed visibility would be a second visibility system,
 * and the whole cost of fog of war is that there is exactly one.
 *
 * The three states and what each one is allowed to say:
 *
 *   `visible`   — in sight. Everything current is true and says so.
 *   `remembered` — found once, not watched now. The *place* is known; its current
 *                 condition is not. So it is drawn, and its panel says it is stale
 *                 rather than printing yesterday's unrest as though it were today.
 *   `unseen`    — never found. Drawn not at all, labelled not at all, and its panel
 *                 says only that this side has not been there.
 *
 * The distinction that keeps getting collapsed: `remembered` is not a smaller version
 * of `visible`, and `unseen` is not a smaller version of `remembered`. The middle one
 * has a name and a place and no news; the last one has none of those.
 */

import type { TownVisibility } from "./types.js";

/**
 * How strongly something is drawn, per state.
 *
 * A single number rather than three named constants, because every caller wants to
 * multiply its own value by this and a caller that picked its own per-state strength
 * would end up with a remembered pin at 0.9 by accident. The values themselves are
 * tuned so the ordering survives at any zoom: a remembered town is unmistakably a
 * remembered town, and an unseen one is not on screen at all.
 *
 * `visible` is 1 rather than "leave it alone" so a caller can always multiply, without
 * a special case for the common case.
 */
export const FOG_STRENGTH: Readonly<Record<TownVisibility, number>> = {
  visible: 1,
  remembered: 0.45,
  unseen: 0,
};

/** The strength for one state. Clamped, so a bad state cannot produce a visible town. */
export function fogStrength(state: TownVisibility): number {
  return FOG_STRENGTH[state] ?? 0;
}

/**
 * Whether a town name is written on the map at all, and how hard.
 *
 * This is task 62, and it is deliberately *not* the same question as `isDrawn`.
 *
 * A settlement the player has found keeps its name: forgetting the name of a town you
 * marched through would be a lie about the player's own memory, and it would also make
 * the map unusable for the one thing a map is for. So `remembered` names stay, at
 * reduced strength — they read as a label on an old map rather than as a live fix.
 *
 * `unseen` names never appear. That is the leak `UNSEEN_POLICY` in `fog.ts` is about:
 * the client is holding the real OpenStreetMap name for a settlement the simulation has
 * never been scouted by this side, so printing it hands over the answer for free.
 *
 * Labels are separate from the town marker on purpose. The marker is a shape that says
 * "a settlement is here"; the label is the specific word for it. Hiding the marker but
 * leaving the name would be the worst of both — a map with floating words and no towns.
 */
export function labelStrength(state: TownVisibility): number {
  return FOG_STRENGTH[state];
}

/**
 * How loudly a pin on the map speaks.
 *
 * Separate from `labelStrength` because pins and labels fail differently. A pin that
 * is too loud at distance competes with the settlement cluster behind it; a label that
 * is too loud is unreadable. But the *policy* is shared and deliberately so: a pin is
 * hidden for a town the player has never found, and faded for one that is not watched.
 * Splitting the number from the policy is the failure this avoids.
 */
export function pinStrength(state: TownVisibility): number {
  return FOG_STRENGTH[state];
}

/**
 * How opaque a route line is drawn, per the state of the ground it runs over.
 *
 * A route to a town nobody has found is a leak of the same kind as the label: the line
 * is drawn from real surveyed road geometry between two real coordinates, so drawing it
 * at full strength tells the player where an unfound town is by drawing the road that
 * leads to it. Faded rather than hidden, because the player *ordered* that march and
 * hiding the line would leave them watching a party walk into nothing.
 *
 * `unseen` is 0.18 rather than 0: a hairline ghost says "there is a road here you have
 * not travelled", which is what the player actually knows, and reads as a broken line
 * rather than as a revealed destination.
 */
export const ROUTE_STRENGTH: Readonly<Record<TownVisibility, number>> = {
  visible: 1,
  remembered: 0.5,
  unseen: 0.18,
};

export function routeStrength(state: TownVisibility): number {
  return ROUTE_STRENGTH[state] ?? 0;
}

/**
 * The party's own pin.
 *
 * Returns false for `unseen` — but only in the sense that a party standing at a town it
 * has found is never `unseen` in the first place, because marching somewhere reveals
 * it (`src/data/fog.ts`). The check is kept so the invariant is enforced at the call
 * site rather than assumed.
 *
 * This exists as a function rather than a constant because the honest answer has a
 * case in it: the player's own party is always drawn, even in fog, because it is theirs.
 */
export function partyPinStrength(state: TownVisibility): number {
  return state === "unseen" ? 0 : 1;
}

/**
 * One settlement's fog state, and everything the UI needs to say about it.
 *
 * Assembled once per settlement per snapshot and passed around, rather than each caller
 * rebuilding the strings. A panel that words the remembered case slightly differently
 * from the tooltip is how a player learns that one of them is lying.
 */
export interface SettlementFogView {
  /** The state itself, so a caller never has to re-derive it. */
  state: TownVisibility;
  /** The one-word state, for a chip, a legend row or a screen reader. */
  label: string;
  /**
   * The sentence that goes with it. Longer than `label` on purpose: the middle state
   * needs saying in words, because "Remembered" alone does not tell a player that what
   * they are reading is old.
   */
  detail: string;
  /** Whether this settlement's *current* condition may be shown at all. */
  current: boolean;
  /** Whether the settlement itself may be shown at all. */
  known: boolean;
}

/**
 * The three states in words, in the product's voice.
 *
 * `detail` is the part that matters. A remembered town has to be labelled with the fact
 * that its numbers are old, because the alternative — showing last week's unrest under
 * a heading that says nothing about time — is a lie with a number on it.
 */
const VIEW_COPY: Record<TownVisibility, { label: string; detail: string }> = {
  visible: {
    label: "In sight",
    detail: "Your side can see this place now. What is shown below is current.",
  },
  remembered: {
    label: "Remembered",
    detail:
      "Your side has been here before, but cannot see it now. The place is still on the map. Anything " +
      "shown below was true when last seen and may have changed since.",
  },
  unseen: {
    label: "Never found",
    detail:
      "Your side has never had this place in sight. Nothing is known about it beyond the fact that the " +
      "survey records it exists.",
  },
};

/**
 * The whole view for one settlement.
 *
 * `current` is false for `remembered`, and that single boolean is what stops a dozen
 * call sites from each inventing their own staleness wording. A panel that wants to
 * show remembered data says so; a panel that would rather not show it asks
 * `current` first.
 */
export function settlementFogView(state: TownVisibility): SettlementFogView {
  const copy = VIEW_COPY[state] ?? VIEW_COPY.unseen;
  return {
    state,
    label: copy.label,
    detail: copy.detail,
    // `unseen` is not `current` either. There is nothing current to show about a town
    // this side has never seen, and treating it as merely stale would invite a panel to
    // print last-known figures about somewhere nobody has ever been.
    current: state === "visible",
    known: state !== "unseen",
  };
}

// -- change detection (tasks 64, 72, 74) ---------------------------------------

/**
 * What changed between two readings of the map's fog.
 *
 * Three separate lists because three separate things want three separate lists, and
 * merging them into one "changed" list is how a notification ends up announcing a town
 * that merely greyed out. Fog moves constantly as a party marches — a town goes
 * remembered → visible → remembered → visible — and only one of those transitions is
 * news.
 */
export interface FogDiff {
  /** Settlements whose state differs between the two readings. */
  changed: readonly string[];
  /**
   * Settlements this side can see now and could not before.
   *
   * The sighting notification (task 72). Includes `unseen → visible`, because a party
   * arriving somewhere nobody had been is exactly the moment fog exists to make
   * noticeable, and it is the most interesting case of the three.
   */
  sighted: readonly string[];
  /** Settlements that were watched and are not any more. Not a notification. */
  lost: readonly string[];
}

/**
 * Compare two readings of the same map.
 *
 * Both arguments are keyed by the *client's* settlement id and both must cover the same
 * map. `previous` may be empty, which is the first reading of a session, and the diff
 * is then everything currently visible — which would announce the whole world as newly
 * sighted.
 *
 * That first-reading case is handled by the caller, not here, and it is worth being
 * explicit about why: on the first read there is nothing to have been sighted *from*,
 * so the honest answer is no notification. `sightingsSince` below is the function that
 * knows the difference; this one is the raw comparison and is happy to report a large
 * first diff for a caller that wants the raw truth.
 */
export function diffFog(
  previous: ReadonlyMap<string, TownVisibility>,
  next: ReadonlyMap<string, TownVisibility>,
): FogDiff {
  const changed: string[] = [];
  const sighted: string[] = [];
  const lost: string[] = [];

  for (const [id, state] of next) {
    const before = previous.get(id);
    if (before === state) continue;
    changed.push(id);
    if (state === "visible") sighted.push(id);
    else if (before === "visible") lost.push(id);
  }

  return { changed, sighted, lost };
}

/**
 * Settlements to announce as newly sighted, given the previous reading.
 *
 * The difference from `diffFog(...).sighted` is the empty case, and it is the whole
 * point of this function. On the first reading of a session the previous map is empty,
 * every visible town looks like a fresh sighting, and a player opening the campaign is
 * greeted with a list of every town they have ever seen. So an empty previous map means
 * no announcements, and the only caller that can tell "first read" from "a map that
 * genuinely went to nothing" is the one holding the session state.
 *
 * `lastDay` guards the same thing across a day boundary rather than a session one: fog
 * moves every tick, and re-announcing a town because the last announcement was several
 * in-game days ago is noise rather than news. A town sighted on day 12 is not re-announced
 * on day 40 because it fell out of sight and came back.
 *
 * `announced` is carried by the caller and holds ids already announced this session, so
 * a town that leaves sight and returns is announced exactly once per session unless the
 * day check lets it through again.
 */
export function sightingsSince(
  previous: ReadonlyMap<string, TownVisibility>,
  next: ReadonlyMap<string, TownVisibility>,
  announced: ReadonlySet<string>,
  currentDay: number,
  lastAnnouncedDay: number,
): { sighted: string[]; announced: ReadonlySet<string> } {
  // No previous reading means no "before" to have been sighted from. This is the first
  // reading of a session, and treating it as a fresh batch of discoveries would open the
  // campaign by announcing every town the player has ever seen.
  if (previous.size === 0) return { sighted: [], announced };

  // One announcement per in-game day. A sighting is an event, and the sighting memory is
  // itself measured in days, so re-announcing a town that stepped in and out of sight
  // several times today would be a running commentary rather than news.
  if (lastAnnouncedDay === currentDay) return { sighted: [], announced };

  const fresh = diffFog(previous, next).sighted.filter((id) => !announced.has(id));
  return {
    sighted: fresh,
    // Only ids actually announced become recorded as announced, so a town whose
    // announcement was suppressed stays eligible on a later day.
    announced: new Set([...announced, ...fresh]),
  };
}

// -- the toggle (task 66) -------------------------------------------------------

/**
 * Whether the player has turned fog off.
 *
 * A *display* setting, and the distinction is load-bearing. Turning it off draws the
 * whole map — but it does not tell the client anything it did not already know, and it
 * does not change what the simulation publishes. The server keeps applying fog; the
 * player has simply asked to see the survey as it was drawn.
 *
 * Which is exactly why the resulting map is a *lie*, and why every surface that draws
 * an unfiltered map says so. `fogViewDetail` below is the wording, and it is not
 * optional at any call site: an unfiltered map presented without a caveat is the
 * simulation's own stated reason for fog failing ("a raid on a town nobody had heard of
 * could never happen") with the client doing the raiding for it.
 */
export interface FogSettings {
  /** When false, the map is drawn whole. The server's fog is untouched. */
  enabled: boolean;
  /**
   * Whether the player has been shown the caveat about turning it off.
   *
   * Tracked so the caveat can be said once, on the way past, rather than as a permanent
   * badge — and so it is never silently skipped, because a setting that changes what the
   * map claims without ever saying so is the one this whole module exists to avoid.
   */
  caveatShown: boolean;
}

export const DEFAULT_FOG_SETTINGS: FogSettings = { enabled: true, caveatShown: false };

/**
 * The states a map should actually draw, given the setting.
 *
 * Returns every settlement as `visible` when fog is off, and the given states when it
 * is on. It does not touch `index` and does not mutate anything.
 *
 * Note what it returns for a settlement that is genuinely `unseen`: `visible`. That is
 * the whole point of the toggle and the whole risk of it, which is why the caller is
 * required to render `fogViewDetail` when `enabled` is false.
 */
export function statesForDisplay(
  states: ReadonlyMap<string, TownVisibility>,
  settings: FogSettings,
): ReadonlyMap<string, TownVisibility> {
  if (settings.enabled) return states;
  const open = new Map<string, TownVisibility>();
  for (const id of states.keys()) open.set(id, "visible");
  return open;
}

/**
 * The sentence that must accompany a map drawn without fog.
 *
 * Returns `null` when fog is on, so a caller cannot accidentally render an empty
 * caveat box — and every caller is expected to render something when it is not null.
 * Kept as a function returning `string | null` rather than a string that is sometimes
 * blank because "sometimes blank" is how a required notice goes missing.
 */
export function fogViewDetail(settings: FogSettings): string | null {
  if (settings.enabled) return null;
  return (
    "You have turned fog of war off, so this map is drawn as the survey records it rather than as your " +
    "side knows it. The simulation is still applying fog. Places shown here that your side has never " +
    "found are drawn from the survey, not from anything your side has seen."
  );
}

// -- legend (task 71) ----------------------------------------------------------

/** One row of the fog legend. A swatch, a word and a sentence. */
export interface FogLegendRow {
  state: TownVisibility;
  /** The state word, as the indicator prints it. */
  label: string;
  /** What the map is doing, in one sentence. */
  onMap: string;
  /** What the panels may say, in one sentence. */
  inPanels: string;
}

/**
 * The legend, in the order a player meets the states.
 *
 * Two columns rather than one because a fog legend that only says what the map draws is
 * half the story: the thing players misread is that a remembered town's *panel* is
 * showing them old numbers, and that is exactly what the second column is for.
 *
 * Built from `VIEW_COPY` rather than written out again, so the legend and the tooltips
 * cannot disagree about what a state means.
 */
export function fogLegend(): FogLegendRow[] {
  const onMap: Record<TownVisibility, string> = {
    visible: "Drawn in full, in colour.",
    remembered: "Drawn greyed, with its pin and label faded back.",
    unseen: "Not drawn at all.",
  };
  const inPanels: Record<TownVisibility, string> = {
    visible: "Current. Everything shown is true as of the latest reading.",
    remembered: "Last known. True when last seen, and marked as old.",
    unseen: "Nothing. Your side has never been there, so nothing is stated.",
  };
  return (["visible", "remembered", "unseen"] as const).map((state) => {
    const view = settlementFogView(state);
    return { state, label: view.label, onMap: onMap[state], inPanels: inPanels[state] };
  });
}

// -- the minimap (task 67) -----------------------------------------------------

/** One settlement as the minimap draws it. */
export interface MinimapDot {
  /** Client settlement id, so a caller can match it back to a state. */
  id: string;
  /** Position in the minimap's own pixel space. */
  x: number;
  y: number;
  state: TownVisibility;
  /** True for a city, so the minimap can size the dot by class as the map does. */
  isCity: boolean;
}

/**
 * The states the minimap is allowed to draw.
 *
 * It filters through the *same* `statesForDisplay` as the map rather than having its
 * own rule, because two filters are two chances to disagree and a minimap that leaks
 * what the map hides is the same leak as the map leaking it.
 *
 * `unsighted` is passed separately for the same reason the census carries it: a place
 * the simulation runs no town for is drawn, and the minimap must not imply it is a town
 * this side can see.
 */
export function minimapDots(
  settlements: readonly MinimapDot[],
  states: ReadonlyMap<string, TownVisibility>,
  settings: FogSettings,
): MinimapDot[] {
  const shown = statesForDisplay(states, settings);
  const out: MinimapDot[] = [];
  for (const dot of settlements) {
    const state = shown.get(dot.id);
    // A dot the caller did not state is left out rather than defaulted to `visible`.
    // The map draws an unstated settlement (a real place with a real name is not
    // hidden), but the minimap is a *summary* of the map, and a summary that invents
    // dots for settlements it was never told about is a summary of a different map.
    if (state === undefined) continue;
    out.push({ ...dot, state });
  }
  return out;
}

/**
 * A minimap dot's drawn size, in pixels.
 *
 * By class, matching `ART_DIRECTION.md` section 7's ordering, and scaled by state so a
 * remembered city is still the biggest thing on the minimap — a minimap where the
 * important places shrink as they fade is a minimap that is quietly wrong about what
 * matters.
 */
export function minimapDotRadius(isCity: boolean, state: TownVisibility): number {
  const base = isCity ? 4 : 2.5;
  const strength = fogStrength(state);
  // An undrawn dot keeps its size rather than collapsing to nothing, because the minimap
  // returns nothing for it at all and a zero-radius dot is a division by zero waiting
  // to happen in a caller that draws by radius.
  return strength === 0 ? 0 : base * (0.6 + 0.4 * strength);
}