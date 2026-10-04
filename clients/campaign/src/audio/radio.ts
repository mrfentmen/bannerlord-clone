/**
 * Radio, ported from `milo/tasks-101-200:src/audio/radio.ts` and
 * `milo/world-ai:src/audio/radio.ts` (task 149), and extended to the game it
 * actually is now.
 *
 * The parked module was three stations hard-coded to the tavern and town
 * screens, started and stopped by the panel opening. Three things were wrong
 * with that for a campaign that spans a continent and has a car:
 *
 *   * The stations were not tied to anywhere. You heard the same three stations
 *     in Boston and in the Mojave.
 *   * There was no radio in the car. The party's road time was silent.
 *   * There was no broadcasting. No idents, no news, no commercials, so the
 *     "station" was three loop files and nothing else.
 *
 * What is kept from the parked code: the shape. A station is an id and a name;
 * `start` / `stop` / `next` / `current` / `isPlaying` / `destroy` are the
 * interface; a station that will not load is skipped rather than fatal; and
 * `onStationChange` exists so a UI label can follow the dial. Playback is
 * injected, so a test records calls instead of touching Web Audio.
 *
 * What is new:
 *
 *   - `REGION_STATIONS`, one station per region, matched to the six real beds
 *     that exist (`radio-bed-*` from worker/hana/radio, `radio-station-*` from
 *     worker/local/battlesim-assets). Both sets were on orphan branches and are
 *     ported, byte for byte, with their provenance in
 *     `services/world-data/data/audio-provenance.json`.
 *   - A broadcast. A real radio station is not a loop: it is songs with idents
 *     and news and commercials between them. `tick()` is driven by elapsed
 *     program time and plays the next item in the schedule — the ident at the
 *     top of the hour, a bulletin from the news set, an advert break.
 *   - The car. `startDriving` brings up the engine and the road bed and drops
 *     the radio to a level you can hear over an engine rather than beside it.
 */

import { getAudioManager, type SfxId } from "./AudioManager.js";
import { type AudioPlayer, silentHandle } from "./soundEvents.js";
import { REGION_IDS, REGION_VOICES, type RegionId } from "./regions.js";

/** A station: an id, a name, and the bed it broadcasts. */
export interface RadioStation {
  /** Station id. Also the dial position's key. */
  readonly id: string;
  /** Display name for the radio label. */
  readonly name: string;
  /** Call sign, as a US station would put it on the air. */
  readonly callSign: string;
  /** The bed loop this station broadcasts, a real manifest id. */
  readonly bed: SfxId;
  /** The region whose air this is. Every region has exactly one. */
  readonly region: RegionId;
  /** The bulletin set this station reads from, most newsworthy first. */
  readonly bulletins: readonly SfxId[];
}

/** What kind of thing is being broadcast. Drives the test and the volume. */
export type BroadcastItem =
  | { kind: "song" }
  | { kind: "ident" }
  | { kind: "news"; id: SfxId }
  | { kind: "advert"; id: SfxId };

/**
 * One station per region. The bed of each is chosen for where it plays, and
 * every one is a file that ships:
 *
 *   atlantic   Street Radio     92 BPM boom-bap, the dense east-coast city
 *   great lakes Heartland Rock  126 BPM, farmland to cold water
 *   southern   Corner Talk      talk radio over a lo-fi bed
 *   lone star  Country Lope     96 BPM country, dry scrub and big sky
 *   mountain   High Desert      dark ambient, thin air and long silences
 *   pacific    West Coast Synth 100 BPM night-drive
 */
