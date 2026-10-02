/**
 * Application entry point.
 *
 * The boot order is the point:
 *
 *   1. Skeleton UI mounts on the first frame, before any request. `SPEC.md` section 10
 *      asks for skeleton UI immediately; `CONSTITUTION.md` section 3.2 bans spinners.
 *      So there is never a blank frame and never a spinner.
 *   2. Real world data streams in: survey files, then terrain tiles, then the graph.
 *   3. The 3D scene builds over the real terrain.
 *   4. The side and state selection screen appears, once there is a simulation to
 *      read the state profiles from.
 *
 * This module owns view state and wiring only. It computes no balances, no prices and
 * no rates. A second opinion from the client would be a second simulation, which is
 * the one thing this client must not be.
 */

import "./design/tokens.css";
import "./ui/ui.css";

import { readConfig, providerFromConfig, SimulationUnavailableError } from "./data/provider.js";
import {
  buildFogIndex,
  countByVisibility,
  fogIndicator,
  isDrawn,
  reportFog,
  tallyStaleness,
  townAge,
  townRecency,
  townVisibility,
} from "./data/fog.js";
import {
  applyRememberedFloor,
  fogMemoryKey,
  foundIds,
  loadRemembered,
  saveRemembered,
} from "./data/fogMemory.js";
import { sightingsSince } from "./data/fogView.js";
import {
  DEFAULT_FOG_SETTINGS,
  fogViewDetail,
  statesForDisplay,
  type FogSettings,
} from "./data/fogView.js";
import { TEST_SOURCE_WARNING, TEST_SOURCE_DETAIL } from "./data/labels.js";
import type { FogIndicator, FogIndex, TownRecency } from "./data/fog.js";
import { START_YEAR, eraGradeForYear } from "./design/grade.js";
import { buildWorld } from "./world/build.js";
import { publishWorld } from "./world/context.js";
import { classifySettlement } from "./world/load.js";
import type { WorldSettlement } from "./world/types.js";
import { createCampaignScene, type SceneHandle } from "./scene/CampaignScene.js";
import { findRoute, shortestPath } from "./scene/network.js";
import { createHud, dataSourcePanel, fatalError, type HudPanel, type HudState } from "./ui/hud.js";
import { settlementFogView } from "./data/fogView.js";
import { unknownTownPanel } from "./ui/panels/UnknownTownPanel.js";
import { marketPanel } from "./ui/panels/MarketPanel.js";
import { barterPanel } from "./ui/panels/BarterPanel.js";
import { partyPanel } from "./ui/panels/PartyPanel.js";
import { marchPlanner } from "./ui/panels/MarchPlanner.js";
import { questPanel } from "./ui/panels/QuestPanel.js";
import { rumourFeedPanel } from "./ui/panels/RumourFeed.js";
import { ledgerPanel } from "./ui/panels/LedgerPanel.js";
import { rulerCard, rulerRoster } from "./ui/panels/RulerPanel.js";
import { startScreen } from "./ui/panels/StartScreen.js";
import { townPanel } from "./ui/panels/TownPanel.js";
import { whyPanel } from "./ui/panels/WhyPanel.js";
import type {
  BarterResult,
  IssueActionResult,
  IssueReward,
  RulerState,
  SettlementOption,
  SimSnapshot,
  TickUpdate,
  TownState,
  TownVisibility,
} from "./data/types.js";

const appEl = document.getElementById("app");
const canvasEl = document.getElementById("map");
if (!appEl) throw new Error("#app is missing from index.html");
if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error("#map is missing from index.html");
const app = appEl;
const mapCanvas = canvasEl;

// -- UI scale, persisted ------------------------------------------------------

function applyUiScale(scale: number): void {
  document.documentElement.setAttribute("data-ui-scale", String(scale));
  try {
    localStorage.setItem("campaign.uiScale", String(scale));
  } catch {
    // Storage disabled. The scale applies for this session; it just is not remembered,
    // which is not worth interrupting the player over.
  }
}
function loadUiScale(): number {
  try {
    const n = Number(localStorage.getItem("campaign.uiScale"));
    return [90, 100, 115, 130].includes(n) ? n : 100;
  } catch {
    return 100;
  }
}
applyUiScale(loadUiScale());

// -- configuration -----------------------------------------------------------

const config = readConfig();
const provider = providerFromConfig(config);

// -- view state --------------------------------------------------------------

let snapshot: SimSnapshot | null = null;
let previous: SimSnapshot | null = null;
let scene: SceneHandle | null = null;
let world: Awaited<ReturnType<typeof buildWorld>> | null = null;
let selectedSettlement: string | null = null;
let selectedRuler: string | null = null;
let currentPanel: HudPanel = "none";
let contextNode: Node | null = null;
let timeScale = 0;
let lastWhy: { entityId: string; field: string } | null = null;
let connectionState: "connected" | "reconnecting" | "degraded" = "connected";
/** The route the party is on, and the in-game day it left. */
interface Travel {
  destinationId: string;
  points: { x: number; z: number }[];
  length: number;
  leftOnDay: number;
  days: number;
}
let travel: Travel | null = null;

const bootNote = document.getElementById("boot-note");
const setBootNote = (text: string): void => {
  if (bootNote) bootNote.textContent = text;
};

// -- 1. skeleton first, then the world ---------------------------------------

const bootScreen = startScreen({
  sides: [],
  startYear: START_YEAR,
  eraLabel: eraGradeForYear(START_YEAR).years,
  loading: true,
  onStart: () => {
    bootScreen.remove();
    mountCampaign();
  },
});
app.appendChild(bootScreen);

const banner = document.getElementById("fixture-banner");
if (banner) {
  const isFixture = config.simulationSource === "fixture";
  banner.hidden = !isFixture;
  if (isFixture) {
    banner.textContent = TEST_SOURCE_WARNING;
    banner.title = TEST_SOURCE_DETAIL;
  }
}

const worldData = await buildWorld(config.worldDataUrl, (stage, loaded, total) => {
  setBootNote(
    stage === "terrain"
      ? `Reading the terrain survey. ${loaded} of ${total} tiles.`
      : stage === "graph"
        ? "Tracing the road network."
        : "Reading the settlement and road survey.",
  );
});
world = worldData;

// Published for whichever provider is active. The fixture reads the real Census
// populations from here so its state profiles are not invented; the HTTP provider
// ignores it. See src/world/context.ts for why this is not a direct import.
publishWorld({
  settlements: worldData.data.settlements,
  name: worldData.data.region.name,
  retrieved: worldData.data.region.retrieved,
});

