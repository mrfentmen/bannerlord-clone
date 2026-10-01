/**
 * City demo: renders real OSM building footprints as 3D blocks.
 *
 * Load with `?city=<slug>` (e.g. `?city=manhattan-sample`). Fetches
 * `/world/cities/<slug>.json`, builds a flat ground plane sized to the bbox,
 * extrudes every building via `buildCityBlocks`, and draws streets as ground
 * ribbons. A close-orbit camera lets you fly through downtown.
 *
 * This is a clearly-labeled demo, not the campaign map — it has no sim, no
 * parties, no HUD. It exists so the boss can SEE real city streets.
 */

import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  VertexData,
} from "@babylonjs/core";
import { buildCityBlocks, type BuildingFootprint } from "./buildings.js";
import { makeProjection } from "../world/load.js";
import type { Heightfield, RegionFile } from "../world/types.js";
import { mapColor, paper, ink } from "../design/tokens.js";

interface CityFile {
  city: string;
  bbox: { minlon: number; minlat: number; maxlon: number; maxlat: number };
  license: string;
  retrieved: string;
  building_count: number;
  street_count: number;
  buildings: BuildingFootprint[];
  streets: { id: number; coords: [number, number][]; name: string; kind: string }[];
}

export async function runCityDemo(canvas: HTMLCanvasElement, slug: string): Promise<void> {
  const res = await fetch(`world/cities/${slug}.json`);
  if (!res.ok) throw new Error(`No city data for "${slug}" (HTTP ${res.status})`);
  const city = (await res.json()) as CityFile;

  // Flat heightfield over the bbox — Manhattan is flat enough for a demo,
  // and the buildings carry the vertical interest.
  const region: RegionFile = {
    name: slug,
    bbox: {
      south: city.bbox.minlat,
      west: city.bbox.minlon,
      north: city.bbox.maxlat,
      east: city.bbox.maxlon,
    },
    elevation: { encoding: "terrarium", formula: "", zoom: 12, tileSize: 256, tiles: [] },
    retrieved: city.retrieved,
  };
  const hf: Heightfield = {
    width: 2,
    height: 2,
    metres: new Float32Array(4),
    resolutionMetres: 30,
    bounds: {
      south: city.bbox.minlat,
      west: city.bbox.minlon,
      north: city.bbox.maxlat,
      east: city.bbox.maxlon,
    },
  };
  const projection = makeProjection(region, hf);

  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true);
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString(`${mapColor.sky}ff`);
  scene.ambientColor = new Color3(0.32, 0.33, 0.32);

  // Close-orbit camera: start above downtown looking down at an angle.
  const cx = projection.width / 2;
  const cz = projection.depth / 2;
  const camera = new ArcRotateCamera(
    "city-camera",
    -Math.PI / 2.4,
    0.9,
    Math.max(projection.width, projection.depth) * 0.8,
    new Vector3(cx, 60, cz),
    scene,
  );
  camera.lowerRadiusLimit = 50;
  camera.upperRadiusLimit = Math.max(projection.width, projection.depth) * 2;
  camera.upperBetaLimit = 1.52;
  camera.lowerBetaLimit = 0.15;
  camera.wheelDeltaPercentage = 0.02;
  camera.panningSensibility = 30;
  camera.inertia = 0.85;
  camera.minZ = 2;
  camera.maxZ = 50_000;
  camera.attachControl(canvas, true);

  const key = new DirectionalLight("key", new Vector3(-0.55, -0.78, 0.32), scene);
  key.intensity = 1.2;
  key.diffuse = new Color3(0.96, 0.94, 0.88);
  const fill = new HemisphericLight("fill", new Vector3(0.2, 1, -0.1), scene);
  fill.intensity = 0.45;
  fill.diffuse = Color3.FromHexString(mapColor.sky);
  fill.groundColor = new Color3(0.25, 0.24, 0.22);

  // Ground: dark asphalt plane so streets and buildings read against it.
  const ground = MeshBuilder.CreateGround(
    "city-ground",
    { width: projection.width, height: projection.depth },
    scene,
  );
  ground.position.set(cx, -0.5, cz);
  const groundMat = new StandardMaterial("city-ground-mat", scene);
  groundMat.diffuseColor = new Color3(0.16, 0.16, 0.17);
  groundMat.specularColor = new Color3(0, 0, 0);
  ground.material = groundMat;

  // Streets as thin dark-grey ribbons slightly above the ground.
  buildStreets(scene, city.streets, projection);

  // The buildings: one merged mesh, one draw call.
  const blocks = buildCityBlocks(scene, slug, city.buildings, projection, 1);
  const buildingCount = blocks?.metadata?.buildingCount ?? 0;
  const peakHeight = blocks?.metadata?.peakHeight ?? 0;

  // Demo label overlay.
  const label = document.createElement("div");
  label.style.cssText =
    `position:fixed;top:12px;left:12px;z-index:10;background:rgba(23,20,15,.85);color:${paper[0]};` +
    "font:12px/1.5 system-ui,sans-serif;padding:10px 14px;border-radius:8px;max-width:340px;" +
    `border:1px solid ${ink[500]}`;
  const cities: [string, string][] = [
    ["manhattan-sample", "NYC Manhattan"],
    ["la-downtown", "LA Downtown"],
    ["houston-downtown", "Houston Downtown"],
    ["miami-downtown", "Miami Downtown"],
  ];
  const links = cities
    .map(([s, name]) =>
      s === slug
        ? `<strong>${escapeHtml(name)}</strong>`
        : `<a href="?city=${s}" style="color:${paper[0]}">${escapeHtml(name)}</a>`,
    )
    .join(" · ");
  label.innerHTML =
    `<strong>CITY DEMO — ${escapeHtml(city.city)}</strong><br>` +
    `${buildingCount.toLocaleString()} buildings · ${city.street_count.toLocaleString()} streets<br>` +
    `Tallest: ${Math.round(peakHeight)} m · Data: OpenStreetMap (ODbL)<br>` +
    `<span style="opacity:.65">Drag to orbit · wheel to zoom · right-drag to pan</span><br>` +
    `<a href="./" style="color:${paper[0]};font-weight:bold">← Back to Campaign Map</a> · ` +
    `<span style="opacity:.85">${links}</span>`;
  document.body.appendChild(label);

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Streets as flat ribbons on the ground, width by road kind. */
function buildStreets(
  scene: Scene,
  streets: CityFile["streets"],
  projection: { toWorld: (lat: number, lon: number) => { x: number; z: number } },
): void {
  const widths: Record<string, number> = { primary: 10, secondary: 7, tertiary: 5 };
  const positions: number[] = [];
  const indices: number[] = [];
  let base = 0;

  for (const st of streets) {
    const w = (widths[st.kind] ?? 4) / 2;
    const pts = st.coords.map(([lon, lat]) => projection.toWorld(lat, lon));
    if (pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * w;
      const nz = (dx / len) * w;
      positions.push(a.x - nx, 0.4, a.z - nz, a.x + nx, 0.4, a.z + nz, b.x - nx, 0.4, b.z - nz, b.x + nx, 0.4, b.z + nz);
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      base += 4;
    }
  }
  if (base === 0) return;

  const mesh = new Mesh("city-streets", scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.applyToMesh(mesh, false);
  const mat = new StandardMaterial("city-streets-mat", scene);
  mat.diffuseColor = new Color3(0.32, 0.32, 0.33);
  mat.specularColor = new Color3(0, 0, 0);
  mat.backFaceCulling = false;
  mesh.material = mat;
}
