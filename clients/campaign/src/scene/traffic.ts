/**
 * Road traffic for the city demo (Pax brief #6: city visuals).
 *
 * Spawns N low-poly procedural cars that drive the street network, in the
 * same style as `pedestrians.ts`: streets are raw `city.streets` entries,
 * `projection` converts lat/lon to world XZ, and a per-frame observer
 * advances every car. All geometry is procedural (no GLB, no async load),
 * so this is synchronous and never fails the demo if assets are missing.
 *
 * Cars keep right with a lane offset, run 8–15 m/s with per-car variance,
 * and pick a new random street at the end of each segment run. There is no
 * car-to-car collision — speeds vary enough that platoons break up, and
 * true traffic simulation is follow-up work, not this prototype.
 */

import {
  Color3,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
} from "@babylonjs/core";

interface StreetPoint {
  x: number;
  z: number;
}

interface Street {
  pts: StreetPoint[];
}

/** Minimal surface the mover needs — real TransformNode in the demo, a fake in tests. */
export interface CarRoot {
  position: { x: number; y: number; z: number };
  rotation: { y: number };
}

export interface TrafficCar {
  root: CarRoot;
  street: Street;
  segIndex: number;
  segT: number;
  speed: number;
  laneOffset: number;
}

export interface TrafficOptions {
  /** Cars to spawn. Default 16. */
  count?: number;
  /** Min cruise speed m/s. Default 8. */
  minSpeed?: number;
  /** Max cruise speed m/s. Default 15. */
  maxSpeed?: number;
  /** Right-lane offset from the street centre line, metres. Default 1.8. */
  laneOffset?: number;
}

export interface TrafficHandle {
  cars: TrafficCar[];
  dispose(): void;
}

// Muted showroom palette — no neon, no primer grey primer.
const CAR_COLORS = [
  new Color3(0.85, 0.85, 0.86), // silver
  new Color3(0.08, 0.08, 0.1), // black
  new Color3(0.92, 0.92, 0.92), // white
  new Color3(0.45, 0.47, 0.5), // grey
  new Color3(0.55, 0.08, 0.08), // red
  new Color3(0.1, 0.18, 0.38), // blue
  new Color3(0.12, 0.28, 0.16), // green
  new Color3(0.5, 0.38, 0.2), // tan
];

/**
 * Advance one car along its street by `distance` metres. Pure math over the
 * polyline — no scene access, so tests drive it with a fake root.
 *
 * Returns true when the car ran off the end of the street (caller reassigns
 * it to a new street).
 */
export function advanceCar(car: TrafficCar, distance: number): boolean {
  const pts = car.street.pts;
  let remaining = distance;
  while (remaining > 0) {
    const a = pts[car.segIndex]!;
    const b = pts[car.segIndex + 1]!;
    const segLen = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const leftOnSeg = (1 - car.segT) * segLen;
    if (remaining < leftOnSeg) {
      car.segT += remaining / segLen;
      remaining = 0;
    } else {
      remaining -= leftOnSeg;
      car.segIndex++;
      car.segT = 0;
      if (car.segIndex >= pts.length - 1) return true;
    }
  }
  placeOnStreet(car);
  return false;
}

/** Position the root on its segment with the lane offset, facing travel direction. */
export function placeOnStreet(car: TrafficCar): void {
  const pts = car.street.pts;
  const a = pts[car.segIndex]!;
  const b = pts[car.segIndex + 1]!;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  // Right-hand lane: perpendicular (-dz, dx) / len, scaled by laneOffset.
  const ox = (-dz / len) * car.laneOffset;
  const oz = (dx / len) * car.laneOffset;
  car.root.position.x = a.x + dx * car.segT + ox;
  car.root.position.z = a.z + dz * car.segT + oz;
  if (dx !== 0 || dz !== 0) {
    car.root.rotation.y = Math.atan2(dx, dz);
  }
}