setBootNote("Starting the renderer.");
scene = createCampaignScene({
  canvas: canvasEl,
  world: worldData.data,
  projection: worldData.projection,
  year: START_YEAR,
  quality: config.quality,
  onSelect: (id) => selectSettlement(id),
});

// -- 2. the simulation --------------------------------------------------------

try {
  snapshot = await provider.getSnapshot();
} catch (err) {
  const message =
    err instanceof SimulationUnavailableError ? err.playerMessage : "The world simulation could not be read.";
  const detail = err instanceof SimulationUnavailableError ? err.developerDetail : String(err);
  console.error(detail);
  bootScreen.remove();
  app.appendChild(
    fatalError(
      `${message} The map itself loaded, so the real terrain, roads and towns are here. Start the ` +
        "simulation, or run this build against test fixtures to work on the client.",
      detail,
      () => location.reload(),
    ),
  );
  throw err;
}

const selectionScreen = startScreen({
  sides: snapshot.sides,
  startYear: START_YEAR,
  eraLabel: eraGradeForYear(START_YEAR).years,
  loading: false,
  onStart: () => {
    selectionScreen.remove();
    mountCampaign();
  },
});
bootScreen.replaceWith(selectionScreen);

// -- 3. the campaign map ------------------------------------------------------

const hud = createHud({
  onSelectPanel: (p) => openPanel(p),
  onTimeScale: (s) => {
    timeScale = s;
    provider.setTimeScale(s);
    paint();
  },
  onSkipToArrival: () => void skipToArrival(),
  onOpenDataSource: () => openDataSource(),
  onOpenUiScale: (s) => applyUiScale(s),
  onNotification: (entityId, field) => openWhy(entityId, field),
});

function mountCampaign(): void {
  if (!snapshot) return;
  app.appendChild(hud.root);
  paint();

  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      currentPanel = "none";
      contextNode = null;
      paint();
      return;
    }
    // Tab cycles settlements only while the map has focus. Hijacking it everywhere
    // would take keyboard traversal away from the panels, which is the opposite of
    // what UI_UX.md section 11 asks for.
    if (ev.key === "Tab" && mapCanvas === document.activeElement) {
      // Only what is drawn. Cycling to a settlement the fog has hidden would move the
      // camera to an empty patch of ground with a panel open about a place the player
      // cannot see, which is the map contradicting itself.
      const ids = (world?.data.settlements ?? [])
        // `isDrawn(visibilityFor(...))` rather than the knowledge reading: the cycle walks
      // what is on the map, so it follows the toggle. Cycling onto a settlement the map is
      // not drawing would be cycling onto nothing.
      .filter((s) => isDrawn(visibilityFor(s.id)))
        .map((s) => s.id);
      if (ids.length === 0) return;
      const at = selectedSettlement ? ids.indexOf(selectedSettlement) : -1;
      const next = ids[(at + (ev.shiftKey ? ids.length - 1 : 1)) % ids.length]!;
      ev.preventDefault();
      selectSettlement(next);
      mapCanvas.focus();
      return;
    }
    const pan: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const move = pan[ev.key];
    if (move && selectedSettlement) {
      const place = settlement(selectedSettlement);
      if (place && scene) {
        const p = worldData.projection.toWorld(place.lat, place.lon);
        scene.focus(p.x + move[0] * 3000, p.z + move[1] * 3000);
        ev.preventDefault();
      }
    }
  });

  provider.subscribeTicks(
    (update) => {
      if (!snapshot) return;
      previous = snapshot;
      snapshot = applyTick(snapshot, update);
      if (currentPanel === "town" || currentPanel === "party" || currentPanel === "ledger") {
        rebuildContext();
      }
      syncParty();
      paint();
    },
    (status) => {
      connectionState = status.state === "connected" ? "connected" : status.state === "degraded" ? "degraded" : "reconnecting";
      hud.setConnection(status);
    },
  );

  // Open on the worst town, so the Why panel has a real chain to walk immediately, but
  // framed on the region rather than zoomed to the town. A campaign map should open
  // showing the campaign, not one street.
  const worst = [...snapshot.towns].sort((a, b) => b.unrest - a.unrest)[0];
  if (worst) selectSettlement(worst.settlementId);
  if (scene && world) scene.focus(world.projection.width / 2, world.projection.depth / 2, 34_000);
}

/**
 * Resolve a settlement the client was handed, whatever kind of id it carries. The
 * client uses OSM node ids; the simulation uses its own. See SettlementIndex.
 */
function settlement(idOrName: string): WorldSettlement | undefined {
  return world?.settlements.resolve(idOrName);
}

/**
 * The places a bare name could mean, when it could mean more than one.
 *
 * Thirty-six names in the V1 region are shared across states, and the index refuses to
 * resolve an ambiguous one rather than picking whichever the export listed last. So
 * when a lookup comes back empty, this says whether that was because the name is shared
 * or because there is no such place, which are different problems for the panel below to
 * describe.
 */
function settlementCandidates(name: string): WorldSettlement[] {
  return world?.settlements.candidatesFor(name) ?? [];
}

/**
 * The simulation's id for a place, given the client's id or the other way round.
 *
 * Both directions are needed and both are cheap, because the client's ids and the
 * simulation's ids are not the same vocabulary and Contract B does not say they will
 * be. A one-way lookup here produces a town panel that quietly shows no data, which is
 * the most expensive kind of bug to find later.
 */
/**
 * The simulation's id for a place, or `null` when the simulation has no town for it.
 * Declared here rather than above the index because the index depends on the snapshot.
 */
function simIdOf(place: WorldSettlement | undefined): string | null {
  if (!place || !snapshot) return null;
  return snapshot.towns.find((t) => settlement(t.settlementId)?.id === place.id)?.settlementId ?? null;
}

/** Client settlement id -> the town the simulation runs for it. */
let townByPlaceId = new Map<string, TownState>();

/**
 * Towns whose settlement the client could not resolve to one place.
 *
 * A town lands here when the simulation named a settlement with a bare name that more
 * than one state in this region also carries, since the index will not choose between
 * them. Kept so the condition is visible in the console rather than being a town that
 * silently never appears in the march planner, which is the failure this guards against.
 */
let unresolvedTowns: string[] = [];

