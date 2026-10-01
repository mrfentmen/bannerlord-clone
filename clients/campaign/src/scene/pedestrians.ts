/**
 * Animated pedestrians for the city demo.
 *
 * Loads the KayKit Rogue GLB once (CC0, see public/anims/KAYKIT-LICENSE.txt)
 * and instantiates N pedestrians that walk the street network. Each
 * pedestrian is an independent clone with its own skeleton, playing
 * Walking_A/B/C while moving and Idle when paused.
 *
 * This is the animation-pipeline prototype: GLB -> AssetContainer ->
 * per-instance skeletons -> animation state machine. The same pattern will
 * drive battle units and street crowds later.
 */

import "@babylonjs/loaders";
import {
  AnimationGroup,
  Scene,
  SceneLoader,
  TransformNode,
} from "@babylonjs/core";

interface StreetPoint {
  x: number;
  z: number;
}

interface Street {
  pts: StreetPoint[];
}

interface Pedestrian {
  root: TransformNode;
  walk: AnimationGroup[];
  idle: AnimationGroup | null;
  street: Street;
  segIndex: number;
  segT: number;
  speed: number;
  pauseTimer: number;
  moving: boolean;
}

const WALK_CLIPS = ["Walking_A", "Walking_B", "Walking_C"];
const IDLE_CLIP = "Idle";
// Metres per second — a relaxed city walking pace.
const WALK_SPEED = 1.4;

/**
 * Spawn animated pedestrians on the street network. Streets are the raw
 * city.streets entries; projection converts lat/lon to world XZ.
 */
export async function spawnPedestrians(
  scene: Scene,
  streets: { coords: [number, number][] }[],
  toWorld: (lat: number, lon: number) => { x: number; z: number },
  count = 24,
): Promise<void> {
  const usable: Street[] = [];
  for (const st of streets) {
    if (st.coords.length < 2) continue;
    const pts = st.coords.map(([lon, lat]) => {
      const w = toWorld(lat, lon);
      return { x: w.x, z: w.z };
    });
    usable.push({ pts });
  }
  if (usable.length === 0) return;

  let container: Awaited<ReturnType<typeof SceneLoader.LoadAssetContainerAsync>>;
  try {
    container = await SceneLoader.LoadAssetContainerAsync(
      "/anims/",
      "kaykit-rogue.glb",
      scene,
    );
  } catch (err) {
    console.warn("[pedestrians] could not load kaykit-rogue.glb:", err);
    return;
  }

  // Remove the template meshes from the scene — we only want instances.
  container.removeAllFromScene();

  const peds: Pedestrian[] = [];
  for (let i = 0; i < count; i++) {
    const inst = container.instantiateModelsToScene((name: string) => `${name}_ped${i}`);
    const root = inst.rootNodes[0] as TransformNode;
    if (!root) continue;
    root.setEnabled(true);

    const walk: AnimationGroup[] = [];
    let idle: AnimationGroup | null = null;
    for (const g of inst.animationGroups) {
      if (WALK_CLIPS.includes(g.name)) walk.push(g);
      else if (g.name === IDLE_CLIP) idle = g;
    }
    if (walk.length === 0) {
      console.warn("[pedestrians] no walk clips found in GLB");
      root.dispose();
      continue;
    }

    const ped: Pedestrian = {
      root,
      walk,
      idle,
      street: usable[Math.floor(Math.random() * usable.length)]!,
      segIndex: 0,
      segT: Math.random(),
      speed: WALK_SPEED * (0.85 + Math.random() * 0.3),
      pauseTimer: 0,
      moving: false, // setMoving(true) below starts the walk clip
    };
    // Start at a random point along the street.
    const s = ped.street.pts;
    ped.segIndex = Math.floor(Math.random() * (s.length - 1));
    placeOnStreet(ped);
    // Each pedestrian gets its own walk variant.
    ped.walk = [walk[i % walk.length]!];
    setMoving(ped, true);
    peds.push(ped);
  }

  if (peds.length === 0) return;

  let last = performance.now();
  scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    for (const ped of peds) updatePedestrian(ped, usable, dt);
  });

  console.log(`[pedestrians] ${peds.length} walking`);
}

function setMoving(ped: Pedestrian, moving: boolean): void {
  if (ped.moving === moving) return;
  ped.moving = moving;
  for (const g of ped.walk) g.stop();
  ped.idle?.stop();
  if (moving) {
    ped.walk[0]!.play(true);
  } else {
    ped.idle?.play(true);
  }
}

function placeOnStreet(ped: Pedestrian): void {
  const pts = ped.street.pts;
  const a = pts[ped.segIndex]!;
  const b = pts[ped.segIndex + 1]!;
  const x = a.x + (b.x - a.x) * ped.segT;
  const z = a.z + (b.z - a.z) * ped.segT;
  ped.root.position.set(x, 0, z);
  // Face along the segment.
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (dx !== 0 || dz !== 0) {
    ped.root.rotation.y = Math.atan2(dx, dz);
  }
}

function updatePedestrian(ped: Pedestrian, usable: Street[], dt: number): void {
  if (!ped.moving) {
    ped.pauseTimer -= dt;
    if (ped.pauseTimer <= 0) setMoving(ped, true);
    return;
  }

  const pts = ped.street.pts;
  const a = pts[ped.segIndex]!;
  const b = pts[ped.segIndex + 1]!;
  const segLen = Math.hypot(b.x - a.x, b.z - a.z) || 1;

  ped.segT += (ped.speed * dt) / segLen;

  if (ped.segT >= 1) {
    ped.segIndex++;
    ped.segT = 0;
    if (ped.segIndex >= pts.length - 1) {
      // End of street: sometimes pause, always pick a new street.
      if (Math.random() < 0.3) {
        setMoving(ped, false);
        ped.pauseTimer = 2 + Math.random() * 4;
      }
      ped.street = usable[Math.floor(Math.random() * usable.length)]!;
      ped.segIndex = 0;
    }
  }
  placeOnStreet(ped);
}
