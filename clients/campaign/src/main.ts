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
import { highContrastCss } from "./design/highContrast.js";
import { installErrorBoundary } from "./ui/errorBoundary.js";
import { installConsoleTail } from "./ui/consoleTail.js";
import { openBugReporter } from "./ui/bugReporter.js";
import { installOfflineIndicator } from "./ui/offlineIndicator.js";
import { installInstallPrompt } from "./ui/installPrompt.js";
import { installUpdateNotifier } from "./ui/updateNotifier.js";
import { installPerfOverlay, setPerfStatsProvider } from "./ui/perfOverlay.js";
import { BUILD_HASH } from "./buildHash.js";

// Task 25/26: the error boundary, console tail, and bug reporter are imported
// here but installed after the canvas handles exist (see below).
installConsoleTail();

// Task 19: the high-contrast theme is generated from highContrast.ts so the
// values the test verifies are the values the user gets.
{
  const style = document.createElement("style");
  style.id = "high-contrast-theme";
  style.textContent = highContrastCss();
  document.head.appendChild(style);
}
import { status } from "./design/tokens.js";
import { factionPalette, PLAYABLE_SIDE_IDS } from "./design/factions.js";
import type { ColorblindMode } from "./settings/schema.js";

import { readConfig, providerFromConfig, SimulationUnavailableError } from "./data/provider.js";
import { TEST_SOURCE_WARNING, TEST_SOURCE_DETAIL } from "./data/labels.js";
import { START_YEAR, eraGradeForYear } from "./design/grade.js";
import { buildWorld } from "./world/build.js";
import { publishWorld } from "./world/context.js";
import { classifySettlement } from "./world/load.js";
import type { WorldSettlement } from "./world/types.js";
import { createCampaignScene, VERTICAL_SCALE, type SceneHandle } from "./scene/CampaignScene.js";
import { findRoute, shortestPath } from "./scene/network.js";
import { createHud, dataSourcePanel, fatalError, type HudPanel, type HudState } from "./ui/hud.js";
import { createGamepadManager, createStickCamera, moveFocus, type GamepadManager, type StickCamera, type StickSource } from "./input/gamepad/index.js";
import { createHaptics, type Haptics } from "./input/gamepad/haptics.js";
import { createTouchOverlay, isTouchDevice, type TouchOverlay } from "./input/touch/overlay.js";
import { marketPanel } from "./ui/panels/MarketPanel.js";
import { settingsPanel } from "./ui/panels/SettingsPanel.js";
import { partyPanel } from "./ui/panels/PartyPanel.js";
import { marchPlanner } from "./ui/panels/MarchPlanner.js";
import { ledgerPanel } from "./ui/panels/LedgerPanel.js";
import { rulerCard, rulerRoster } from "./ui/panels/RulerPanel.js";
import { startScreen } from "./ui/panels/StartScreen.js";
import { characterMaker, BONUS_POINTS_TOTAL } from "./ui/panels/CharacterMaker.js";
import { runCityDemo } from "./scene/cityDemo.js";
import { townPanel } from "./ui/panels/TownPanel.js";
import { whyPanel } from "./ui/panels/WhyPanel.js";
import type {
  GoodId,
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
import {
  QuestTracker,
  buildTrackerViews,
  createQuestTrackerHud,
  localStoragePinStorage,
} from "./questTracker/index.js";
import type { TrackerPositionSource } from "./questTracker/index.js";
import { questJournalPanel } from "./ui/panels/QuestJournal.js";
import { createAchievementStore } from "./achievements/index.js";
import { achievementsPanel } from "./ui/panels/Achievements.js";
import { mountBattleUi, type BattleMount } from "./battleflow/mount.js";
import { createGalleryStore, createPhotoMode, galleryPanel, mountPhotoModeBar, type PhotoModeBarHandle } from "./expression/index.js";
import { chroniclePanel, seasonForDay } from "./expression/chroniclePanel.js";
import { createMemorial, memorialPanel } from "./afteraction/index.js";
import { lawsPanel, DEFAULT_LAWS, type ClanLaws } from "./clan/index.js";
import type { ChronicleEvent, Oath } from "./expression/chronicle.js";
import {
  boundsForWorld,
  clearBattleSites,
  loadBattleSites,
  recordBattleSite,
  saveBattleSites,
  type BattleSite,
} from "./meta/heatmap.js";
import { heatmapPanel, type HeatmapPanelHandle } from "./meta/heatmapPanel.js";
import { timelinePanel } from "./meta/timelinePanel.js";
import { makeWorldProjector } from "./meta/heatmapProjector.js";
import {
  clearIronmanRun,
  manualSaveBlocked,
  startIronmanRun,
  type IronmanRunRecord,
} from "./meta/ironman.js";
import {
  carryoverLines,
  clearNewGamePlusRecord,
  legacyBiographyLine,
  loadNewGamePlusRecord,
  saveNewGamePlusRecord,
  type BankInput,
  type NewGamePlusRecord,
} from "./meta/newgameplus.js";
import { legacyPanel } from "./meta/legacyPanel.js";
import { createRouteRegistry, type FoundInput } from "./economy/routeRegistry.js";
import {
  buildRouteModels,
  routePanel,
  type GoodChoice,
  type RoutePanelHandle,
  type SettlementChoice,
} from "./economy/routePanel.js";
import { saveLoadPanel } from "./saves/mount.js";
import { SaveUiError } from "./saves/screens.js";
import { ALL_CODEX_ENTRIES, CODEX_CATEGORIES } from "./codex/index.js";
import { toast } from "./ui/kit.js";
import { settings, type Settings } from "./settings/index.js";
import { FpsBenchmark, presetForFps } from "./settings/autodetect.js";
import { presetPatch } from "./settings/presets.js";

const appEl = document.getElementById("app");
const canvasEl = document.getElementById("map");
if (!appEl) throw new Error("#app is missing from index.html");
if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error("#map is missing from index.html");
const app = appEl;
const mapCanvas = canvasEl;

// Task 25: the global error boundary turns fatal failures into a recovery
// overlay instead of a blank canvas. Task 26: its report action opens the bug
// reporter with a screenshot attempt, the console tail, and live settings.
installErrorBoundary({
  onReport: (report) =>
    openBugReporter(report, {
      screenshot: () => {
        try {
          return mapCanvas.toDataURL("image/png");
        } catch {
          return null;
        }
      },
      getSettings: () => settings.get(),
      buildHash: BUILD_HASH,
    }),
});

// Task 27: the offline banner appears within 5s of losing connectivity.
installOfflineIndicator();

// Task 29: polls /build.json and offers a reload when a newer deployment lands.
installUpdateNotifier();

// Task 30: FPS / frame-time / draw-call overlay; `?perf=1` shows it at boot.
installPerfOverlay();

// Task 28: installable fullscreen PWA. Registered in production builds only:
// in dev the Vite server owns the assets and a worker cache would serve stale
// modules between edits.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {
    // Offline support is a bonus, not a requirement; the game boots fine
    // without the worker.
  });
}
// Listens for the browser's install offer and shows the game's own banner.
// Harmless in dev and on browsers without install support: it does nothing
// until the event fires.
installInstallPrompt();

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
/**
 * Applies the active faction palette (task 18): sets `--faction-<side-id>` and
 * `--faction-<side-id>-ink` custom properties plus `data-colorblind-mode`, so
 * banners, markers, and lists can color by side without hard-coding hexes.
 */