function reindexTowns(): void {
  townByPlaceId = new Map();
  unresolvedTowns = [];
  for (const town of snapshot?.towns ?? []) {
    const place = settlement(town.settlementId);
    if (place) townByPlaceId.set(place.id, town);
    else unresolvedTowns.push(town.settlementId);
  }
  if (unresolvedTowns.length > 0) {
    console.warn(
      `${unresolvedTowns.length} simulation towns could not be matched to a single place on the map: ` +
        `${unresolvedTowns.join(", ")}. Names shared across states resolve only as "Name, State".`,
    );
  }
}

function townFor(settlementId: string): TownState | undefined {
  const target = settlement(settlementId)?.id ?? settlementId;
  return townByPlaceId.get(target);
}

// -- fog of war ----------------------------------------------------------------

/**
 * The fog state of every settlement the map is drawing, and the census of it.
 *
 * Held between reads rather than recomputed on demand because three separate places ask
 * the question — the scene, the tab cycle and the data-source panel — and a panel that
 * counted a different map from the one on screen would be reporting on something else.
 * Recomputed in `paint`, which is the one place that runs after a snapshot lands.
 */
let fogStates = new Map<string, TownVisibility>();
let fogCensus = countByVisibility(fogStates, null);

/**
 * The states as they should actually be *drawn*, after the player's fog toggle.
 *
 * Kept beside `fogStates` rather than folded into it, because the two answer different
 * questions and the census depends on the difference: `fogStates` is what the simulation
 * said, and the indicator counts must report that rather than what the player chose to
 * look at. With the toggle off the map shows every town and the indicator still reports
 * what this side actually knows — which is the only honest pairing, since the map is then
 * visibly not filtered and the numbers are still true.
 */
let fogDisplayStates: ReadonlyMap<string, TownVisibility> = fogStates;

/**
 * Whether the player has turned fog off, and whether they have been told what that does.
 *
 * A display setting, not a switch on the simulation — see `FogSettings` in
 * `src/data/fogView.ts`. The server keeps applying fog either way; the player has asked to
 * see the survey as drawn.
 */
let fogSettings: FogSettings = { ...DEFAULT_FOG_SETTINGS };

/**
 * The player's own memory of what this side has found, across sessions.
 *
 * A floor under the server's answer and never an override — see `applyRememberedFloor`.
 * Read once per side and region, because the key holds both, and a client pointed at a
 * different survey must not inherit another region's settlement ids.
 */
let fogRemembered: ReadonlySet<string> = new Set<string>();

/**
 * Ids this client has already announced as sighted, and the in-game day of the last
 * announcement.
 *
 * Session state rather than persisted, deliberately. Fog moves constantly as a party
 * marches, and re-announcing every town the player has ever seen on the first snapshot of
 * a new session is noise, not news. `sightingsSince` holds the empty-first-read rule; this
 * holds the per-session memory that makes it bite across days.
 */
let fogAnnounced: ReadonlySet<string> = new Set<string>();
let fogLastAnnouncedDay = -1;

/** The previous reading, so a snapshot can be compared against the one before it. */
let fogPreviousStates: ReadonlyMap<string, TownVisibility> = new Map();

/**
 * The key `fogRemembered` was loaded from, so a side or region change reloads the memory
 * instead of quietly inheriting the previous one's towns.
 */
let fogRememberedKey: string | null = null;

/**
 * How old each settlement's last sighting is, and which band that falls in.
 *
 * The fourth fog dimension, held beside `fogStates` for the same reason the display states
 * are: recency is read from the *server's* answer and never from the toggled map, so the
 * numbers the indicator reports and the fade the player sees are the same reading.
 *
 * Keyed by the client's settlement id like everything else here, which means the join in
 * `applyFog` is what produces it. A place with no town record gets `unknown`, which fades
 * nothing — there is no sighting to be old.
 */
let fogRecency: ReadonlyMap<string, TownRecency> = new Map();
let fogAges: ReadonlyMap<string, number> = new Map();

/** One settlement's recency band. `unknown` for anything the simulation has not aged. */
function recencyFor(placeId: string): TownRecency {
  return fogRecency.get(placeId) ?? "unknown";
}

/**
 * One settlement's age in ticks, or null when no age could be stated.
 *
 * Null rather than zero for the same reason `townAge` returns null: "seen 0 days ago" is a
 * claim that somebody is looking, and a panel that printed it for a place with no stated
 * age would be inventing the freshest possible news.
 */
function ageFor(placeId: string): number | null {
  return fogAges.get(placeId) ?? null;
}

/**
 * One settlement's state, by the client's own id.
 *
 * A settlement the simulation runs no town for is `visible`, and the reason is the same
 * one `noSimulationRecordNode` gives: the place is real, with real ground and a real
 * name, and a simulation holding no record of it has not said this side cannot see it.
 * Reading the absence of a town record as "unseen" would hide most of the region from a
 * player who has done nothing.
 */
function visibilityFor(placeId: string): TownVisibility {
  return fogDisplayStates.get(placeId) ?? "visible";
}

/**
 * What this side actually knows about a settlement, ignoring the display toggle.
 *
 * The distinction from `visibilityFor` is the whole safety property of the toggle: the map
 * is drawn from `fogDisplayStates` and the player may have turned fog off, but a panel
 * asking whether this side knows a town is asking about the world, and answering from the
 * toggled map would report a town's name as something the side has never found.
 */
function knowledgeFor(placeId: string): TownVisibility {
  return fogStates.get(placeId) ?? "visible";
}

/**
 * Read the snapshot's fog and put the map into it.
 *
 * The join is the whole job: fog is stated in simulation town ids, the map is drawn from
 * OpenStreetMap settlements, and `townByPlaceId` is the only thing that bridges the two
 * vocabularies. That is why this runs after `reindexTowns` and not before — a fog pass
 * over a stale index would grey the wrong towns, and would do it quietly.
 */