export const REGION_STATIONS: readonly RadioStation[] = [
  {
    id: "street-radio",
    name: "Street Radio",
    callSign: "WSTR",
    bed: "radio-station-street",
    region: "atlantic_corridor",
    bulletins: ["radio-bulletin-0", "radio-bulletin-3"],
  },
  {
    id: "heartland-rock",
    name: "Heartland Rock",
    callSign: "KHRW",
    bed: "radio-bed-heartland-rock",
    region: "great_lakes_union",
    bulletins: ["radio-bulletin-1", "radio-bulletin-4"],
  },
  {
    id: "corner-talk",
    name: "Corner Talk",
    callSign: "KTAL",
    bed: "radio-station-talk",
    region: "southern_compact",
    bulletins: ["radio-bulletin-2", "radio-bulletin-5"],
  },
  {
    id: "country-lope",
    name: "Country Lope",
    callSign: "KXLP",
    bed: "radio-bed-country-lope",
    region: "lone_star_frontier",
    bulletins: ["radio-bulletin-5", "radio-bulletin-1"],
  },
  {
    id: "high-desert-night",
    name: "High Desert",
    callSign: "KDSN",
    bed: "radio-station-night",
    region: "mountain_alliance",
    bulletins: ["radio-bulletin-3", "radio-bulletin-0"],
  },
  {
    id: "west-coast-synth",
    name: "West Coast Synth",
    callSign: "WSYN",
    bed: "radio-bed-night-synth",
    region: "pacific_compact",
    bulletins: ["radio-bulletin-4", "radio-bulletin-2"],
  },
];

/** The ident every station signs off with. One real file, KHRD. */
export const STATION_IDENT: SfxId = "radio-ident";

/** The sponsor stinger an advert break opens and closes on. */
export const ADVERT_STINGER: SfxId = "sfx-ui-coin";

/** The transition bed between items: a squelch, so the cut is not a hard splice. */
export const TRANSITION: SfxId = "sfx-radio-squelch";

/** The burst between songs on a station that is off-air at the edges. */
export const STATIC_BURST: SfxId = "sfx-radio-static";

/** The station serving a region. */
export function stationForRegion(region: RegionId): RadioStation {
  const found = REGION_STATIONS.find((station) => station.region === region);
  if (!found) throw new Error(`no radio station serves region ${region}`);
  return found;
}

/**
 * How the programme is put together, in seconds. These are the numbers a real
 * small-market station runs to: a song every few minutes, an ident on the hour,
 * a bulletin after it, and an advert break in the middle of the hour. Exported
 * so the schedule can be pinned in a test rather than eyeballed.
 */
export const BROADCAST_SCHEDULE = {
  /** Length of one song before the next item. */
  songSeconds: 165,
  /** Length of a news bulletin. */
  newsSeconds: 22,
  /** Length of an advert break: stinger in, spot, stinger out. */
  advertSeconds: 26,
  /** Length of the ident. */
  identSeconds: 3,
  /** Program time between idents, as a real station signs on the hour. */
  hourSeconds: 1800,
} as const;

/**
 * The next item on air, given how long the station has been playing.
 *
 * This is a function of program time and nothing else — no RNG, no timer in the
 * audio layer — so the same moment always yields the same item and a test can
 * step through an hour. The shape of a station's hour is: ident, song, song,
 * news, song, advert break, song, ident.
 *
 * `nextBulletin` is the index into the station's bulletin set, supplied by the
 * caller so the sequence advances in the order the world state produced.
 */
export function nextBroadcast(
  station: RadioStation,
  elapsedSeconds: number,
  nextBulletin: number,
): BroadcastItem {
  const cycle = elapsedSeconds % BROADCAST_SCHEDULE.hourSeconds;
  const songEnd = BROADCAST_SCHEDULE.identSeconds;
  const newsStart = songEnd + BROADCAST_SCHEDULE.songSeconds;
  const newsEnd = newsStart + BROADCAST_SCHEDULE.newsSeconds;
  const advertStart = newsEnd + BROADCAST_SCHEDULE.songSeconds;
  const advertEnd = advertStart + BROADCAST_SCHEDULE.advertSeconds;

  if (cycle < songEnd) return { kind: "ident" };
  if (cycle < newsStart) return { kind: "song" };
  if (cycle < newsEnd) {
    const set = station.bulletins;
    const bulletin = set[nextBulletin % set.length];
    if (!bulletin) return { kind: "song" };
    return { kind: "news", id: bulletin };
  }
  if (cycle < advertStart) return { kind: "song" };
  if (cycle < advertEnd) return { kind: "advert", id: ADVERT_STINGER };
  return { kind: "song" };
}