/** Build one low-poly car under a new root. ~200 tris. */
function createCar(scene: Scene, name: string, color: Color3): TransformNode {
  const root = new TransformNode(name, scene);

  const paint = new StandardMaterial(`${name}_paint`, scene);
  paint.diffuseColor = color;
  paint.specularColor = new Color3(0.25, 0.25, 0.25);

  const glass = new StandardMaterial(`${name}_glass`, scene);
  glass.diffuseColor = new Color3(0.08, 0.1, 0.14);
  glass.specularColor = new Color3(0.6, 0.6, 0.6);

  const rubber = new StandardMaterial(`${name}_rubber`, scene);
  rubber.diffuseColor = new Color3(0.05, 0.05, 0.05);

  // Body: 4.4 long, 1.9 wide, sits with base at y ~0.3.
  const body = MeshBuilder.CreateBox(`${name}_body`, { width: 1.9, height: 0.85, depth: 4.4 }, scene);
  body.position.y = 0.75;
  body.material = paint;
  body.parent = root;

  // Cabin: shorter, glasshouse.
  const cabin = MeshBuilder.CreateBox(`${name}_cabin`, { width: 1.65, height: 0.62, depth: 2.2 }, scene);
  cabin.position.set(0, 1.45, -0.25);
  cabin.material = glass;
  cabin.parent = root;

  // Wheels: 4 cylinders, axle along X.
  const wheelOpts = { diameter: 0.68, height: 0.5, tessellation: 10 };
  const wheelPos: Array<[number, number]> = [
    [-0.95, 1.45],
    [0.95, 1.45],
    [-0.95, -1.45],
    [0.95, -1.45],
  ];
  for (const [wx, wz] of wheelPos) {
    const wheel = MeshBuilder.CreateCylinder(`${name}_wheel`, wheelOpts, scene);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.34, wz);
    wheel.material = rubber;
    wheel.parent = root;
  }
  return root;
}

/**
 * Spawn traffic on the street network. Synchronous — geometry is procedural.
 * Returns a handle whose `dispose()` removes every car and the observer.
 */
export function spawnTraffic(
  scene: Scene,
  streets: { coords: [number, number][] }[],
  toWorld: (lat: number, lon: number) => { x: number; z: number },
  options: TrafficOptions = {},
): TrafficHandle {
  const count = options.count ?? 16;
  const minSpeed = options.minSpeed ?? 8;
  const maxSpeed = options.maxSpeed ?? 15;
  const laneOffset = options.laneOffset ?? 1.8;

  const usable: Street[] = [];
  for (const st of streets) {
    if (st.coords.length < 2) continue;
    usable.push({ pts: st.coords.map(([lon, lat]) => {
      const w = toWorld(lat, lon);
      return { x: w.x, z: w.z };
    }) });
  }

  const cars: TrafficCar[] = [];
  const roots: TransformNode[] = [];
  if (usable.length > 0) {
    for (let i = 0; i < count; i++) {
      const color = CAR_COLORS[i % CAR_COLORS.length]!;
      const root = createCar(scene, `traffic_car_${i}`, color);
      roots.push(root);
      const street = usable[Math.floor(Math.random() * usable.length)]!;
      const car: TrafficCar = {
        root,
        street,
        segIndex: Math.floor(Math.random() * (street.pts.length - 1)),
        segT: Math.random(),
        speed: minSpeed + Math.random() * (maxSpeed - minSpeed),
        laneOffset,
      };
      placeOnStreet(car);
      cars.push(car);
    }
  }

  let last = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    for (const car of cars) {
      if (advanceCar(car, car.speed * dt)) {
        // End of street: join a new one, keep the lane offset.
        car.street = usable[Math.floor(Math.random() * usable.length)]!;
        car.segIndex = 0;
        car.segT = 0;
        placeOnStreet(car);
      }
    }
  });

  console.log(`[traffic] ${cars.length} cars`);

  return {
    cars,
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      for (const root of roots) root.dispose();
      cars.length = 0;
    },
  };
}