function applyFog(): void {
  if (!world) return;
  const index = buildFogIndex(snapshot?.fog);

  const states = new Map<string, TownVisibility>();
  // The settlements the simulation actually runs a town for. Tracked separately from the
  // states because a place with no town record is drawn in full but is not a town this
  // side can see, and the census has to be able to say which is which.
  const watched = new Set<string>();
  // The same join, for the fourth dimension. Both maps are keyed by the settlement id and
  // built in the same loop as the states, so a settlement cannot end up with a state from
  // one snapshot and an age from another.
  const recency = new Map<string, TownRecency>();
  const ages = new Map<string, number>();
  const fog = snapshot?.fog;
  for (const place of world.data.settlements) {
    const town = townByPlaceId.get(place.id);
    if (!town) {
      states.set(place.id, "visible");
      recency.set(place.id, "unknown");
      continue;
    }
    watched.add(place.id);
    states.set(place.id, townVisibility(index, town.id, town));
    recency.set(place.id, townRecency(fog, town.id, town.lastSeenTick));
    const age = townAge(fog, town.id, town.lastSeenTick);
    if (age !== null) ages.set(place.id, age);
  }

  // The player's remembered floor, applied to the *server's* reading and only ever moving
  // a town up from `unseen`. The census is then taken from the pre-floor reading, because
  // "how much has this side found" is a question about the world and the floor is the
  // client's convenience — folding the two would let a remembered town inflate a count
  // this side has not actually seen.
  const withMemory = applyRememberedFloor(states, fogRemembered);

  fogPreviousStates = fogStates;
  fogStates = states;
  fogRecency = recency;
  fogAges = ages;
  fogDisplayStates = statesForDisplay(withMemory, fogSettings);
  // `null` rather than an empty set when fog is not being applied: an empty set would
  // read as "every settlement here is watched", which is the opposite of the truth.
  fogCensus = countByVisibility(states, index.active ? watched : null, tallyStaleness(recency, ages));
  // Recency goes to the scene as its own map rather than being baked into the states,
  // because a settlement the player has un-fogged is drawn in full but its news is still
  // as old as it was, and a scene that only heard about the toggle would redraw the whole
  // map either way. Always passed: an empty map reads as `unknown` for everything, which is
  // the pre-recency treatment.
  scene?.setTownVisibility(fogDisplayStates, fogRecency);

  rememberFogMemory(index);
  announceSightings();
}

/**
 * Load this side's remembered settlements once, and write them back on every read.
 *
 * Keyed per side *and* per region, so a client pointed at a different survey does not
 * inherit settlement ids that mean nothing there, and switching sides does not make towns
 * the other side had not found appear grey.
 */
function rememberFogMemory(index: FogIndex): void {
  const sideId = index.sideId;
  if (!sideId || !world) return;
  const key = fogMemoryKey(sideId, world.data.region.name);
  if (fogRememberedKey !== key) {
    fogRememberedKey = key;
    fogRemembered = loadRemembered(readStorage(), key);
  }
  // Only the settlements the simulation actually runs a town for are written. `fogStates`
  // includes every OSM settlement in the region — most of them `visible` because there is
  // no town for them — and persisting those would fill the store with places this side
  // never had anything to do with. It would be harmless when read back (they are not
  // `unseen`, so the floor skips them) but it is a store claiming knowledge that was never
  // observed, which is the exact confusion `foundIds` exists to prevent.
  const watchedStates = new Map<string, TownVisibility>();
  for (const [id, state] of fogStates) {
    if (townByPlaceId.has(id)) watchedStates.set(id, state);
  }
  saveRemembered(readStorage(), key, foundIds(watchedStates), snapshot?.day ?? 0);
}

/**
 * `localStorage`, or `null` when it is unavailable.
 *
 * The same try/catch the UI scale uses, for the same reason: a browser with storage
 * disabled gets a working session and no memory, which is a smaller loss than a campaign
 * that refuses to start.
 */
function readStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Announce settlements this side has just come into sight of.
 *
 * `sightingsSince` owns the two rules that keep this from being noise — no announcements
 * on the first reading of a session, and at most one batch per in-game day — and this
 * function supplies the session state they need and puts the result where the player will
 * see it.
 */
function announceSightings(): void {
  if (!snapshot || fogPreviousStates.size === 0) {
    // First reading of a session: record it as the baseline without announcing anything.
    fogPreviousStates = fogStates;
    return;
  }
  const { sighted, announced } = sightingsSince(
    fogPreviousStates,
    fogStates,
    fogAnnounced,
    snapshot.day,
    fogLastAnnouncedDay,
  );
  fogAnnounced = announced;
  if (sighted.length === 0) return;
  fogLastAnnouncedDay = snapshot.day;
  const names = sighted
    .map((id) => settlement(id)?.name ?? id)
    .slice(0, 4)
    .join(", ");
  const more = sighted.length > 4 ? ` and ${sighted.length - 4} more` : "";
  hud.announcer.textContent = `Newly in sight: ${names}${more}.`;
}

/**
 * Turn fog off or on, and say plainly what the map is now showing.
 *
 * The caveat is the point of this handler. Turning fog off draws the whole map from the
 * survey, which is the leak `UNSEEN_POLICY` exists to prevent — so the setting is allowed
 * and the cost is stated, rather than the setting being hidden and the cost with it.
 */
function setFogEnabled(enabled: boolean): void {
  fogSettings = { enabled, caveatShown: enabled ? fogSettings.caveatShown : true };
  const display = statesForDisplay(
    applyRememberedFloor(fogStates, fogRemembered),
    fogSettings,
  );
  fogDisplayStates = display;
  scene?.setTownVisibility(display);
  syncParty();
  paint();
  const caveat = fogViewDetail(fogSettings);
  hud.announcer.textContent = caveat ?? "Fog of war is on. This map is filtered to what your side knows.";
}

/** The fog sentence for the data-source panel, in the product's voice. */
function fogDetail(): string {
  return reportFog(snapshot?.fog, fogCensus).detail;
}

/**
 * The figures for the HUD's persistent fog indicator. See `fogIndicator` in
 * `src/data/fog.ts` for why these are the client's own counts.
 */
function fogIndicatorState(): FogIndicator {
  return fogIndicator(fogCensus);
}

// -- selection ---------------------------------------------------------------

function selectSettlement(id: string): void {
  selectedSettlement = id;
  selectedRuler = null;
  const place = settlement(id);
  const town = townFor(id);
  if (place && scene) {
    const p = worldData.projection.toWorld(place.lat, place.lon);
    const { klass } = classifySettlement(place);
    scene.focus(p.x, p.z, klass === "city" ? 20_000 : klass === "town" ? 13_000 : 7_500);
  }
  // A settlement the map is drawing but this side cannot currently see gets the fog panel
  // instead of the ordinary town panel, even though it has a town record and the snapshot
  // has its numbers. `unknownTownPanel` shows those numbers *as last-known*, and the
  // remembered case is a real one — a player who scouted a place and marched away wants to
  // remember what they found, just not as though it were today.
  //
  // The branch is the same one `rebuildContext` takes, deliberately: selecting a town and
  // rebuilding after a snapshot must not be able to disagree about whether this settlement
  // is fogged, or a town would render one way on click and another way one tick later.
  currentPanel = town ? "town" : "none";
  // A settlement the map draws but the snapshot has no town for gets the "cannot be
  // resolved" node, the same one `rebuildContext` reaches for, so selecting a place and
  // rebuilding after a snapshot cannot disagree about a town that is not there.
  contextNode = town ? townNodeFor(town, place, id) : missingSettlementNode(place, id);
  syncParty();
  paint();
  if (place) {
    const state = knowledgeFor(id);
    const view = settlementFogView(state);
    hud.announcer.textContent =
      state === "visible"
        ? `${place.name} selected.`
        : `${place.name} selected. ${view.label}. ${view.detail}`;
  }
}