/** How long the item just played should hold the station before the next one. */
export function broadcastSeconds(item: BroadcastItem): number {
  switch (item.kind) {
    case "ident":
      return BROADCAST_SCHEDULE.identSeconds;
    case "news":
      return BROADCAST_SCHEDULE.newsSeconds;
    case "advert":
      return BROADCAST_SCHEDULE.advertSeconds;
    case "song":
      return BROADCAST_SCHEDULE.songSeconds;
  }
}

/** The real player: the campaign mixer. Loops get a movable voice. */
export function mixerRadioPlayer(): AudioPlayer {
  return {
    playSound(id, opts) {
      const audio = getAudioManager();
      if (!opts.loop) {
        void audio.playSfx(id, { volume: opts.volume });
        return silentHandle();
      }
      let voice: { setVolume(v: number): void; stop(): void } | null = null;
      let pending = opts.volume;
      void audio.playLoopingSfx(id, { volume: pending, fadeSeconds: 1.2 }).then((started) => {
        if (!started) return;
        voice = started;
        if (pending !== opts.volume) voice.setVolume(pending);
      });
      return {
        setVolume(volume: number): void {
          pending = volume;
          voice?.setVolume(volume);
        },
        stop(): void {
          voice?.stop();
          voice = null;
        },
      };
    },
  };
}

/** Where the radio is in the car. */
export interface RadioCallbacks {
  /** Fired when the playing station changes, for the radio UI label. */
  onStationChange?: (station: RadioStation | null) => void;
  /** Fired when the programme moves to a new item, for a now-playing label. */
  onBroadcast?: (item: BroadcastItem) => void;
}

/** The radio as the rest of the game sees it. */
export interface Radio {
  /** Start playing, defaulting to the station for this region. */
  start(region?: RegionId | string, stationId?: string): void;
  /** Stop playback and release the bed. */
  stop(): void;
  /** The station currently on air, or null when stopped. */
  current(): RadioStation | null;
  /** Move to the next station on the dial, wrapping. No-op when stopped. */
  next(): void;
  /** Whether audio is currently playing. */
  isPlaying(): boolean;
  /**
   * Bring the car up: engine and road bed, and the radio down to a level you can
   * hear over an engine. Returns the engine handle so the caller can stop it.
   */
  startDriving(engine?: SfxId): void;
  /** Take the car away and put the radio back up. */
  stopDriving(): void;
  /** Whether the car is running. */
  isDriving(): boolean;
  /**
   * Advance the programme to this point in the hour, playing whatever is due.
   * `nowSeconds` is elapsed program time, supplied by the caller, so the audio
   * layer owns no timer of its own.
   */
  tick(nowSeconds: number): void;
  /** Release resources. */
  destroy(): void;
}

/** Bed level on the dial, and the lower one it drops to in the car. */
export const RADIO_VOLUME = 0.42;
export const RADIO_VOLUME_IN_CAR = 0.24;
/** Bed level for the road and the engine once the car is up. */
export const ROAD_VOLUME = 0.5;
export const ENGINE_VOLUME = 0.45;

/**
 * Create the radio. `player` is injected so a test records calls; the real
 * client passes {@link mixerRadioPlayer}.
 */