function applyFactionPalette(mode: ColorblindMode): void {
  const root = document.documentElement;
  root.setAttribute("data-colorblind-mode", mode);
  const pal = factionPalette(mode);
  for (const id of PLAYABLE_SIDE_IDS) {
    root.style.setProperty(`--faction-${id}`, pal[id]!.color);
    root.style.setProperty(`--faction-${id}-ink`, pal[id]!.ink);
  }
}
function applyHighContrast(on: boolean): void {
  if (on) document.documentElement.setAttribute("data-high-contrast", "");
  else document.documentElement.removeAttribute("data-high-contrast");
}
let autoDetectStarted = false;

/**
 * First-launch quality auto-detect (task 13). Samples real rendered frames for
 * ~2 seconds, picks the preset the hardware earns, and reloads once if a
 * construction-time key (AA, terrain density, GPU hint) changed. Runs exactly
 * once: the `autoQualityDone` flag persists the decision.
 */
function maybeAutoDetectQuality(): void {
  if (autoDetectStarted || !scene) return;
  if (settings.get().autoQualityDone) return;
  autoDetectStarted = true;
  const bench = new FpsBenchmark();
  toast("Detecting hardware — picking graphics quality…", 3000);
  const tick = () => {
    if (!bench.frame()) {
      requestAnimationFrame(tick);
      return;
    }
    const fps = bench.result() ?? 0;
    const pick = presetForFps(fps);
    const patch = presetPatch(pick);
    const cur = settings.get();
    // Construction-time keys need a reload; live keys apply via subscription.
    const needsReload =
      patch.antialias !== cur.antialias ||
      patch.powerPreference !== cur.powerPreference ||
      patch.terrainDetail !== cur.terrainDetail;
    settings.set({ ...patch, autoQualityDone: true });
    toast(`Auto quality: ${pick} (${Math.round(fps)} fps measured)`);
    if (needsReload) location.reload();
  };
  requestAnimationFrame(tick);
}

/** Applies every setting that takes effect without a restart. */
function applySettingsLive(): void {  const s = settings.get();
  applyUiScale(s.uiScale);
  applyReduceMotion(s.reduceMotion);
  applyFactionPalette(s.colorblindMode);
  applyHighContrast(s.highContrast);
  // Audio levels are stored and validated here; the audio pipeline (Hana's lane)
  // subscribes to the store and applies them.
  if (scene) {
    scene.engine.setHardwareScalingLevel(s.renderScale);
    scene.setMaxFps(s.maxFps);
    scene.applyMouseSettings(s.mouseSensitivity, s.invertMouseX, s.invertMouseY);
    scene.applyShadowQuality(s.shadowQuality);
    scene.applyViewDistance(s.viewDistance);
    scene.setReduceMotion(s.reduceMotion);
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
// -- New Game+ (MASTER_PLAN task 142) ----------------------------------------
// The banked legacy, read once at boot. Applied to the heir's character when
// a New Game+ campaign mounts, then consumed — a cancelled character maker
// (which reloads the page) re-reads it from storage, so the legacy is only
// spent on a campaign that actually starts.
let ngplusRecord: NewGamePlusRecord | null = loadNewGamePlusRecord();
let pendingNewGamePlus = false;
/** Battle victories this session, for the NG+ bank preview. */
let sessionBattlesWon = 0;
let world: Awaited<ReturnType<typeof buildWorld>> | null = null;
/** Ironman (MASTER_PLAN task 143): chosen on the start screen, started when the campaign mounts. */
let pendingIronman = false;
let ironman: IronmanRunRecord | null = null;
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
  antialias: settings.get().antialias,
  powerPreference: settings.get().powerPreference,
  terrainSamples: settings.get().terrainDetail === "low" ? 128 : 256,
  maxFps: settings.get().maxFps,
});