/**
 * The panel for a settlement the index could not resolve.
 *
 * Two different situations land here and the player deserves to be told which: the
 * settlement exists but the simulation has no town for it, or the name is shared by
 * places in more than one state and the index refused to choose. The second case is
 * stated with the states named rather than silently picking one, because picking one is
 * how a march order ends up at the wrong town.
 */
function missingSettlementNode(place: WorldSettlement | undefined, id: string): Node {
  if (place) return noSimulationRecordNode(place.name);
  const candidates = settlementCandidates(id);
  if (candidates.length < 2) return noSimulationRecordNode(id);

  const box = document.createElement("div");
  box.className = "sheet panel";
  box.setAttribute("data-testid", "ambiguous-settlement");
  const body = document.createElement("div");
  body.className = "panel__body";
  const head = document.createElement("h2");
  head.className = "panel__title";
  head.textContent = `${candidates[0]!.name}, in more than one state`;
  const p = document.createElement("p");
  p.className = "caption";
  p.textContent =
    `${candidates.length} places in this region are called ${candidates[0]!.name}, so the name on its own does not ` +
    "identify one of them. The client will not pick one for you. Choose the settlement on the map, or ask for it " +
    "by name and state, which does identify a single place.";
  const list = document.createElement("ul");
  list.className = "panel__list";
  for (const candidate of candidates) {
    const item = document.createElement("li");
    item.textContent = `${candidate.name} — ${candidate.state ?? candidate.stateCode ?? "state unrecorded"}`;
    list.appendChild(item);
  }
  body.append(head, p, list);
  box.appendChild(body);
  return box;
}

function noSimulationRecordNode(name: string): Node {
  const box = document.createElement("div");
  box.className = "sheet panel";
  box.setAttribute("data-testid", "no-simulation-record");
  const body = document.createElement("div");
  body.className = "panel__body";
  const head = document.createElement("h2");
  head.className = "panel__title";
  head.textContent = name;
  const p = document.createElement("p");
  p.className = "caption";
  p.textContent =
    "This settlement is on the real map, but the simulation is not running a town for it. It has real " +
    "ground, real roads and a real name. Its population and condition come from the simulation, which " +
    "has not published one, and the client will not invent it.";
  body.append(head, p);
  box.appendChild(body);
  return box;
}

/**
 * The town panel for a selected settlement, fog or no fog.
 *
 * Both entry points — a click and a rebuild after a snapshot — go through here, so the
 * decision "is this settlement in sight?" is made in exactly one place. Splitting it is how
 * a town renders as a live panel on click and as last-known one tick later, which is worse
 * than either: the player cannot tell which reading of the world they are looking at.
 *
 * The gate is `settlementFogView(...).current`, so `remembered` and `unseen` both take the
 * fog path and only `visible` gets the live panel. That single boolean is the mechanism;
 * no panel decides for itself what "old" counts as "showable".
 */
function townNodeFor(town: TownState, place: WorldSettlement | undefined, id: string): Node {
  const state = knowledgeFor(id);
  const recency = recencyFor(id);
  const days = ageFor(id);
  if (!settlementFogView(state, recency, days).current) {
    return unknownTownPanel({
      settlementName: place?.name ?? town.name,
      town,
      state,
      recency,
      days,
      day: snapshot?.day ?? 0,
      onWhy: (field) => openWhy(town.id, field),
    });
  }
  return townNode(town);
}

function townNode(town: TownState): Node {
  return townPanel({
    town,
    previous: previous?.towns.find((t) => t.id === town.id) ?? null,
    onWhy: (field) => openWhy(town.id, field),
    onOpenMarket: () => openPanel("market"),
    onMarchHere: () => openPanel("march"),
    onRoster: () => openPanel("roster"),
    purse: snapshot?.player.resources.money ?? 0,
    day: snapshot?.day ?? 0,
    onRecruit: async (unitId, quantity) => {
      if (!snapshot) throw new Error("No snapshot to recruit against.");
      const result = await provider.recruit({
        partyId: snapshot.party.id,
        townId: town.id,
        unitId,
        quantity,
        expectedDay: snapshot.day,
      });
      if (result.accepted) {
        previous = snapshot;
        snapshot = await provider.getSnapshot();
        rebuildContext();
        paint();
      }
      return result;
    },
  });
}

// -- panels ------------------------------------------------------------------

function openPanel(panel: HudPanel): void {
  currentPanel = panel;
  if (panel === "why" && !lastWhy) {
    const worst = snapshot ? [...snapshot.towns].sort((a, b) => b.unrest - a.unrest)[0] : undefined;
    if (worst) lastWhy = { entityId: worst.id, field: "unrest" };
  }
  if (panel !== "none" && panel !== "why" && !selectedSettlement) {
    selectedSettlement = world?.data.settlements[0]?.id ?? null;
  }
  rebuildContext();
  paint();
}

function openWhy(entityId: string, field: string): void {
  lastWhy = { entityId, field };
  currentPanel = "why";
  rebuildContext();
  paint();
}

function openDataSource(): void {
  currentPanel = "none";
  contextNode = dataSourcePanel({
    summary: scene?.summary() ?? "",
    regionName: worldData.data.region.name,
    retrieved: worldData.data.region.retrieved,
    providerLabel: provider.label,
    fogDetail: fogDetail(),
    isFixture: config.simulationSource === "fixture",
    connection: { state: connectionState, detail: "", attempt: 0 },
    onClose: () => {
      currentPanel = "none";
      contextNode = null;
      paint();
    },
    onRetry: () => void reloadSnapshot(),
  });
  paint();
}

