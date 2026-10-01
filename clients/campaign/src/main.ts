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
import { status } from "./design/tokens.js";

import { readConfig, providerFromConfig, SimulationUnavailableError } from "./data/provider.js";
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
import { partyPanel } from "./ui/panels/PartyPanel.js";
import { marchPlanner } from "./ui/panels/MarchPlanner.js";
import { ledgerPanel } from "./ui/panels/LedgerPanel.js";
import { rulerCard, rulerRoster } from "./ui/panels/RulerPanel.js";
import { startScreen } from "./ui/panels/StartScreen.js";
import { characterMaker } from "./ui/panels/CharacterMaker.js";
import { runCityDemo } from "./scene/cityDemo.js";
import { townPanel } from "./ui/panels/TownPanel.js";
import { whyPanel } from "./ui/panels/WhyPanel.js";
import type {
  SettlementOption,
  SimSnapshot,
  TickUpdate,
  TownState,
} from "./data/types.js";
import { input } from "./input/index.js";
import { keybindingEditor } from "./ui/panels/KeybindingEditor.js";
import { openDeploymentPreview } from "./deploy/index.js";
import { codexPanel } from "./ui/panels/Codex.js";
import { QuestJournal, seedQuests } from "./journal/index.js";
import { questJournalPanel } from "./ui/panels/QuestJournal.js";
import { settings } from "./settings/index.js";

const appEl = document.getElementById("app");
const canvasEl = document.getElementById("map");
if (!appEl) throw new Error("#app is missing from index.html");
if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error("#map is missing from index.html");
const app = appEl;
const mapCanvas = canvasEl;

// -- city demo ---------------------------------------------------------------
// `?city=<slug>` skips the campaign entirely and renders real OSM buildings.
// This is the boss's "show me the cities" view: no sim, no HUD, just streets.
const citySlug = new URLSearchParams(window.location.search).get("city");
if (citySlug) {
  document.title = `City demo — ${citySlug}`;
  runCityDemo(mapCanvas, citySlug).catch((err) => {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div style="position:fixed;inset:auto 12px 12px 12px;z-index:99;background:${status.critical.fill};color:${status.critical.ink};` +
        `font:13px system-ui;padding:12px 16px;border-radius:8px">City demo failed: ${String(err)}</div>`,
    );
    throw err;
  });
} else {

// -- settings ---------------------------------------------------------------
// One versioned blob in localStorage, created before anything renders so the UI
// scale applies on the first frame. The migration inside the store absorbs the
// legacy `campaign.uiScale` key; it is removed afterwards so it cannot drift.

input.load(settings.get().keyBindings);
input.onBindingsChanged(() => {
  settings.set({ keyBindings: input.serialize() });
});
try {
  localStorage.removeItem("campaign.uiScale");
} catch {
  // Session-only anyway; nothing to clean.
}

function applyUiScale(scale: number): void {
  document.documentElement.setAttribute("data-ui-scale", String(scale));
}
function applyReduceMotion(on: boolean): void {
  if (on) document.documentElement.setAttribute("data-reduce-motion", "");
  else document.documentElement.removeAttribute("data-reduce-motion");
}
/** Applies every setting that takes effect without a restart. */
function applySettingsLive(): void {
  const s = settings.get();
  applyUiScale(s.uiScale);
  applyReduceMotion(s.reduceMotion);
  // Audio levels are stored and validated here; the audio pipeline (Hana's lane)
  // subscribes to the store and applies them.
  if (scene) {
    const level =
      s.graphicsQuality === "low" ? 1.5
      : s.graphicsQuality === "medium" ? 1.25
      : s.graphicsQuality === "ultra" ? 0.85
      : 1;
    scene.engine.setHardwareScalingLevel(level);
  }
}
applyUiScale(settings.get().uiScale);
applyReduceMotion(settings.get().reduceMotion);

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
  onStart: (_choice) => {
    // Character maker goes between faction select and campaign mount.
    selectionScreen.replaceWith(
      characterMaker({
        onComplete: (character) => {
          document.querySelector(".character-maker")?.remove();
          provider.setCharacter({
            firstName: character.firstName,
            lastName: character.lastName,
            gender: character.gender,
            appearanceId: character.appearanceId,
            ethnicityId: character.ethnicityId,
            age: character.age,
            startCity: character.startCity,
            difficulty: character.difficulty,
            backgroundChoices: character.backgroundChoices,
            bonusPoints: character.bonusPoints,
            startingSkills: character.startingSkills,
            startingCash: character.startingCash,
            biography: character.biography,
          });
          void reloadSnapshot().then(() => mountCampaign());
        },
        onCancel: () => location.reload(),
      }),
    );
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
  onOpenControls: () => openControls(),
  onOpenDeploymentPreview: () => openDeploymentPreview(),
  onOpenJournal: () => openJournal(),
  onOpenCodex: () => openCodex(),
  onOpenUiScale: (s) => settings.set({ uiScale: s }),
  onNotification: (entityId, field) => openWhy(entityId, field),
});