// Task 30: real draw-call counts for the perf overlay, from Babylon's own
// instrumentation. Lazily imported so the overlay module stays Babylon-free.
void import("@babylonjs/core/Instrumentation/sceneInstrumentation.js").then(
  ({ SceneInstrumentation }) => {
    const instrumentation = new SceneInstrumentation(scene.scene);
    // Draw calls need no capture flag: the constructor's render observer
    // advances engine._drawCalls every frame unconditionally.
    setPerfStatsProvider({ drawCalls: () => instrumentation.drawCallsCounter.current });
  },
  () => {
    // Instrumentation unavailable: the overlay shows "draws n/a" instead.
  },
);

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
  newGamePlusLines: ngplusRecord ? carryoverLines(ngplusRecord) : undefined,
  onStart: (choice) => {
    // Character maker goes between faction select and campaign mount.
    pendingIronman = choice.ironman === true;
    pendingNewGamePlus = choice.newGamePlus === true && ngplusRecord !== null;
    selectionScreen.replaceWith(
      characterMaker({
        bonusPointsTotal:
          pendingNewGamePlus && ngplusRecord ? BONUS_POINTS_TOTAL + ngplusRecord.bonusPoints : undefined,
        onComplete: (character) => {
          document.querySelector(".character-maker")?.remove();
          // New Game+ (task 142): the heir inherits gold and a legacy line.
          // Renown itself is sim-side with no client write path, so it is
          // recorded in the biography and the carryover list, not faked
          // into the sim.
          const startingCash =
            pendingNewGamePlus && ngplusRecord ? character.startingCash + ngplusRecord.gold : character.startingCash;
          const biography =
            pendingNewGamePlus && ngplusRecord
              ? `${character.biography}\n\n${legacyBiographyLine(ngplusRecord)}`
              : character.biography;
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
            startingCash,
            biography,
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
  gamepadLabel: () => gamepadLabel,
  onTimeScale: (s) => {
    timeScale = s;
    provider.setTimeScale(s);
    paint();
  },
  onSkipToArrival: () => void skipToArrival(),
  onOpenDataSource: () => openDataSource(),
  onOpenControls: () => openControls(),
  onOpenSettings: () => openSettings(),
  onOpenSaveLoad: () => openSaveLoad(),
  onOpenDeploymentPreview: () => openDeployment(),
  onOpenJournal: () => openJournal(),
  onOpenCodex: () => openCodex(),
  onOpenAchievements: () => openAchievements(),
  onOpenPhotoMode: () => enterPhotoMode(),
  onOpenGallery: () => openGallery(),
  onOpenChronicle: () => openChronicle(),
  onOpenTimeline: () => openTimeline(),
  onOpenHeatmap: () => toggleHeatmap(),
  onOpenMemorial: () => openMemorial(),
  onOpenClanLaws: () => openClanLaws(),
  onOpenLegacy: () => openLegacyPanel(),
  onOpenQuestTracker: () => openQuestTracker(),
  onOpenTradeRoutes: () => toggleTradeRoutes(),
  ironmanActive: () => manualSaveBlocked(ironman),
  onOpenUiScale: (s) => settings.set({ uiScale: s }),
  onNotification: (entityId, field) => openWhy(entityId, field),
});

/** Battle domain needs numeric ids (`party-<n>` wire scheme). -1 = not a battle id. */
function parseBattlePartyId(id: string | undefined): number {
  const m = typeof id === "string" ? /^party-(\d+)$/.exec(id) : null;
  return m ? Number(m[1]) : -1;
}

/** The full-screen battle overlay; mounted once per campaign session. */
let battleUi: BattleMount | null = null;

// -- Chronicle (Rowan): clan oath + deed log, persisted locally -------------
const CHRONICLE_KEY = "fentmen.chronicle.v1";

interface ChronicleStore {
  events: ChronicleEvent[];
  oath: Oath | null;
}

function loadChronicle(): ChronicleStore {
  try {
    const raw = localStorage.getItem(CHRONICLE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ChronicleStore>;
      return {
        events: Array.isArray(parsed.events) ? parsed.events : [],
        oath: parsed.oath ?? null,
      };
    }
  } catch {
    // Corrupted entry: start the chronicle fresh rather than crashing.
  }
  return { events: [], oath: null };
}

const chronicle: ChronicleStore = loadChronicle();

function persistChronicle(): void {
  try {
    localStorage.setItem(CHRONICLE_KEY, JSON.stringify(chronicle));
  } catch {
    // Storage full or blocked: keep the chronicle in memory for the session.
  }
}

/** Record a deed against the current season. */
function recordDeed(kind: ChronicleEvent["kind"], text: string): void {
  chronicle.events.push({ season: seasonForDay(snapshot?.day ?? 0), kind, text });
  persistChronicle();
  timelineRefresh?.();
}

// -- Battle heatmap (MASTER_PLAN task 140): where you've fought, on the map -
let battleSites: BattleSite[] = loadBattleSites();
let heatmapHandle: HeatmapPanelHandle | null = null;

/** Record a battle site at the player's current position. */
function recordHeatSite(won: boolean): void {
  const pos = snapshot?.party?.position;
  if (!pos) return;
  battleSites = recordBattleSite(battleSites, {
    x: pos.x,
    z: pos.z,
    won,
    season: seasonForDay(snapshot?.day ?? 0),
    label: won ? "Victory" : "Defeat",
  });
  saveBattleSites(battleSites);
  heatmapHandle?.refresh();
}

function closeHeatmap(): void {
  const handle = heatmapHandle;
  heatmapHandle = null;
  handle?.root.remove();
  handle?.dispose();
}

/** Toggle the heatmap overlay + floating card (HUD rail button). */
function toggleHeatmap(): void {
  if (heatmapHandle) {
    closeHeatmap();
    return;
  }
  const liveScene = scene;
  const stage = mapCanvas.parentElement;
  if (!liveScene || !stage) return;
  const projection = worldData.projection;
  heatmapHandle = heatmapPanel({
    sites: () => battleSites,
    bounds: boundsForWorld(projection.width, projection.depth),
    toScreen: makeWorldProjector(
      liveScene.scene,
      (x, z) => projection.heightAt(x, z) * VERTICAL_SCALE,
    ),
    overlayHost: stage,
    renderSize: () => ({
      width: liveScene.engine.getRenderWidth(),
      height: liveScene.engine.getRenderHeight(),
    }),
    onClear: () => {
      battleSites = [];
      clearBattleSites();
      heatmapHandle?.refresh();
    },
    onClose: () => closeHeatmap(),
  });
  heatmapHandle.root.classList.add("heatmap__card");
  app.appendChild(heatmapHandle.root);
}

// -- Trade routes (MASTER_PLAN tasks 102/103): caravan management + the ----
// animated route layer on the campaign map. Prices come from the live
// snapshot markets, distances from the road graph, guard wages from the
// player's party troops — the registry books, it never invents.
const routeRegistry = createRouteRegistry(localStorage);
let routesHandle: RoutePanelHandle | null = null;

/** Sim price of a good at a client settlement, or null when the sim reports none. */
function caravanPriceAt(goodId: GoodId, settlementId: string): number | null {
  const town = townByPlaceId.get(settlementId);
  const market = town ? snapshot?.markets[town.id] : undefined;
  const price = market?.goods.find((g) => g.goodId === goodId)?.price;
  return typeof price === "number" && Number.isFinite(price) ? price : null;
}

/** Average daily wage across the player's troops; 0 when there are no troops. */
function caravanGuardWage(): number {
  const troops = snapshot?.party?.troops ?? [];
  const headcount = troops.reduce((s, t) => s + t.count, 0);
  if (headcount <= 0) return 0;
  return troops.reduce((s, t) => s + t.wage * t.count, 0) / headcount;
}

/** World position of a settlement, for drawing its route legs. */
function routePositionOf(settlementId: string): { x: number; z: number } | null {
  const s = settlement(settlementId);
  if (!s || !worldData) return null;
  const p = worldData.projection.toWorld(s.lat, s.lon);
  return { x: p.x, z: p.z };
}

/** Settlements with a sim town (caravans trade at markets). */
function tradeSettlementChoices(): SettlementChoice[] {
  if (!world) return [];
  return world.settlements
    .all()
    .filter((s) => townByPlaceId.has(s.id))
    .map((s) => ({ id: s.id, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every good the live markets sell, for the cargo picker. */
function tradeGoodChoices(): GoodChoice[] {
  const seen = new Map<GoodId, string>();
  for (const market of Object.values(snapshot?.markets ?? {})) {
    for (const g of market.goods) {
      if (!seen.has(g.goodId)) seen.set(g.goodId, g.name);
    }
  }
  return [...seen]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function closeTradeRoutes(): void {
  const handle = routesHandle;
  routesHandle = null;
  handle?.root.remove();
  handle?.dispose();
}

/** Toggle the trade routes card + animated map overlay (HUD rail button). */
function toggleTradeRoutes(): void {
  if (routesHandle) {
    closeTradeRoutes();
    return;
  }
  const liveScene = scene;
  const stage = mapCanvas.parentElement;
  if (!liveScene || !stage) return;
  const projection = worldData.projection;
  routesHandle = routePanel({
    caravans: () => routeRegistry.list(),
    onFound: (input: FoundInput) => {
      routeRegistry.found(input, snapshot?.day ?? 0, {
        distanceKm: (fromId, toId) => {
          const r = findRoute(worldData.graph, fromId, toId);
          return r.found ? r.distanceKm : null;
        },
        // The sim's own party speed paces the caravan; the fallback only
        // matters before the first snapshot arrives.
        kmPerDay:
          snapshot?.party?.speedKmPerDay && snapshot.party.speedKmPerDay > 0
            ? snapshot.party.speedKmPerDay
            : 40,
      });
    },
    onRetire: (id: string) => {
      routeRegistry.retire(id);
    },
    settlements: tradeSettlementChoices,
    goods: tradeGoodChoices,
    models: () => buildRouteModels(routeRegistry.list(), routePositionOf),
    toScreen: makeWorldProjector(
      liveScene.scene,
      (x, z) => projection.heightAt(x, z) * VERTICAL_SCALE,
    ),
    overlayHost: stage,
    renderSize: () => ({
      width: liveScene.engine.getRenderWidth(),
      height: liveScene.engine.getRenderHeight(),
    }),
    onClose: () => closeTradeRoutes(),
  });
  routesHandle.root.classList.add("routes__float");
  app.appendChild(routesHandle.root);
}

/**
 * Photo mode (MASTER_PLAN task 123): hides the interface and frees the
 * camera for a screenshot. The simulation clock is deliberately NOT paused —
 * pausing time is the time-controls lane (Pax) — so the bar says the world
 * keeps moving. Capture reads the Babylon canvas directly; the engine is
 * created with `preserveDrawingBuffer: true`, so `toDataURL` sees the frame
 * just rendered.
 */
let photoBar: PhotoModeBarHandle | null = null;

function enterPhotoMode(): void {
  if (photoBar || !scene) return;
  haptics?.play("select");
  photoBar = mountPhotoModeBar({
    photo: createPhotoMode(),
    onOrbit: (dYaw, dPitch) =>
      scene?.cameraControl({ dAlpha: dYaw, dBeta: dPitch }),
    onZoom: (factor) => scene?.cameraControl({ zoomFactor: factor }),
    captureFrame: () => {
      try {
        return mapCanvas.toDataURL("image/png");
      } catch {
        return null;
      }
    },
    onCapture: (dataUrl) => {
      gallery.add(dataUrl);
    },
    setInterfaceHidden: (hidden) => {
      app.style.display = hidden ? "none" : "";
    },
    suspendInput: () => input.suspend(),
    resumeInput: () => input.resume(),
    onExit: () => {
      photoBar = null;
    },
  });
}

function mountCampaign(): void {
  if (!snapshot) return;

  // -- Ironman (MASTER_PLAN task 143) --------------------------------------
  // The run starts with the campaign, on the sim's own day. A fresh
  // non-ironman campaign retires any stale record so a crashed ironman run
  // cannot leak its single-autosave rule into the next one.
  if (pendingIronman) {
    ironman = startIronmanRun(snapshot.day);
  } else if (ironman === null) {
    clearIronmanRun();
  }
  pendingIronman = false;

  // -- New Game+ (MASTER_PLAN task 142) --------------------------------------
  // The legacy is spent only now that the heir's campaign actually mounts.
  if (pendingNewGamePlus) {
    clearNewGamePlusRecord();
    ngplusRecord = null;
  }
  pendingNewGamePlus = false;

  app.appendChild(hud.root);
  paint();

  // -- Battle UI overlay (Rowan): mounts once. The encounter poller adopts
  //    server encounters automatically; manual encounters go through
  //    battleUi.attack(attackerId, defenderId) when an attack affordance lands.
  if (!battleUi) {
    const party = snapshot.party;
    const troopCount = party.troops.reduce((n, s) => n + s.count, 0);
    const troopPower = party.troops.reduce((n, s) => n + s.count * s.tier, 0);
    const battlePartyId = parseBattlePartyId(party.id);
    battleUi = mountBattleUi({
      apiBaseUrl: config.simulationHttpUrl,
      playerPartyId: battlePartyId,
      local: {
        describeEncounter: (attackerId, defenderId) => ({
          attacker: {
            partyId: attackerId,
            name: party.name,
            troops: troopCount,
            power: troopPower,
          },
          defender: {
            partyId: defenderId,
            name: "Raider band",
            troops: Math.max(10, Math.round(troopCount * 0.8)),
            power: Math.max(10, Math.round(troopPower * 0.8)),
          },
        }),
      },
      pollEncounters: battlePartyId >= 0,
      onBattleEvent: (event) => {
        if (event === "victory") {
          haptics?.play("confirm");
          achievements.record("battle-won");
          recordDeed("battle", "Won a battle.");
          recordHeatSite(true);
          sessionBattlesWon += 1;
        } else if (event === "defeat") {
          haptics?.play("error");
          achievements.record("battle-lost");
          recordDeed("battle", "Lost a battle.");
          recordHeatSite(false);
        } else {
          haptics?.play("order");
        }
      },
      onDone: () => {
        // The overlay persists (hidden) and the poller keeps adopting future
        // encounters; just refresh the campaign state underneath.
        void reloadSnapshot();
      },
    });
  }

  bindInputActions();
  bindGamepad();
  bindTouch();
  bindStickCamera();
  // The scene exists by now, so graphics quality can apply to the live engine.
  // mountCampaign can run again after a snapshot reload; subscribe once.
  applySettingsLive();
  maybeAutoDetectQuality();
  if (!settingsLive) {
    settingsLive = true;
    settings.subscribe(applySettingsLive);
    settings.subscribe(trackSettingsChanges);
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

// -- gamepad (MASTER_PLAN task 1) --------------------------------------------
// Detection + mapping layer. Buttons dispatch through the input registry (the
// `gamepad` field on ActionDef owns the mapping); the d-pad / left stick move
// focus spatially so every menu works with no mouse.
let gamepad: GamepadManager | null = null;
let haptics: Haptics | null = null;
let stickCamera: StickCamera | null = null;
let gamepadBound = false;
let touchOverlay: TouchOverlay | null = null;
let touchBound = false;
let gamepadLabel: string | null = null;

function bindGamepad(): void {
  if (gamepadBound) return;
  gamepadBound = true;
  const enabled = (): boolean => settings.get().gamepadEnabled && !input.suspended;
  gamepad = createGamepadManager({
    onButton: (index, pressed, padIndex) => input.handleGamepadButton(index, pressed, padIndex),
    onNavigate: (dir) => {
      // In map view the sticks drive the camera (task 2); menus navigate.
      if (currentPanel === "none") return;
      // Never yank focus out from under typing.
      const ae = document.activeElement;
      if (ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement || ae instanceof HTMLSelectElement) return;
      moveFocus(dir);
    },
    onStatusChange: (s) => {
      gamepadLabel = s.connected ? s.label : null;
      paint();
    },
    isEnabled: enabled,
  });
  gamepad.start();

  // Rumble on key battle events (MASTER_PLAN task 7). The battle view wires
  // the commander's onOrder/onSelect/onHit hooks to this when it builds one.
  haptics = createHaptics({
    source: gamepad,
    isEnabled: () => settings.get().hapticsEnabled && gamepad !== null && gamepad.connected(),
  });
}

// -- touch overlay (MASTER_PLAN task 3) --------------------------------------
// Virtual joystick + A/B buttons for mobile play. The joystick is a StickSource,
// so the twin-stick camera driver below consumes it exactly like a gamepad
// stick; buttons dispatch the same action ids as keyboard/gamepad.
function bindTouch(): void {
  if (touchBound) return;
  touchBound = true;
  if (!isTouchDevice()) return;
  touchOverlay = createTouchOverlay({
    dispatch: (id) => {
      input.dispatch(id, "touch");
    },
    isEnabled: () => !input.suspended,
  });
}

// -- twin-stick camera (MASTER_PLAN task 2, touch-fed by task 3) --------------
// One driver, one composite source: a connected gamepad wins, otherwise the
// touch overlay's virtual joystick drives. Only in map view — while a panel is
// open the sticks navigate it.
function bindStickCamera(): void {
  const source: StickSource = {
    axes: (padIndex) => {
      if (gamepad?.connected()) return gamepad.axes(padIndex);
      return touchOverlay?.axes() ?? [0, 0, 0, 0];
    },
    triggers: (padIndex) => {
      if (gamepad?.connected()) return gamepad.triggers(padIndex);
      return [0, 0];
    },
  };
  const enabled = (): boolean => settings.get().gamepadEnabled && !input.suspended;
  stickCamera = createStickCamera({
    source,
    control: (delta) => scene?.cameraControl(delta),
    isEnabled: enabled,
    isActive: () => currentPanel === "none" && scene !== null,
    speedScale: () => settings.get().cameraSpeed,
  });
  stickCamera.start();
}

function bindInputActions(): void {
  if (inputBound) return;
  inputBound = true;

  input.on("ui.cancel", () => {
    currentPanel = "none";
    contextNode = null;
    paint();
  });

  input.on("ui.settings", () => openSettings());

  // Touch A behaves like gamepad A: keyboard Enter is left alone — it already
  // activates natively, and this guard keeps the two from double-firing.
  input.on("ui.confirm", (ev) => {
    if (ev.source !== "gamepad" && ev.source !== "touch") return;
    const el = document.activeElement;
    if (el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement) el.click();
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

function openSettings(): void {
  currentPanel = "none";
  contextNode = settingsPanel({
    onClose: () => {
      currentPanel = "none";
      contextNode = null;
      paint();
    },
  });
  paint();
}

function openSaveLoad(): void {
  currentPanel = "none";
  const { root } = saveLoadPanel({
    ironmanActive: manualSaveBlocked(ironman),
    currentSnapshot: () => {
      if (!snapshot) throw new Error("No snapshot to save yet.");
      return snapshot;
    },
    onLoad: () => {
      // No provider-level snapshot restore exists yet (PAX's data lane);
      // fail in plain language rather than faking a load.
      throw new SaveUiError("Loading a save back into the running game is not supported yet.");
    },
    onClose: () => {
      currentPanel = "none";
      contextNode = null;
      paint();
    },
  });
  contextNode = root;
  paint();
}

// -- Campaign timeline (Rowan, MASTER_PLAN task 139) --------------------------
// Visual history of the reign: the chronicle's recorded deeds plotted by
// season on a date-ordered spine. Same event store as the prose chronicle.
function openTimeline(): void {
  currentPanel = "none";
  const { root, refresh } = timelinePanel({
    events: () => chronicle.events,
    onClose: () => {
      currentPanel = "none";
      contextNode = null;
      timelineRefresh = null;
      paint();
    },
  });
  timelineRefresh = refresh;
  contextNode = root;
  paint();
}

/** Re-render the open timeline, if any, after a new deed is recorded. */
let timelineRefresh: (() => void) | null = null;

function openChronicle(): void {
  currentPanel = "none";
  const { root } = chroniclePanel({
    events: () => chronicle.events,
    oath: () => chronicle.oath,
    setOath: (oath) => {
      chronicle.oath = oath;
      persistChronicle();
    },
    currentSeason: () => seasonForDay(snapshot?.day ?? 0),
    onClose: () => {
      currentPanel = "none";
      contextNode = null;
      paint();
    },
  });
  contextNode = root;
  paint();
}

// -- War memorial (Rowan, MASTER_PLAN task 75) --------------------------------
const memorial = createMemorial();

// -- Clan laws (MASTER_PLAN task 82): inheritance + marriage policy, -------
// persisted locally. Corrupt or out-of-range values fall back to the
// ancient laws (primogeniture / alliance-first) rather than crashing.
const CLAN_LAWS_KEY = "fentmen.clanLaws.v1";

const INHERITANCE_LAWS: ClanLaws["inheritance"][] = ["primogeniture", "ultimogeniture", "partible", "elective"];
const MARRIAGE_POLICIES: ClanLaws["marriagePolicy"][] = ["alliance-first", "love-match", "dowry-first"];

function loadClanLaws(): ClanLaws {
  try {
    const raw = localStorage.getItem(CLAN_LAWS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ClanLaws>;
      if (parsed && INHERITANCE_LAWS.includes(parsed.inheritance as ClanLaws["inheritance"]) &&
          MARRIAGE_POLICIES.includes(parsed.marriagePolicy as ClanLaws["marriagePolicy"])) {
        return { inheritance: parsed.inheritance!, marriagePolicy: parsed.marriagePolicy! };
      }
    }
  } catch {
    // Corrupted entry: fall back to the ancient laws.
  }
  return { ...DEFAULT_LAWS };
}

let clanLaws: ClanLaws = loadClanLaws();

function persistClanLaws(): void {
  try {
    localStorage.setItem(CLAN_LAWS_KEY, JSON.stringify(clanLaws));
  } catch {
    // Storage full or blocked: keep the laws in memory for the session.
  }
}

function openClanLaws(): void {
  currentPanel = "none";
  const { root } = lawsPanel({
    laws: () => clanLaws,
    onChange: (next) => {
      clanLaws = next;
      persistClanLaws();
    },
    onReset: () => {
      clanLaws = { ...DEFAULT_LAWS };
      persistClanLaws();
    },
    // No clan roster source yet (the family tree, task 76, records members);
    // the panel shows the honest empty state until one exists.
    roster: () => null,
    holdings: () => world?.data.settlements.map((s) => s.name) ?? [],
    onClose: () => {
      currentPanel = "none";
      contextNode = null;
      paint();
    },
  });
  contextNode = root;
  paint();
}

function openMemorial(): void {
  currentPanel = "none";
  const { root, refresh } = memorialPanel({
    entries: () => memorial.list(),
    onClear: () => {
      memorial.clear();
      refresh();
    },
    onClose: () => {
      currentPanel = "none";
      contextNode = null;
      paint();
    },
  });
  contextNode = root;
  paint();
}

function openControls(): void {
  currentPanel = "none";
  contextNode = keybindingEditor({
    onRebind: (_actionId, category) => {
      achievements.record("controls.rebound", { category });
    },
    onClose: () => {
      currentPanel = "none";
      contextNode = null;
      paint();
    },
  });
  paint();
}

const questJournal = new QuestJournal(seedQuests(), {
  onEvent: (type, fields) => {
    achievements.record(type, fields);
  },
});

// -- Quest tracker HUD (Rowan, MASTER_PLAN task 115) --------------------------
// Up to 3 pinned active quests with live objective counts and the distance
// from the party to the quest's settlement. The tracker model is pure; this
// section only supplies the live position source.
const questTracker = new QuestTracker(localStoragePinStorage(localStorage));
const TRACKER_COLLAPSED_KEY = "campaign.questTracker.collapsed.v1";

function loadTrackerCollapsed(): boolean {
  try {
    return localStorage.getItem(TRACKER_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function trackerPositionSource(): TrackerPositionSource {
  return {
    player() {
      const pos = snapshot?.party?.position;
      return pos ? { x: pos.x, z: pos.z } : null;
    },
    settlement(name: string) {
      if (!world || !name) return null;
      const s = world.settlements.resolve(name);
      if (!s) return null;
      const p = world.projection.toWorld(s.lat, s.lon);
      return { x: p.x, z: p.z };
    },
  };
}

const trackerHud = createQuestTrackerHud({
  views: () => buildTrackerViews(questJournal.all(), questTracker.pinnedIds(), trackerPositionSource()),
  onUnpin: (id) => {
    questTracker.unpin(id);
    refreshQuestTracker();
  },
  onOpenJournal: () => openJournal(),
  collapsed: loadTrackerCollapsed(),
  onToggleCollapsed: (collapsed) => {
    try {
      localStorage.setItem(TRACKER_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // Collapsed state is a nicety; blocked storage must not break the HUD.
    }
  },
});
hud.root.appendChild(trackerHud.root);

/** Prune finished quests, then repaint the tracker card. */
function refreshQuestTracker(): void {
  questTracker.prune(questJournal.all());
  trackerHud.refresh();
}

/** Expand the tracker card from the HUD rail "Tracker" button. */
function openQuestTracker(): void {
  if (trackerHud.isCollapsed()) trackerHud.setCollapsed(false);
  trackerHud.refresh();
}

// --- Screenshot gallery (MASTER_PLAN task 130) --------------------------------
// In-session capture list. Photo mode feeds it through the bar's onCapture
// hook; the HUD rail "Gallery" button opens the browser panel.
const gallery = createGalleryStore();

function openGallery(): void {
  currentPanel = "none";
  contextNode = galleryPanel({
    store: gallery,
    onClose: () => {
      currentPanel = "none";
      contextNode = null;
      paint();
    },
  });
  paint();
}

// --- Achievements (MASTER_PLAN task 137) --------------------------------------
// One store for the whole client. Anything here records events; the panel is
// read-only. Other lanes can call `achievements.record(...)` later for
// battle/economy events without touching this wiring.
const achievements = createAchievementStore(localStorage);
achievements.onUnlock((defs) => {
  for (const d of defs) toast(`Achievement unlocked: ${d.title}`);
});

function openDeployment(): void {
  achievements.record("deployment.opened");
  const prev = new Map<string, string>();
  openDeploymentPreview({
    onConfirm: () => {
      achievements.record("battle.deployed");
      haptics?.play("deploy");
    },
    onChange: (placements) => {
      let placed = 0;
      let moved = 0;
      const next = new Map<string, string>();
      for (const p of placements) {
        const key = `${p.x},${p.y}`;
        next.set(p.unitId, key);
        if (!prev.has(p.unitId)) placed += 1;
        else if (prev.get(p.unitId) !== key) moved += 1;
      }
      prev.clear();
      for (const [k, v] of next) prev.set(k, v);
      if (placed > 0) achievements.record("deployment.unit_placed", undefined, placed);
      if (moved > 0) achievements.record("deployment.unit_moved", undefined, moved);
    },
  });
}

// Feed per-key settings changes into the achievements store.
let prevSettingsJson: string | null = null;
function trackSettingsChanges(): void {
  const current = settings.get();
  if (prevSettingsJson !== null) {
    const prev = JSON.parse(prevSettingsJson) as Settings;
    for (const key of Object.keys(current) as (keyof Settings)[]) {
      if (key === "version") continue;
      if (JSON.stringify(current[key]) !== JSON.stringify(prev[key])) {
        achievements.record("settings.changed", { key });
      }
    }
  }
  prevSettingsJson = JSON.stringify(current);
}

function openAchievements(): void {
  achievements.record("achievements.opened");
  currentPanel = "none";
  contextNode = achievementsPanel({
    store: achievements,
    onClose: () => {
      currentPanel = "none";
      contextNode = null;
      paint();
    },
  });
  paint();
}

// --- New Game+ (MASTER_PLAN task 142) ------------------------------------------
// The Legacy panel banks the current campaign. Gear names ride along empty
// for now: nothing in the campaign layer reports won tournament prizes yet
// (modes/prizes.ts), so the panel banks what it can honestly measure rather
// than inventing heirlooms.
function bankPreviewInput(): BankInput | null {
  if (!snapshot) return null;
  return {
    rulerName: snapshot.player.characterName,
    renown: snapshot.player.renown,
    playerMoney: snapshot.player.resources.money,
    playerGold: snapshot.player.resources.gold,
    partyMoney: snapshot.party.money,
    gearNames: [],
    day: snapshot.day,
    battlesWon: sessionBattlesWon,
  };
}

function openLegacyPanel(): void {
  currentPanel = "none";
  contextNode = legacyPanel({
    record: () => loadNewGamePlusRecord(),
    preview: () => bankPreviewInput() ?? { rulerName: "", renown: 0, playerMoney: 0, playerGold: 0, partyMoney: 0, gearNames: [], day: 0, battlesWon: 0 },
    onBank: (record) => saveNewGamePlusRecord(record),
    onDiscard: () => clearNewGamePlusRecord(),
    onClose: () => {
      currentPanel = "none";
      contextNode = null;
      paint();
    },
  });
  paint();
}

// Codex entries the player has opened, for the read-everything achievements.
const codexRead = new Set<string>();
const codexCategoriesDone = new Set<string>();

function openJournal(): void {
  achievements.record("journal.opened");
  currentPanel = "none";
  contextNode = questJournalPanel({
    journal: questJournal,
    pinController: {
      isPinned: (id) => questTracker.isPinned(id),
      toggle: (id) => {
        if (questTracker.isPinned(id)) {
          questTracker.unpin(id);
          refreshQuestTracker();
          return "unpinned";
        }
        const result = questTracker.pin(id, questJournal.get(id)?.status);
        refreshQuestTracker();
        if (result === "pinned") return "pinned";
        if (result === "full") return "full";
        return "unpinned";
      },
    },
    onSearch: () => achievements.record("journal.search_used"),
    onClose: () => {
      currentPanel = "none";
      contextNode = null;
      paint();
    },
  });
  paint();
}

function openCodex(): void {
  achievements.record("codex.opened");
  currentPanel = "none";
  contextNode = codexPanel({
    onEntryRead: (entry) => {
      achievements.record("codex.entry_read", { category: entry.category });
      codexRead.add(entry.id);
      for (const cat of CODEX_CATEGORIES) {
        if (codexCategoriesDone.has(cat)) continue;
        const ids = ALL_CODEX_ENTRIES.filter((e) => e.category === cat).map((e) => e.id);
        if (ids.length > 0 && ids.every((id) => codexRead.has(id))) {
          codexCategoriesDone.add(cat);
          achievements.record("codex.category_done");
        }
      }
    },
    onSearch: () => achievements.record("codex.search_used"),
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
  // Quest tracker distances are live: recompute from the fresh snapshot.
  refreshQuestTracker();
  // Caravan books settle weekly off the live snapshot (tasks 102/103).
  // advance() is idempotent: it only books full weeks not yet settled.
  routeRegistry.advance(snapshot.day, {
    priceAt: caravanPriceAt,
    guardWagePerDay: caravanGuardWage(),
  });
  routesHandle?.refresh();
}

} // end non-city-demo branch