async function reloadSnapshot(): Promise<void> {
  try {
    previous = snapshot;
    snapshot = await provider.getSnapshot();
    currentPanel = "none";
    contextNode = null;
    paint();
  } catch (err) {
    const message = err instanceof SimulationUnavailableError ? err.playerMessage : "The world could not be re-read.";
    const detail = err instanceof SimulationUnavailableError ? err.developerDetail : String(err);
    console.error(detail);
    currentPanel = "none";
    contextNode = fatalError(message, detail, () => void reloadSnapshot());
    paint();
  }
}

/** Run the clock to the end of the current march, then re-read the world. */
async function skipToArrival(): Promise<void> {
  try {
    const { daysAdvanced } = await provider.skipToArrival();
    if (daysAdvanced > 0) {
      previous = snapshot;
      snapshot = await provider.getSnapshot();
      rebuildContext();
      paint();
    }
  } catch (err) {
    const message = err instanceof SimulationUnavailableError ? err.playerMessage : "The clock did not skip.";
    console.error(err instanceof SimulationUnavailableError ? err.developerDetail : String(err), message);
  }
}

function rebuildContext(): void {
  if (currentPanel === "none" || !snapshot) {
    contextNode = null;
    return;
  }
  const snap = snapshot;
  const town = selectedSettlement ? townFor(selectedSettlement) : undefined;

  switch (currentPanel) {
    case "town": {
      const selected = settlement(selectedSettlement ?? "");
      if (!town) {
        contextNode = missingSettlementNode(selected, selectedSettlement ?? "No town");
        return;
      }
      // Rebuilt on every snapshot, so the stale panel follows the map: a town that comes
      // back into sight during a march stops being presented as last-known without the
      // player having to re-select it.
      contextNode = townNodeFor(town, selected, selectedSettlement ?? "");
      return;
    }
    case "market": {
      if (!town) {
        contextNode = noSimulationRecordNode("No market here");
        return;
      }
      contextNode = marketNode(town.id, town.name);
      return;
    }
    case "barter":
      if (!town) {
        contextNode = noSimulationRecordNode("No market here");
        return;
      }
      contextNode = barterNode(town.id, town.name);
      return;
    case "party":
      contextNode = partyPanel({
        party: snap.party,
        previous: previous?.party ?? null,
        onWhy: (field) => openWhy(snap.party.id, field),
      });
      return;
    case "quests":
      // No town needed. The board is keyed by party, and its requests are spread across
      // every settlement in the region, so there is nothing here to resolve against the
      // current map selection.
      contextNode = questNode();
      return;
    case "rumours":
      // No town needed either, and for a stronger reason: a rumour names two towns and
      // the feed is a read of every market in the world rather than of the selection.
      contextNode = rumourNode();
      return;
    case "march":
      contextNode = marchPlanner({
        party: snap.party,
        destinations: destinationsFor(),
        provider,
        onCommitted: () => {
          currentPanel = "party";
          rebuildContext();
          paint();
        },
        onError: (m) => console.error(m),
      }).root;
      return;
    case "ledger":
      contextNode = ledgerPanel({
        ledger: snap.ledger,
        warnings: snap.warnings,
        onWhy: (entityId, field) => openWhy(entityId, field),
      });
      return;
    case "roster": {
      const ruler = selectedRuler ? snap.rulers.find((r) => r.id === selectedRuler) : undefined;
      if (ruler) {
        contextNode = rulerCard({
          ruler,
          onWhy: () => openWhy(ruler.id, "loyalty_to_leader"),
          onClose: () => {
            selectedRuler = null;
            rebuildContext();
            paint();
          },
        });
        return;
      }
      contextNode = rulerRoster({
        rulers: snap.rulers,
        playerFactionId: snap.player.factionId,
        selectedId: selectedRuler,
        onSelect: (id) => {
          selectedRuler = id;
          rebuildContext();
          paint();
        },
      });
      return;
    }
    case "why": {
      if (!lastWhy) {
        contextNode = noSimulationRecordNode("Nothing to explain yet");
        return;
      }
      contextNode = whyPanel({
        entityId: lastWhy.entityId,
        field: lastWhy.field,
        provider,
        onDrill: (entityId, field) => openWhy(entityId, field),
        onClose: () => {
          currentPanel = "town";
          rebuildContext();
          paint();
        },
      }).root;
      return;
    }
    default:
      contextNode = null;
  }
}

/**
 * The last trade outcome, held by the app rather than the panel, so it survives the
 * re-render that shows the new price.
 */
let lastTrade: { tone: "good" | "critical"; text: string } | null = null;
/** The player's chosen trade size, held here so a re-render does not reset it. */
let tradeQuantity = 10;

function marketNode(townId: string, townName: string): Node {
  if (!snapshot) return noSimulationRecordNode("No market here");
  return marketPanel({
    lastTrade,
    quantity: tradeQuantity,
    townId,
    townName,
    market: snapshot.markets[townId] ?? null,
    party: snapshot.party,
    money: snapshot.player.resources.money,
    day: snapshot.day,
    provider,
    onQuantityChange: (q) => {
      tradeQuantity = q;
    },
    onTraded: (result) => {
      lastTrade = result.accepted
        ? {
            tone: "good",
            text:
              `${result.side === "buy" ? "Bought" : "Sold"} ${result.quantity} at ` +
              `${money(result.total)}. The price here is now ${result.marketPriceAfter.toFixed(2)}.`,
          }
        : { tone: "critical", text: result.reason ?? "The trade was refused." };
      void refreshAfterTrade(townId);
    },
    onError: (m) => console.error(m),
  }).root;
}