function mountCampaign(): void {
  if (!snapshot) return;
  app.appendChild(hud.root);
  paint();
  bindInputActions();
  // The scene exists by now, so graphics quality can apply to the live engine.
  // mountCampaign can run again after a snapshot reload; subscribe once.
  applySettingsLive();
  if (!settingsLive) {
    settingsLive = true;
    settings.subscribe(applySettingsLive);
  }

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

// -- input actions -----------------------------------------------------------
// Every gameplay key routes through the input registry; there are no raw key
// reads below. The chords live in `src/input/actions.ts`, the keybinding editor
// rewrites them at runtime, and gamepad/touch dispatch the same action ids.
let inputBound = false;
let settingsLive = false;

function bindInputActions(): void {
  if (inputBound) return;
  inputBound = true;

  input.on("ui.cancel", () => {
    currentPanel = "none";
    contextNode = null;
    paint();
  });

  const cycleSettlement = (dir: 1 | -1): void => {
    const ids = world?.data.settlements.map((s) => s.id) ?? [];
    if (ids.length === 0) return;
    const at = selectedSettlement ? ids.indexOf(selectedSettlement) : -1;
    const next = ids[(at + dir + ids.length) % ids.length]!;
    selectSettlement(next);
    mapCanvas.focus();
  };
  // Tab keeps its normal meaning inside panels: settlement cycling only fires
  // while the map canvas itself has keyboard focus.
  const mapFocused = (): boolean => mapCanvas === document.activeElement;
  input.on("map.nextSettlement", () => cycleSettlement(1), { when: mapFocused });
  input.on("map.prevSettlement", () => cycleSettlement(-1), { when: mapFocused });

  const PAN_STEP = 3000;
  const panBy = (dx: number, dz: number): void => {
    if (!selectedSettlement) return;
    const place = settlement(selectedSettlement);
    if (place && scene) {
      // Camera speed is read at dispatch time: changing it applies immediately.
      const step = PAN_STEP * settings.get().cameraSpeed;
      const p = worldData.projection.toWorld(place.lat, place.lon);
      scene.focus(p.x + dx * step, p.z + dz * step);
    }
  };
  const hasSelection = (): boolean => selectedSettlement !== null;
  input.on("map.panLeft", () => panBy(-1, 0), { when: hasSelection });
  input.on("map.panRight", () => panBy(1, 0), { when: hasSelection });
  input.on("map.panUp", () => panBy(0, -1), { when: hasSelection });
  input.on("map.panDown", () => panBy(0, 1), { when: hasSelection });

  window.addEventListener("keydown", (ev) => {
    input.handleKeyEvent(ev);
  });
  // Key releases route through the registry too, for hold-to-open patterns
  // (command radial menu). No preventDefault: nothing downstream needs it.
  window.addEventListener("keyup", (ev) => {
    input.handleKeyUp(ev);
  });
}

/**
 * Resolve a settlement the client was handed, whatever kind of id it carries. The
 * client uses OSM node ids; the simulation uses its own. See SettlementIndex.
 */
function settlement(idOrName: string): WorldSettlement | undefined {
  return world?.settlements.resolve(idOrName);
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

function reindexTowns(): void {
  townByPlaceId = new Map();
  for (const town of snapshot?.towns ?? []) {
    const place = settlement(town.settlementId);
    if (place) townByPlaceId.set(place.id, town);
  }
}

function townFor(settlementId: string): TownState | undefined {
  const target = settlement(settlementId)?.id ?? settlementId;
  return townByPlaceId.get(target);
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
  contextNode = town ? townNode(town) : noSimulationRecordNode(place?.name ?? id);
  syncParty();
  paint();
  if (place) hud.announcer.textContent = `${place.name} selected.`;
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
    onSetTaxRate: async (rate) => {
      await provider.setTaxRate(town.id, rate);
      previous = snapshot;
      snapshot = await provider.getSnapshot();
      rebuildContext();
      paint();
    },
    onSetStateTaxRate: async (rate) => {
      await provider.setStateTaxRate(town.state, rate);
      previous = snapshot;
      snapshot = await provider.getSnapshot();
      rebuildContext();
      paint();
    },
    onStartConstruction: async (buildingId) => {
      const result = await provider.startConstruction(town.id, buildingId);
      if (result.ok) {
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

function openControls(): void {
  currentPanel = "none";
  contextNode = keybindingEditor({
    onClose: () => {
      currentPanel = "none";
      contextNode = null;
      paint();
    },
  });
  paint();
}

const questJournal = new QuestJournal(seedQuests());

function openJournal(): void {
  currentPanel = "none";
  contextNode = questJournalPanel({
    journal: questJournal,
    onClose: () => {
      currentPanel = "none";
      contextNode = null;
      paint();
    },
  });
  paint();
}

function openCodex(): void {
  currentPanel = "none";
  contextNode = codexPanel({
    onClose: () => {
      currentPanel = "none";
      contextNode = null;
      paint();
    },
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
    case "town":
      contextNode = town ? townNode(town) : noSimulationRecordNode(settlement(selectedSettlement ?? "")?.name ?? "No town");
      return;
    case "market": {
      if (!town) {
        contextNode = noSimulationRecordNode("No market here");
        return;
      }
      contextNode = marketNode(town.id, town.name);
      return;
    }
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

} // end non-city-demo branch
