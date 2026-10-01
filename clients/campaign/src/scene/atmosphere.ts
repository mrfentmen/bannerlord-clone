/**
 * The day/night cycle and weather system, shared by the campaign map and battle
 * scenes. MASTER_PLAN.md section 4B (tasks 138-141).
 *
 * It drives whatever lights the host scene already has (a directional key and a
 * hemispheric fill, found by name or by type, created when missing), so neither
 * CampaignScene nor BattleScene had to be touched. The caller owns the sim
 * connection: it feeds `hour`, `weather`, the party position, and the settlement
 * list through `update()` on campaign ticks, and calls `tick()` per frame for the
 * weather blend and particle fall. The module owns no fetch and no map.
 *
 * Scale: 1 unit = 1 metre, same as both scenes (ART_DIRECTION.md section 7).
 */

import {
  Color3,
  DirectionalLight,
  HemisphericLight,
  InstancedMesh,
  Mesh,
  MeshBuilder,
  PointLight,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import { accent, mapColor } from "../design/tokens.js";

/** Weather states the sim can report. */
export type WeatherState = "clear" | "rain" | "snow" | "fog";

/** One settlement the night lights should glow over, in world metres. */
export interface NightSettlement {
  x: number;
  z: number;
  /** Ground height at the settlement, so the glow sits on the roofs. */
  y: number;
}

/** Everything the atmosphere needs from one sim tick. */
export interface AtmosphereState {
  /** Hour of day, 0-24. One full in-game 24h is one full sun cycle. */
  hour: number;
  weather: WeatherState;
  /** Party position in world metres, for the torch glow and spotting ring. */
  partyX: number;
  partyZ: number;
  /** Ground height under the party, for placing the torch glow. */
  partyGroundY: number;
  /** Base spotting range in metres, before weather effects. */
  spottingRange: number;
  /** Settlements to light at night. */
  settlements: NightSettlement[];
}

export interface AtmosphereOptions {
  scene: Scene;
  /** Fog density used in clear weather. Defaults to the scene's current value. */
  baseFogDensity?: number;
  /** Cap on settlement point lights, for perf. Defaults to 48. */
  maxSettlementLights?: number;
}

export interface AtmosphereHandle {
  /** Re-aim the sun for an hour of day (task 138). */
  setTimeOfDay(hour: number): void;
  /** Show or hide the night lights; call when the night flag changes (task 139). */
  setNightLightsVisible(visible: boolean): void;
  /** Place/update settlement lights and the party torch glow (task 139). */
  updateNightLights(settlements: NightSettlement[], partyX: number, partyZ: number, partyGroundY: number): void;
  /** Request a weather state. Fog and particles blend within 5s (task 140). */
  setWeather(weather: WeatherState): void;
  /** Advance the weather blend and particle fall; call per frame (task 140). */
  tick(deltaSeconds: number): void;
  /** Move/resize the spotting ring for a weather-adjusted range (task 141). */
  setSpottingRange(metres: number, x: number, z: number, groundY: number): void;
  /** Feed a whole sim tick: sun, weather, night lights, spotting ring. */
  update(state: AtmosphereState): void;
  /** The weather state currently displayed (mid-blend counts as the new one). */
  readonly weather: WeatherState;
  /** The spotting range after weather effects. */
  readonly spottingRange: number;
  /** True once night lights exist in the scene. */
  readonly nightLightsBuilt: boolean;
  /** Number of live weather particle instances. */
  readonly particleCount: number;
  dispose(): void;
}

/** Sun position and colour for an hour of day. Same curve as the battle scene. */
export function sunParams(hour: number): {
  dayFactor: number;
  direction: { x: number; y: number; z: number };
  intensity: number;
  keyColor: [number, number, number];
  fillColor: [number, number, number];
} {
  const t = ((hour % 24) + 24) % 24;
  const dayFactor = Math.max(0, Math.sin(((t - 6) / 12) * Math.PI)); // 1 at noon, 0 at night
  const angle = ((t - 6) / 12) * Math.PI;
  const direction = {
    x: -Math.cos(angle) * 0.6,
    y: -Math.max(0.12, Math.sin(angle)),
    z: 0.32,
  };
  const intensity = 0.08 + dayFactor * 1.1;
  if (dayFactor < 0.15) {
    return {
      dayFactor,
      direction,
      intensity,
      keyColor: [0.35, 0.42, 0.6], // night: cold blue key, dim
      fillColor: [0.12, 0.14, 0.2],
    };
  }
  if (t < 8 || t > 17) {
    return {
      dayFactor,
      direction,
      intensity,
      keyColor: [1.0, 0.75, 0.55], // dawn/dusk: warm low key
      fillColor: hexToRgb(mapColor.sky),
    };
  }
  return {
    dayFactor,
    direction,
    intensity,
    keyColor: [0.95, 0.93, 0.86],
    fillColor: hexToRgb(mapColor.sky),
  };
}

/** Fog target for a weather state, as a multiple of the clear-weather density. */
export function weatherFogTarget(
  weather: WeatherState,
  baseDensity: number,
): { density: number; color: [number, number, number] } {
  switch (weather) {
    case "rain":
      return { density: baseDensity * 6, color: [0.42, 0.47, 0.51] };
    case "snow":
      return { density: baseDensity * 4, color: [0.72, 0.74, 0.75] };
    case "fog":
      return { density: baseDensity * 18, color: [0.66, 0.66, 0.66] };
    case "clear":
    default:
      return { density: baseDensity, color: hexToRgb(mapColor.fog) };
  }
}

/**
 * Spotting range after weather effects. Fog halves the displayed range; other
 * weather leaves it alone (task 141).
 */
export function effectiveSpottingRange(baseMetres: number, weather: WeatherState): number {
  return weather === "fog" ? baseMetres / 2 : baseMetres;
}

/** Night starts when the sun drops below this much of its noon strength. */
export const NIGHT_DAY_FACTOR = 0.15;

/** The weather blend always completes within this many seconds (task 140). */
export const WEATHER_BLEND_SECONDS = 5;

/** Night-light illumination reach in metres; lights read beyond 200m (task 139). */
export const NIGHT_LIGHT_RANGE = 300;

function hexToRgb(hex: string): [number, number, number] {
  const c = Color3.FromHexString(hex);
  return [c.r, c.g, c.b];
}

function findKeyLight(scene: Scene): DirectionalLight {
  const named =
    scene.getLightByName("key") ?? scene.getLightByName("battle-key");
  if (named instanceof DirectionalLight) return named;
  const first = scene.lights.find((l): l is DirectionalLight => l instanceof DirectionalLight);
  if (first) return first;
  const key = new DirectionalLight("atmosphere-key", new Vector3(-0.55, -0.78, 0.32), scene);
  key.intensity = 1.15;
  return key;
}

function findFillLight(scene: Scene): HemisphericLight {
  const named =
    scene.getLightByName("fill") ?? scene.getLightByName("battle-fill");
  if (named instanceof HemisphericLight) return named;
  const first = scene.lights.find((l): l is HemisphericLight => l instanceof HemisphericLight);
  if (first) return first;
  const fill = new HemisphericLight("atmosphere-fill", new Vector3(0.2, 1, -0.1), scene);
  fill.intensity = 0.4;
  return fill;
}

export function createAtmosphere(options: AtmosphereOptions): AtmosphereHandle {
  const { scene } = options;
  const baseFogDensity = options.baseFogDensity ?? scene.fogDensity;
  const maxLights = options.maxSettlementLights ?? 48;

  const key = findKeyLight(scene);
  const fill = findFillLight(scene);

  // -- night lights ---------------------------------------------------------
  // One warm point light per settlement plus an emissive glow sphere, and a
  // torch light + glow on the party. Built lazily on the first night update so
  // a campaign that never goes dark never pays for them.
  let nightRoot: Mesh | null = null;
  let settlementLights: PointLight[] = [];
  let glowTemplate: Mesh | null = null;
  let torchLight: PointLight | null = null;
  let torchGlow: Mesh | null = null;
  let nightVisible = false;

  function buildNightLights(): void {
    if (nightRoot) return;
    nightRoot = new Mesh("night-lights", scene);
    nightRoot.isPickable = false;
    glowTemplate = MeshBuilder.CreateSphere("night-glow-t", { diameter: 6, segments: 8 }, scene);
    const glowMat = new StandardMaterial("night-glow-mat", scene);
    glowMat.emissiveColor = new Color3(1.0, 0.62, 0.28);
    glowMat.disableLighting = true;
    glowMat.backFaceCulling = false;
    glowTemplate.material = glowMat;
    glowTemplate.isVisible = false;
    glowTemplate.isPickable = false;

    torchGlow = MeshBuilder.CreateSphere("torch-glow", { diameter: 3, segments: 8 }, scene);
    torchGlow.material = glowMat;
    torchGlow.isPickable = false;
    torchGlow.parent = nightRoot;
    torchLight = new PointLight("torch-light", new Vector3(0, 0, 0), scene);
    torchLight.diffuse = new Color3(1.0, 0.62, 0.28);
    torchLight.range = NIGHT_LIGHT_RANGE;
    torchLight.intensity = 0;
    torchLight.parent = nightRoot;
  }

  function updateNightLights(
    settlements: NightSettlement[],
    partyX: number,
    partyZ: number,
    partyGroundY: number,
  ): void {
    buildNightLights();
    const root = nightRoot!;
    // Rebuild the settlement lights when the settlement list changes. A handful
    // of point lights is cheap; a hundred is not, so the list is capped.
    const wanted = settlements.slice(0, maxLights);
    if (wanted.length !== settlementLights.length) {
      for (const l of settlementLights) l.dispose();
      settlementLights = [];
      for (let i = 0; i < wanted.length; i += 1) {
        const s = wanted[i]!;
        const light = new PointLight(`night-light-${i}`, new Vector3(s.x, s.y + 12, s.z), scene);
        light.diffuse = new Color3(1.0, 0.62, 0.28);
        light.range = NIGHT_LIGHT_RANGE;
        light.intensity = 0;
        light.parent = root;
        settlementLights.push(light);
        const glow = glowTemplate!.createInstance(`night-glow-${i}`);
        glow.parent = root;
        glow.position.set(s.x, s.y + 8, s.z);
        glow.isPickable = false;
      }
    } else {
      for (let i = 0; i < wanted.length; i += 1) {
        const s = wanted[i]!;
        settlementLights[i]!.position.set(s.x, s.y + 12, s.z);
      }
    }
    torchLight!.position.set(partyX, partyGroundY + 6, partyZ);
    torchGlow!.position.set(partyX, partyGroundY + 4, partyZ);
    setNightLightsVisible(nightVisible);
  }

  function setNightLightsVisible(visible: boolean): void {
    nightVisible = visible;
    if (!nightRoot) return;
    for (const l of settlementLights) l.intensity = visible ? 1.4 : 0;
    if (torchLight) torchLight.intensity = visible ? 1.1 : 0;
    nightRoot.setEnabled(visible);
  }

  // -- weather ----------------------------------------------------------------
  let weather: WeatherState = "clear";
  let fogFrom = baseFogDensity;
  let fogTo = baseFogDensity;
  let blendT = WEATHER_BLEND_SECONDS; // start settled
  let particleRoot: Mesh | null = null;
  let particles: InstancedMesh[] = [];
  let particleFallSpeed = 0;
  let particleSway = 0;
  // The volume the particles fall through, centred on the focus point.
  let volume = { w: 0, h: 0, d: 0, cx: 0, cy: 0, cz: 0 };

  function clearParticles(): void {
    for (const p of particles) p.dispose();
    particles = [];
    if (particleRoot) {
      particleRoot.dispose();
      particleRoot = null;
    }
  }

  function buildParticles(kind: "rain" | "snow", cx: number, cy: number, cz: number): void {
    clearParticles();
    particleRoot = new Mesh("weather-particles", scene);
    particleRoot.isPickable = false;
    const isRain = kind === "rain";
    const count = isRain ? 320 : 240;
    volume = isRain
      ? { w: 420, h: 160, d: 420, cx, cy, cz }
      : { w: 640, h: 130, d: 640, cx, cy, cz };
    particleFallSpeed = isRain ? 65 : 8;
    particleSway = isRain ? 0 : 3.2;
    const template = isRain
      ? MeshBuilder.CreateBox("rain-t", { width: 0.5, height: 9, depth: 0.5 }, scene)
      : MeshBuilder.CreateSphere("snow-t", { diameter: 1.6, segments: 4 }, scene);
    const mat = new StandardMaterial(`weather-${kind}-mat`, scene);
    mat.emissiveColor = isRain ? new Color3(0.55, 0.62, 0.68) : new Color3(0.85, 0.87, 0.9);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    template.material = mat;
    template.isVisible = false;
    template.isPickable = false;
    let seed = 1234567;
    const rand = (): number => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < count; i += 1) {
      const inst = template.createInstance(`weather-${kind}-${i}`);
      inst.parent = particleRoot;
      inst.isPickable = false;
      inst.position.set(
        cx - volume.w / 2 + rand() * volume.w,
        cy - volume.h / 2 + rand() * volume.h,
        cz - volume.d / 2 + rand() * volume.d,
      );
      if (isRain) inst.rotation.x = 0.08;
      particles.push(inst);
    }
  }

  function setWeather(next: WeatherState): void {
    if (next === weather && blendT >= WEATHER_BLEND_SECONDS) return;
    weather = next;
    fogFrom = scene.fogDensity;
    const target = weatherFogTarget(next, baseFogDensity);
    fogTo = target.density;
    blendT = 0;
    const c = target.color;
    scene.fogColor = new Color3(c[0], c[1], c[2]);
    // Particles switch immediately; only the fog blend is gradual.
    if (next === "rain") buildParticles("rain", volume.cx, volume.cy || 60, volume.cz);
    else if (next === "snow") buildParticles("snow", volume.cx, volume.cy || 60, volume.cz);
    else clearParticles();
  }

  function tick(deltaSeconds: number): void {
    // Fog blend: always lands on the target within WEATHER_BLEND_SECONDS.
    if (blendT < WEATHER_BLEND_SECONDS) {
      blendT = Math.min(WEATHER_BLEND_SECONDS, blendT + deltaSeconds);
      const k = blendT / WEATHER_BLEND_SECONDS;
      scene.fogDensity = fogFrom + (fogTo - fogFrom) * k;
    }
    // Particle fall, wrapping to the top of the volume.
    if (particles.length > 0) {
      const dt = Math.min(deltaSeconds, 0.25);
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i]!;
        p.position.y -= particleFallSpeed * dt;
        if (particleSway > 0) {
          p.position.x += Math.sin(p.position.y * 0.05 + i) * particleSway * dt;
        }
        if (p.position.y < volume.cy - volume.h / 2) {
          p.position.y = volume.cy + volume.h / 2;
        }
      }
    }
  }

  // -- spotting ring ----------------------------------------------------------
  // A thin ring on the ground around the party showing the current spotting
  // range. Built as a unit circle and scaled, so resizing is one assignment.
  let ring: Mesh | null = null;
  let currentSpottingRange = 0;
  function buildRing(): Mesh {
    const points: Vector3[] = [];
    const segs = 96;
    for (let i = 0; i <= segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      points.push(new Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    const r = MeshBuilder.CreateLines("spotting-ring", { points }, scene);
    const mat = new StandardMaterial("spotting-ring-mat", scene);
    mat.emissiveColor = Color3.FromHexString(accent.primary);
    mat.disableLighting = true;
    (r as Mesh).material = mat;
    r.isPickable = false;
    return r as Mesh;
  }

  function setSpottingRange(metres: number, x: number, z: number, groundY: number): void {
    currentSpottingRange = metres;
    if (metres <= 0) {
      ring?.setEnabled(false);
      return;
    }
    if (!ring) ring = buildRing();
    ring.setEnabled(true);
    ring.position.set(x, groundY + 2, z);
    ring.scaling.set(metres, 1, metres);
  }

  // -- sun --------------------------------------------------------------------
  function setTimeOfDay(hour: number): void {
    const p = sunParams(hour);
    key.direction = new Vector3(p.direction.x, p.direction.y, p.direction.z);
    key.intensity = p.intensity;
    key.diffuse = new Color3(p.keyColor[0], p.keyColor[1], p.keyColor[2]);
    const fc = p.fillColor;
    fill.diffuse = new Color3(fc[0], fc[1], fc[2]);
  }

  function update(state: AtmosphereState): void {
    setTimeOfDay(state.hour);
    const night = sunParams(state.hour).dayFactor < NIGHT_DAY_FACTOR;
    updateNightLights(state.settlements, state.partyX, state.partyZ, state.partyGroundY);
    setNightLightsVisible(night);
    if (state.weather !== weather) setWeather(state.weather);
    const range = effectiveSpottingRange(state.spottingRange, state.weather);
    setSpottingRange(range, state.partyX, state.partyZ, state.partyGroundY);
  }

  function dispose(): void {
    clearParticles();
    if (nightRoot) {
      nightRoot.dispose();
      nightRoot = null;
    }
    settlementLights = [];
    glowTemplate?.dispose();
    glowTemplate = null;
    ring?.dispose();
    ring = null;
  }

  return {
    setTimeOfDay,
    setNightLightsVisible,
    updateNightLights,
    setWeather,
    tick,
    setSpottingRange,
    update,
    get weather() {
      return weather;
    },
    get spottingRange() {
      return currentSpottingRange;
    },
    get nightLightsBuilt() {
      return nightRoot !== null;
    },
    get particleCount() {
      return particles.length;
    },
    dispose,
  };
}