function money(v: number): string {
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

/**
 * The barter screen for a town.
 *
 * The trader is the lord who holds the town: a lord's gold, their prisoners and their
 * standing with the player are the things that can actually be bargained over, and the
 * market beside it is where prices are set rather than haggled. `terms` is handed as
 * `null` on purpose, so the panel puts its skeleton up and asks the simulation for both
 * tables itself — the same arrangement the market panel uses, and the reason the
 * player's first frame is the shape of the screen rather than a blank one.
 */
function barterNode(townId: string, townName: string): Node {
  if (!snapshot) return noSimulationRecordNode("Nobody here to bargain with");
  const trader = traderFor(townId);
  return barterPanel({
    partyId: snapshot.party.id,
    partyName: snapshot.party.name,
    townId,
    traderId: trader?.id ?? null,
    traderName: trader?.name ?? `the holder of ${townName}`,
    terms: null,
    provider,
    lastOutcome: lastBarter,
    onDealt: (result: BarterResult) => {
      lastBarter = {
        tone: result.accepted ? "good" : "critical",
        text: result.accepted ? `${result.verdict} Struck on day ${result.day}.` : (result.reason ?? "The deal was refused."),
      };
      void refreshAfterBarter();
    },
    onError: (m) => console.error(m),
  }).root;
}

/** The lord holding a town, which is the trader the barter screen opens with. */
function traderFor(townId: string): RulerState | undefined {
  if (!snapshot) return undefined;
  const town = snapshot.towns.find((t) => t.id === townId);
  if (!town?.holderId) return undefined;
  return snapshot.rulers.find((r) => r.id === town.holderId);
}

/**
 * The last deal's outcome, held by the app rather than the panel.
 *
 * The same reason `lastTrade` is: a struck deal moves the market, the lord's gold and the
 * party's cage, so the app re-reads the world and rebuilds the panel, and without this the
 * confirmation would be wiped by the refresh that displayed it.
 */
let lastBarter: { tone: "good" | "critical"; text: string } | null = null;

/** Re-read after a deal, because the tables the panel is drawing have just changed. */
async function refreshAfterBarter(): Promise<void> {
  try {
    const fresh = await provider.getSnapshot();
    previous = snapshot;
    snapshot = fresh;
    if (currentPanel === "barter") rebuildContext();
    paint();
  } catch (err) {
    console.error(err instanceof SimulationUnavailableError ? err.developerDetail : String(err));
  }
}

/**
 * The quest log for this party.
 *
 * `board` is handed as `null` on purpose, so the panel puts its skeleton up and reads the
 * board itself — the same arrangement the barter screen and the market use, and the reason
 * the first frame is the shape of the screen rather than a blank one. The app keeps the
 * *outcome* and never the data, because a board cached here would already be stale: the
 * simulation ages offers on every read, so an offer nobody took up lapses between one draw
 * and the next, and a log holding yesterday's board would offer a deadline that no longer
 * means anything.
 */
function questNode(): Node {
  if (!snapshot) return noSimulationRecordNode("No quest log to read");
  return questPanel({
    partyId: snapshot.party.id,
    partyName: snapshot.party.name,
    board: null,
    provider,
    lastOutcome: lastQuest,
    onAction: (result: IssueActionResult) => {
      lastQuest = {
        tone: result.accepted ? "good" : "critical",
        text: result.accepted
          ? result.paid
            ? `${result.verdict} Paid ${describeReward(result.paid)}.`
            : result.verdict
          : (result.reason ?? result.verdict),
      };
      void refreshAfterQuest();
    },
    onError: (m) => console.error(m),
  }).root;
}

/**
 * The last order's outcome, held by the app rather than the panel.
 *
 * The same reason `lastBarter` and `lastTrade`: taking on or reporting a request moves the
 * notable's opinion, the purse and the settlement's own readings, so the app re-reads the
 * world and rebuilds the panel, and without this the confirmation would be wiped by the
 * refresh that displayed it.
 */
let lastQuest: { tone: "good" | "critical"; text: string } | null = null;

/** The reward in a sentence, for the notice that survives the re-render which shows it. */
function describeReward(reward: IssueReward): string {
  const parts: string[] = [];
  if (reward.money !== 0) parts.push(money(reward.money));
  if (reward.gold !== 0) parts.push(`${Math.round(reward.gold)} gold`);
  if (reward.renown !== 0) parts.push(`${Math.round(reward.renown)} renown`);
  if (reward.relation !== 0) parts.push(`${Math.round(reward.relation)} standing`);
  return parts.length === 0 ? "nothing" : parts.join(", ");
}

/**
 * Re-read after an order, because the world the panel is drawing has just moved.
 *
 * Only the snapshot: the panel reads the board itself on the rebuild, so there is no second
 * copy of the requests to keep in step. The snapshot is what the rail draws — coin, renown
 * and every settlement's own readings — and the reward has already moved all of it.
 */
async function refreshAfterQuest(): Promise<void> {
  try {
    const fresh = await provider.getSnapshot();
    previous = snapshot;
    snapshot = fresh;
    if (currentPanel === "quests") rebuildContext();
    paint();
  } catch (err) {
    console.error(err instanceof SimulationUnavailableError ? err.developerDetail : String(err));
  }
}

/**
 * The rumour feed.
 *
 * `rumours` is handed as `null` on purpose, so the panel puts its skeleton up and asks the
 * simulation for the feed itself — the same arrangement as the quest log, the barter screen
 * and the market. Nothing is cached here for the reason nothing else is: prices move on
 * every trade, so a feed held by the app would be a feed the player is reading after it
 * stopped being true, and the panel would have no way to say how old it was.
 *
 * The day is the app's own clock, passed for the panel to date the feed with. The payload
 * carries no day of its own, so the panel says which of the two it is printing.
 */
function rumourNode(): Node {
  if (!snapshot) return noSimulationRecordNode("No trade rumours to read");
  return rumourFeedPanel({
    rumours: null,
    provider,
    day: snapshot.day,
    onError: (m) => console.error(m),
  }).root;
}

/** Re-read after a trade so the table shows the post-trade price, not the one before. */
async function refreshAfterTrade(townId: string): Promise<void> {
  try {
    const fresh = await provider.getSnapshot();
    previous = snapshot;
    snapshot = fresh;
    if (currentPanel === "market") {
      const town = selectedSettlement ? townFor(selectedSettlement) : undefined;
      if (town && town.id === townId) {
        contextNode = marketNode(town.id, town.name);
      }
    }
    paint();
  } catch (err) {
    console.error(err instanceof SimulationUnavailableError ? err.developerDetail : String(err));
  }
}

/** Destinations for the march picker: real places with a real road to them. */
function destinationsFor(): SettlementOption[] {
  const fromPlace = selectedSettlement ? settlement(selectedSettlement) : undefined;
  if (!world || !fromPlace) return [];
  const fromNode = world.graph.nodeForSettlement.get(fromPlace.id);
  return world.data.settlements
    .filter((s) => s.id !== fromPlace.id)
    .map((s) => {
      const toNode = world.graph.nodeForSettlement.get(s.id);
      const distanceKm =
        fromNode !== undefined && toNode !== undefined
          ? shortestPath(world.graph, fromNode, toNode).distanceKm
          : 0;
      const simId = simIdOf(s);
      return {
        id: s.id,
        // The order is sent in the simulation's vocabulary. A place the simulation
        // has no town for gets null, and the planner says so instead of guessing.
        simulationId: simId,
        name: s.name,
        distanceKm,
        distanceHint:
          simId === null
            ? "no town here"
            : distanceKm > 0
              ? `${distanceKm.toFixed(0)} km`
              : "no surveyed road",
        klass: classifySettlement(s).klass,
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 24);
}

// -- party movement ----------------------------------------------------------

/**
 * Put the party marker on its road and advance it with the in-game clock.
 *
 * The marker position is a display value: the real march is the simulation's, and the
 * simulation reports the day the order was accepted. The client interpolates between
 * the real road nodes so the marker follows the road rather than flying across country.
 * It never invents arrival or cost; those come from the March and Supply systems.
 */
function syncParty(): void {
  if (!scene || !snapshot || !world) return;

  const destination = snapshot.party.destination;
  const fromPlace = selectedSettlement ? settlement(selectedSettlement) : undefined;
  if (!destination || !fromPlace) {
    travel = null;
    if (fromPlace) {
      const place = fromPlace;
      if (place) {
        const p = worldData.projection.toWorld(place.lat, place.lon);
        scene.setPartyPosition(p.x, p.z, 0);
        scene.setPartyVisible(true);
      }
    }
    scene.showRoute([]);
    return;
  }

  if (!travel || travel.destinationId !== destination.settlementId) {
    const route = findRoute(world.graph, fromPlace.id, destination.settlementId);
    const to = settlement(destination.settlementId);
    if (!route.found || route.worldPath.length < 2 || !to) {
      // No surveyed road. The party stands where it is, and the planner says so.
      scene.showRoute([]);
      travel = null;
      return;
    }
    const points = route.worldPath.map((p) => ({ x: p.x, z: p.z }));
    let length = 0;
    for (let i = 1; i < points.length; i += 1) {
      length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z);
    }
    travel = {
      destinationId: destination.settlementId,
      points,
      length,
      leftOnDay: snapshot.day,
      // The party's own speed and the real road distance give the client a display
      // duration. The authoritative number is in the march plan, which the planner
      // shows before the player commits.
      days: Math.max(1, Math.ceil(length / 1000 / Math.max(1, snapshot.party.speedKmPerDay))),
    };
    // The destination's state decides how loudly the line is drawn. Passing it means a
    // march into never-found territory is still visible as a route the player ordered —
    // a ghost line rather than nothing, so they are not watching their party walk into a
    // blank. See `routeStrength` in `src/data/fogView.ts`.
    scene.showRoute(route.worldPath, visibilityFor(destination.settlementId));
  }

  const leg = travel;
  const fraction = Math.min(1, (snapshot.day - leg.leftOnDay) / leg.days);
  const at = pointAlong(leg.points, fraction);
  const ahead = pointAlong(leg.points, Math.min(1, fraction + 0.03));
  scene.setPartyPosition(at.x, at.z, Math.atan2(ahead.x - at.x, ahead.z - at.z));
  scene.setPartyVisible(true);
}

function pointAlong(points: { x: number; z: number }[], fraction: number): { x: number; z: number } {
  if (points.length === 0) return { x: 0, z: 0 };
  if (points.length === 1 || fraction <= 0) return points[0]!;
  if (fraction >= 1) return points[points.length - 1]!;
  const target = fraction;
  let acc = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (acc + seg <= 0) continue;
    if ((acc + seg) / totalLength(points) >= target) {
      const t = (target * totalLength(points) - acc) / seg;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    acc += seg;
  }
  return points[points.length - 1]!;
}

function totalLength(points: { x: number; z: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z);
  }
  return total || 1;
}

// -- ticks -------------------------------------------------------------------

/**
 * Apply a tick frame to a snapshot.
 *
 * Sparse for everything except fog: absent keys mean unchanged, so frames stay small, and
 * `fog` is the exception because it arrives whole. The two are not the same shape of thing
 * — a partial fog block would need every client to know which of ten fields this
 * particular frame carried, and the mistake would be a map that believes three towns are
 * unseen because only the two that changed were mentioned.
 */
function applyTick(base: SimSnapshot, update: TickUpdate): SimSnapshot {
  const towns = base.towns.map((t) => {
    const delta = update.towns?.[t.id];
    return delta ? { ...t, ...delta } : t;
  });
  const markets = { ...base.markets };
  for (const [id, partial] of Object.entries(update.markets ?? {})) {
    const current = markets[id];
    if (!current) continue;
    markets[id] = { ...current, ...partial, goods: partial.goods ?? current.goods };
  }
  return {
    ...base,
    day: update.day,
    player: update.player ? { ...base.player, ...update.player } : base.player,
    party: update.party ? { ...base.party, ...update.party } : base.party,
    towns,
    markets,
    ledger: update.ledger ?? base.ledger,
    warnings: update.warnings ?? base.warnings,
    notifications: update.notifications ? [...base.notifications, ...update.notifications] : base.notifications,
    // The frame's fog block replaces rather than merges. The apiserver rebuilds it whole
    // per frame (`broadcastTick`), so merging anything here would be merging two readings
    // of the same three lists and taking whichever came second — and a frame from a server
    // that has not been rebuilt carries none, in which case the snapshot's block is the
    // most recent thing this client was told.
    //
    // Written as a conditional spread rather than `fog: update.fog ?? base.fog` because the
    // project builds with `exactOptionalPropertyTypes`, where assigning an absent optional
    // property is an error: the key has to either carry a block or not be there at all, and
    // a snapshot with no fog block is a different thing from one whose fog is undefined.
    ...(update.fog ?? base.fog ? { fog: update.fog ?? base.fog } : {}),
  };
}

// -- paint -------------------------------------------------------------------

function paint(): void {
  if (!snapshot) return;
  reindexTowns();
  // After the reindex, never before: the fog pass reads the settlement-to-town join.
  applyFog();
  const headcount = snapshot.party.troops.reduce((a, t) => a + t.count, 0);
  const dailyFood = headcount * 0.85;
  const state: HudState = {
    snapshot,
    warnings: snapshot.warnings,
    context: contextNode ? { panel: currentPanel, node: contextNode } : null,
    loading: false,
    loadingShape: "town",
    timeScale,
    partyDaysOfFood: dailyFood === 0 ? 0 : snapshot.party.food / dailyFood,
    selectionName: selectedSettlement ? (settlement(selectedSettlement)?.name ?? "") : "",
    fog: fogIndicatorState(),
    fogEnabled: fogSettings.enabled,
    onFogToggle: setFogEnabled,
  };
  hud.renderState(state);
}