export function createRadio(
  player: AudioPlayer = mixerRadioPlayer(),
  callbacks: RadioCallbacks = {},
): Radio {
  let bed: { setVolume(v: number): void; stop(): void } | null = null;
  let engine: { setVolume(v: number): void; stop(): void } | null = null;
  let road: { setVolume(v: number): void; stop(): void } | null = null;
  let index = -1;
  let destroyed = false;
  let driving = false;
  let elapsed = 0;
  let sinceItem = Number.POSITIVE_INFINITY;
  let nextBulletin = 0;
  let item: BroadcastItem | null = null;

  function station(): RadioStation | null {
    return index >= 0 ? (REGION_STATIONS[index] ?? null) : null;
  }

  function announce(): void {
    callbacks.onStationChange?.(bed ? station() : null);
  }

  function bedVolume(): number {
    return driving ? RADIO_VOLUME_IN_CAR : RADIO_VOLUME;
  }

  /**
   * Bring the bed up, skipping any station whose file will not load. The
   * library carries all six, but a browser that cannot fetch one should hear
   * the next one rather than nothing.
   */
  function tryPlay(offset: number): void {
    if (REGION_STATIONS.length === 0) return;
    for (let attempt = 0; attempt < REGION_STATIONS.length; attempt += 1) {
      const candidate = (index + offset + attempt) % REGION_STATIONS.length;
      const current = REGION_STATIONS[candidate];
      if (!current) continue;
      const started = player.playSound(current.bed, { volume: bedVolume(), loop: true });
      if (!started) continue;
      bed = started;
      index = candidate;
      elapsed = 0;
      sinceItem = Number.POSITIVE_INFINITY;
      announce();
      return;
    }
    bed = null;
    announce();
  }

  return {
    start(region, stationId) {
      if (destroyed || bed) return;
      if (stationId !== undefined) {
        const found = REGION_STATIONS.findIndex((s) => s.id === stationId);
        index = found >= 0 ? found - 1 : -1;
      } else if (region !== undefined && REGION_IDS.includes(region as RegionId)) {
        const wanted = REGION_VOICES[region as RegionId].station;
        const found = REGION_STATIONS.findIndex((s) => s.id === wanted);
        index = found >= 0 ? found - 1 : -1;
      }
      tryPlay(1);
    },
    stop() {
      bed?.stop();
      bed = null;
      engine?.stop();
      engine = null;
      road?.stop();
      road = null;
      driving = false;
      item = null;
      announce();
    },
    current: () => (bed ? station() : null),
    next() {
      if (destroyed || !bed) return;
      bed.stop();
      bed = null;
      tryPlay(1);
    },
    isPlaying: () => bed !== null,
    startDriving(engineId = "sfx-vehicle-engine-cruise") {
      if (destroyed || driving) return;
      driving = true;
      engine = player.playSound(engineId, { volume: ENGINE_VOLUME, loop: true });
      road = player.playSound("sfx-ambience-highway-bed", { volume: ROAD_VOLUME, loop: true });
      bed?.setVolume(bedVolume());
    },
    stopDriving() {
      if (!driving) return;
      driving = false;
      engine?.stop();
      engine = null;
      road?.stop();
      road = null;
      bed?.setVolume(bedVolume());
    },
    isDriving: () => driving,
    tick(nowSeconds) {
      if (destroyed || !bed || !Number.isFinite(nowSeconds)) return;
      const current = station();
      if (!current) return;
      if (nowSeconds < elapsed) {
        // Program time went backwards: the caller reseeded it. Restart the hour.
        elapsed = nowSeconds;
        sinceItem = Number.POSITIVE_INFINITY;
        return;
      }
      elapsed = nowSeconds;
      if (sinceItem < Number.POSITIVE_INFINITY && nowSeconds - sinceItem < broadcastSeconds(item!)) return;
      const next = nextBroadcast(current, nowSeconds, nextBulletin);
      if (next.kind === "news") nextBulletin = (nextBulletin + 1) % current.bulletins.length;
      sinceItem = nowSeconds;
      item = next;
      switch (next.kind) {
        case "song":
          // The bed never stops between songs, so a song boundary is the station
          // signing off and back on: a squelch under a static burst.
          player.playSound(TRANSITION, { volume: 0.35 });
          player.playSound(STATIC_BURST, { volume: 0.18 });
          break;
        case "ident":
          player.playSound(TRANSITION, { volume: 0.3 });
          player.playSound(STATION_IDENT, { volume: 0.55 });
          break;
        case "news":
          player.playSound(STATIC_BURST, { volume: 0.25 });
          player.playSound(next.id, { volume: 0.7 });
          break;
        case "advert":
          player.playSound(next.id, { volume: 0.5 });
          player.playSound(TRANSITION, { volume: 0.3 });
          break;
      }
      callbacks.onBroadcast?.(next);
    },
    destroy() {
      destroyed = true;
      bed?.stop();
      bed = null;
      engine?.stop();
      engine = null;
      road?.stop();
      road = null;
    },
  };
}

let instance: Radio | null = null;
/** The shared radio. */
export function getRadio(): Radio {
  if (!instance) instance = createRadio();
  return instance;
}