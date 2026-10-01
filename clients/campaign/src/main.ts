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
  isDrawn,
  reportFog,
  townVisibility,
} from "./data/fog.js";
import { TEST_SOURCE_WARNING, TEST_SOURCE_DETAIL } from "./data/labels.js";
import { START_YEAR, eraGradeForYear } from "./design/grade.js";
import { buildWorld } from "./world/build.js";
import { publishWorld } from "./world/context.js";
import { classifySettlement } from "./world/load.js";
import type { WorldSettlement } from "./world/types.js";
import { createCampaignScene, type SceneHandle } from "./scene/CampaignScene.js";
import { findRoute, shortestPath } from "./scene/network.js";
import { createHud, dataSourcePanel, fatalError, type HudPanel, type HudState } from "./ui/hud.js";
import { marketPanel } from "./ui/panels/MarketPanel.js";
import { barterPanel } from "./ui/panels/BarterPanel.js";
import { partyPanel } from "./ui/panels/PartyPanel.js";
import { marchPlanner } from "./ui/panels/MarchPlanner.js";
import { ledgerPanel } from "./ui/panels/LedgerPanel.js";
import { rulerCard, rulerRoster } from "./ui/panels/RulerPanel.js";
import { startScreen } from "./ui/panels/StartScreen.js";
import { townPanel } from "./ui/panels/TownPanel.js";
import { whyPanel } from "./ui/panels/WhyPanel.js";
import type {
  BarterResult,
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
let fogCensus = countByVisibility([]);

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
  for (const place of world.data.settlements) {
    const town = townByPlaceId.get(place.id);
    states.set(
      place.id,
      town ? townVisibility(index, town.id, town) : "visible",
    );
  }
  fogStates = states;
  fogCensus = countByVisibility(states.values());
  scene?.setTownVisibility(states);
}

/** The fog sentence for the data-source panel, in the product's voice. */
function fogDetail(): string {
  return reportFog(snapshot?.fog, fogCensus).detail;
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
  currentPanel = town ? "town" : "none";
  contextNode = town ? townNode(town) : missingSettlementNode(place, id);
  syncParty();
  paint();
  if (place) hud.announcer.textContent = `${place.name} selected.`;
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
      contextNode = town ? townNode(town) : missingSettlementNode(selected, selectedSettlement ?? "No town");
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
    scene.showRoute(route.worldPath);
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

/** Apply a sparse tick delta. Absent keys mean unchanged, so frames stay small. */
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
  };
  hud.renderState(state);
}
