/**
 * The unit loading pipeline, with no GPU and no assets.
 *
 * Two things are worth testing here and they are not the geometry. The first is the
 * contract: whatever a factory is, `create(appearance)` hands back a `TransformNode`
 * with the metadata the scene reads, so swapping the procedural factory for the GLB one
 * cannot change what a caller knows. The second is the fallback: a manifest with nothing
 * in it, a fetch that fails and an empty model must all end in a usable unit, because a
 * campaign map with no units on it is worse than a campaign map with plain ones.
 *
 * The scene objects are a `NullEngine` `Scene`, which is the same harness
 * `src/scene/__tests__/partyPin.test.ts` uses: real Babylon nodes, no WebGL context,
 * nothing to stub. `SceneLoader` is spied on so the loader path is exercised without a
 * network or a decoder, and the one test that uses the real default loader asserts it
 * refuses rather than silently pretending.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";
import { Scene } from "@babylonjs/core/scene.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { GlbUnitFactory, EMPTY_UNIT_MANIFEST, hasGlbLoader, resolveUrl, type GlbLoader, type UnitManifest } from "./glb.js";
import {
  ProceduralUnitFactory,
  meshVertexColor,
  unitSilhouette,
  type UnitSilhouette,
} from "./procedural.js";
import {
  DEFAULT_UNIT_SCALE,
  MAX_UNIT_SCALE,
  UNIT_KINDS,
  normalizeAppearance,
  readUnitMetadata,
  slotForName,
  unitPalettes,
  type UnitAppearance,
  type UnitFactory,
  type UnitKind,
} from "./types.js";

const TEAM_COLOUR = unitPalettes.player.primary;
const OTHER_TEAM_COLOUR = unitPalettes.hostile.primary;

function newScene(): Scene {
  return new Scene(
    new NullEngine({
      renderWidth: 64,
      renderHeight: 64,
      deterministicLockstep: false,
      textureSize: 64,
      lockstepMaxSteps: 4,
    }),
  );
}

function appearance(kind: UnitKind, overrides: Partial<UnitAppearance> = {}): UnitAppearance {
  return { kind, palette: unitPalettes.player, scale: 1, ...overrides };
}

/** Close enough for two colours parsed from the same six hex digits. */
function expectColour(actual: Color3, hex: string): void {
  const want = Color3.FromHexString(hex);
  expect(actual.r).toBeCloseTo(want.r, 5);
  expect(actual.g).toBeCloseTo(want.g, 5);
  expect(actual.b).toBeCloseTo(want.b, 5);
}

/** The first vertex colour written onto the named part of a unit. */
function partColour(node: TransformNode, part: string): readonly number[] {
  const mesh = node.getChildren().find((child) => child.name.endsWith(`-${part}`));
  expect(mesh, `${node.name} has no part called ${part}`).toBeDefined();
  return meshVertexColor(mesh as Mesh);
}

describe("the unit factory contract", () => {
  it("is satisfied by both factories, and takes a scene rather than one per call", () => {
    // The compile-time half of this is the `implements UnitFactory` on both classes.
    // The runtime half catches a factory that is structurally right but not actually
    // constructible from a scene, which is the only way these two can drift apart.
    const scene = newScene();
    const factories: UnitFactory[] = [
      new ProceduralUnitFactory({ scene }),
      new GlbUnitFactory({ scene, manifest: EMPTY_UNIT_MANIFEST }),
    ];
    for (const factory of factories) {
      expect(typeof factory.create).toBe("function");
      expect(factory.create.length).toBe(1);
    }
  });

  it("returns a promise for a transform node, for every kind, from either factory", async () => {
    const scene = newScene();
    const procedural = new ProceduralUnitFactory({ scene });
    const glb = new GlbUnitFactory({ scene, manifest: EMPTY_UNIT_MANIFEST });

    for (const kind of UNIT_KINDS) {
      for (const factory of [procedural, glb]) {
        const pending = factory.create(appearance(kind));
        expect(pending).toBeInstanceOf(Promise);
        const node = await pending;
        expect(node).toBeInstanceOf(TransformNode);
        expect(node.isDisposed()).toBe(false);
      }
    }
  });

  it("records the same metadata shape whichever factory made the unit", async () => {
    // This is what makes the swap invisible to the scene: it reads kind, source, palette
    // and scale off the node and has no other way in.
    const scene = newScene();
    const node = await new ProceduralUnitFactory({ scene }).create(appearance("infantry"));
    const metadata = readUnitMetadata(node);
    expect(metadata).not.toBeNull();
    expect(metadata?.unitKind).toBe("infantry");
    expect(metadata?.source).toBe("procedural");
    expect(metadata?.url).toBeNull();
    expect(metadata?.appearance.palette.primary).toBe(TEAM_COLOUR);
    expect(metadata?.appearance.scale).toBe(1);
  });

  it("returns a distinct node per call, so a caller can move each one", async () => {
    const scene = newScene();
    const factory = new ProceduralUnitFactory({ scene });
    const first = await factory.create(appearance("infantry"));
    const second = await factory.create(appearance("infantry"));
    expect(first).not.toBe(second);
    expect(first.name).not.toBe(second.name);
    first.dispose();
    expect(second.isDisposed()).toBe(false);
  });

  it("returns null metadata for a node that is not a unit", () => {
    // A caller holding an arbitrary node must be able to ask without crashing.
    expect(readUnitMetadata(new TransformNode("terrain", newScene()))).toBeNull();
  });

  it("gives each kind a silhouette that reads as that kind at map scale", () => {
    const silhouettes = UNIT_KINDS.map((kind) => unitSilhouette(kind));
    // A vehicle is the widest thing on the map and a foot patrol the tallest to the
    // shoulder: the four kinds are distinguished by proportion first.
    const widths = new Map(silhouettes.map((s) => [s.kind, footprint(s)]));
    expect(widths.get("vehicle")).toBeGreaterThan(widths.get("cavalry")!);
    expect(widths.get("cavalry")).toBeGreaterThan(widths.get("infantry")!);
    // A vehicle carries the tallest mast, which is the party marker the player looks for.
    expect(unitSilhouette("vehicle").height).toBeGreaterThan(unitSilhouette("infantry").height);
    // Every kind is carried at map scale by a mast and a pennant.
    for (const silhouette of silhouettes) expect(silhouette.banner).toBe(true);
  });

  it("keeps the silhouettes pure: same kind in, same numbers out, no scene involved", () => {
    const a: UnitSilhouette = unitSilhouette("cavalry");
    const b: UnitSilhouette = unitSilhouette("cavalry");
    expect(a.parts.map((p) => p.name)).toEqual(b.parts.map((p) => p.name));
    expect(a.height).toBe(b.height);
    // Every part declares its size and its palette slot, which is what lets the test
    // above run without an engine and what lets a manifest override the colours later.
    for (const part of a.parts) {
      expect(part.size.length).toBe(3);
      expect(part.offset.length).toBe(3);
      expect(["primary", "secondary", "accent", "metal"]).toContain(part.slot);
    }
  });
});

describe("the procedural factory", () => {
  it("parents every part under one root node", async () => {
    const scene = newScene();
    const factory = new ProceduralUnitFactory({ scene });
    const silhouette = unitSilhouette("vehicle");
    const node = await factory.create(appearance("vehicle"));
    expect(node.getChildren().length).toBe(silhouette.parts.length);
    for (const child of node.getChildren()) {
      expect(child.parent).toBe(node);
      // Same rule as the roads and rails in `CampaignScene.ts`: a click should find the
      // town under a unit, never the unit itself.
      expect((child as Mesh).isPickable).toBe(false);
      // Hard normals, `ART_DIRECTION.md` section 8.
      expect((child as Mesh).isVerticesDataPresent("normal")).toBe(true);
    }
  });

  it("shares one material across units and colours them with vertex data", async () => {
    // `SPEC.md` section 5.1 wants 300 units at 60 fps. A material per unit is a draw
    // call each; vertex colours on a shared material is the technique the Quaternius
    // rigs in `agents/asset-packs/characters.md` are built for, since they ship with no
    // textures at all.
    const scene = newScene();
    const factory = new ProceduralUnitFactory({ scene });
    const first = await factory.create(appearance("infantry"));
    const second = await factory.create(appearance("infantry"));
    const material = (first.getChildren()[0] as Mesh | undefined)?.material;
    expect(material).toBe(factory.material);
    expect((second.getChildren()[0] as Mesh | undefined)?.material).toBe(material);
    expect((first.getChildren()[0] as Mesh).useVertexColors).toBe(true);
  });

  it("puts the unit's own team colour on it", async () => {
    const scene = newScene();
    const node = await new ProceduralUnitFactory({ scene }).create(appearance("infantry"));

    const torso = partColour(node, "torso");
    const want = Color3.FromHexString(TEAM_COLOUR);
    expect(torso[0]).toBeCloseTo(want.r, 5);
    expect(torso[1]).toBeCloseTo(want.g, 5);
    expect(torso[2]).toBeCloseTo(want.b, 5);

    // The legs and the head are the shadow tone, the pennant is the contrast note, and
    // nothing is the artist's own colour.
    const legs = partColour(node, "legs");
    const secondary = Color3.FromHexString(unitPalettes.player.secondary);
    expect(legs[0]).toBeCloseTo(secondary.r, 5);
    const pennant = partColour(node, "pennant");
    const accent = Color3.FromHexString(unitPalettes.player.accent);
    expect(pennant[1]).toBeCloseTo(accent.g, 5);
  });

  it("applies the caller's palette rather than a hardcoded team", async () => {
    const scene = newScene();
    const factory = new ProceduralUnitFactory({ scene });
    const player = await factory.create(appearance("infantry"));
    const hostile = await factory.create(appearance("infantry", { palette: unitPalettes.hostile }));

    const a = partColour(player, "torso");
    const b = partColour(hostile, "torso");
    expect(a[0]).toBeCloseTo(Color3.FromHexString(TEAM_COLOUR).r, 5);
    expect(b[0]).toBeCloseTo(Color3.FromHexString(OTHER_TEAM_COLOUR).r, 5);
    // Different teams must not be the same colour, which is the entire point.
    expect(a).not.toEqual(b);
  });

  it("scales the whole unit from one number, without rebuilding it", async () => {
    const scene = newScene();
    const factory = new ProceduralUnitFactory({ scene });
    const node = await factory.create(appearance("cavalry", { scale: 2.5 }));
    expect(node.scaling.x).toBeCloseTo(2.5, 6);
    expect(node.scaling.y).toBeCloseTo(2.5, 6);
    expect(node.scaling.z).toBeCloseTo(2.5, 6);
  });

  it("replaces an unusable appearance with locked tokens and reports every repair", async () => {
    // `CONSTITUTION.md` section 1.3: an untrusted input is handled and reported, not
    // trusted and not crashed on. A save file is exactly this input.
    const scene = newScene();
    const seen: string[] = [];
    const factory = new ProceduralUnitFactory({ scene, onIssue: (issue) => seen.push(issue.field) });
    const node = await factory.create({
      kind: "warship",
      palette: { primary: "rebecca-purple", secondary: "#12345" },
      scale: -4,
    } as unknown as UnitAppearance);

    const metadata = readUnitMetadata(node);
    expect(metadata?.unitKind).toBe("infantry");
    expect(metadata?.appearance.scale).toBe(DEFAULT_UNIT_SCALE);
    // A malformed colour comes back as a token, never as a colour nobody chose.
    expect(metadata?.appearance.palette.primary).toBe(unitPalettes.civilian.primary);
    expect(seen.sort()).toEqual(["kind", "palette", "palette", "scale"]);
  });

  it("clamps an absurd scale rather than trusting the number", () => {
    const huge = normalizeAppearance({ kind: "infantry", scale: 1e9 });
    expect(huge.appearance.scale).toBe(MAX_UNIT_SCALE);
    const zero = normalizeAppearance({ kind: "infantry", scale: 0 });
    expect(zero.appearance.scale).toBe(DEFAULT_UNIT_SCALE);
    const negative = normalizeAppearance({ kind: "infantry", scale: -1 });
    expect(negative.appearance.scale).toBe(DEFAULT_UNIT_SCALE);
  });
});

describe("the GLB factory falls back to procedural units", () => {
  it("draws every kind procedurally from an empty manifest, and never asks the network", async () => {
    // The manifest as shipped has no URLs in it, so this is the path production takes
    // today. `SceneLoader.ImportMeshAsync` is spied on rather than mocked at module
    // level, so a real call from anywhere in this file would be caught.
    const scene = newScene();
    const spy = vi.spyOn(SceneLoader, "ImportMeshAsync");
    const reports: string[] = [];
    const factory = new GlbUnitFactory({
      scene,
      manifest: EMPTY_UNIT_MANIFEST,
      onFallback: (report) => reports.push(report.reason),
    });

    for (const kind of UNIT_KINDS) {
      const node = await factory.create(appearance(kind));
      const metadata = readUnitMetadata(node);
      expect(metadata?.source).toBe("procedural");
      expect(metadata?.unitKind).toBe(kind);
      expect(metadata?.url).toBeNull();
      // A placeholder has to be a real unit, not a marker that something is missing.
      expect(node.getChildren().length).toBe(unitSilhouette(kind).parts.length);
      expect(node.scaling.x).toBeCloseTo(1, 6);
    }

    expect(spy).not.toHaveBeenCalled();
    expect(reports).toEqual(["no-manifest-entry", "no-manifest-entry", "no-manifest-entry", "no-manifest-entry"]);
    expect(factory.lastFallback?.reason).toBe("no-manifest-entry");
    spy.mockRestore();
  });

  it("falls back when the fetch fails, and names the URL that failed", async () => {
    const scene = newScene();
    const reports: { reason: string; url: string | null }[] = [];
    const failing: GlbLoader = async () => {
      throw new Error("HTTP 404");
    };
    const factory = new GlbUnitFactory({
      scene,
      manifest: { version: 1, baseUrl: "/assets/units/", units: { infantry: "swat.glb" } },
      loadMeshes: failing,
      onFallback: (report) => reports.push({ reason: report.reason, url: report.url }),
    });

    const node = await factory.create(appearance("infantry"));
    expect(readUnitMetadata(node)?.source).toBe("procedural");
    expect(reports).toHaveLength(1);
    expect(reports[0]?.reason).toBe("load-failed");
    expect(reports[0]?.url).toBe("/assets/units/swat.glb");
    expect(factory.lastFallback?.message).toContain("404");
  });

  it("falls back when a model loads but carries no mesh", async () => {
    const scene = newScene();
    const empty: GlbLoader = async () => [];
    const factory = new GlbUnitFactory({
      scene,
      manifest: { version: 1, units: { vehicle: "truck.glb" } },
      loadMeshes: empty,
    });
    const node = await factory.create(appearance("vehicle"));
    expect(readUnitMetadata(node)?.source).toBe("procedural");
    expect(factory.lastFallback?.reason).toBe("empty-model");
  });

  it("says the truth when this build cannot decode a GLB at all", async () => {
    // `@babylonjs/core` v8 ships without the glTF plugin, so this is the real state of
    // the repo today. The factory must say so rather than failing inside the loader with
    // a message about a missing file, which would send someone hunting for a 404 that
    // does not exist. See `CONSTITUTION.md` section 4.2 on adding the dependency.
    expect(hasGlbLoader()).toBe(false);
    const factory = new GlbUnitFactory({
      scene: newScene(),
      manifest: { version: 1, units: { infantry: "./assets/units/swat.glb" } },
    });
    const node = await factory.create(appearance("infantry"));
    expect(readUnitMetadata(node)?.source).toBe("procedural");
    expect(factory.lastFallback?.reason).toBe("load-failed");
    expect(factory.lastFallback?.message).toContain("glTF loader");
  });

  it("retries a failed load rather than caching the failure for the session", async () => {
    const scene = newScene();
    let attempts = 0;
    const flaky: GlbLoader = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("connection reset");
      return [stubModel(scene)];
    };
    const factory = new GlbUnitFactory({
      scene,
      manifest: { version: 1, units: { infantry: "swat.glb" } },
      loadMeshes: flaky,
    });

    expect(readUnitMetadata(await factory.create(appearance("infantry")))?.source).toBe("procedural");
    expect(readUnitMetadata(await factory.create(appearance("infantry")))?.source).toBe("glb");
    expect(attempts).toBe(2);
  });

  it("loads each kind once however many units ask for it", async () => {
    // 300 infantry on the map is one fetch, not 300. `SPEC.md` section 5.1.
    const scene = newScene();
    let loads = 0;
    const loader: GlbLoader = async () => {
      loads += 1;
      return [stubModel(scene)];
    };
    const factory = new GlbUnitFactory({
      scene,
      manifest: { version: 1, units: { infantry: "swat.glb" } },
      loadMeshes: loader,
    });

    const units = await Promise.all(UNIT_KINDS.map(() => factory.create(appearance("infantry"))));
    expect(loads).toBe(1);
    const roots = new Set(units.map((u) => u));
    expect(roots.size).toBe(4);
    // Every unit is its own node, not the shared template.
    for (const unit of units) expect(unit.isDisposed()).toBe(false);
  });
});

describe("the GLB factory uses a vendored model when the manifest supplies one", () => {
  it("builds a unit from the loaded model and tints it from the palette", async () => {
    const scene = newScene();
    const loader: GlbLoader = async () => [stubModel(scene)];
    const factory = new GlbUnitFactory({
      scene,
      manifest: { version: 1, units: { infantry: { url: "swat.glb" } } },
      loadMeshes: loader,
    });

    const node = await factory.create(appearance("infantry"));
    const metadata = readUnitMetadata(node);
    expect(metadata?.source).toBe("glb");
    expect(metadata?.url).toBe("swat.glb");
    // The manifest carries the licence trail `ASSETS.md` section 2 asks for, so a unit
    // can say where it came from without the factory hardcoding a pack name.
    expect(node.getChildMeshes(false).length).toBeGreaterThan(0);
    expect(node.scaling.x).toBeCloseTo(1, 6);
  });

  it("re-colours a copy of the model and leaves the shared template alone", async () => {
    // Two parties on the same road are rarely the same colour, so each unit gets its
    // own materials; the geometry stays shared, which is the half that costs memory.
    const scene = newScene();
    const model = stubModel(scene);
    const templateMaterial = model.material as StandardMaterial;
    const factory = new GlbUnitFactory({
      scene,
      manifest: { version: 1, units: { infantry: "swat.glb" } },
      loadMeshes: async () => [model],
    });

    const blue = await factory.create(appearance("infantry", { palette: unitPalettes.player }));
    const red = await factory.create(appearance("infantry", { palette: unitPalettes.hostile }));

    const blueMat = blue.getChildMeshes(false)[0]?.material as StandardMaterial;
    const redMat = red.getChildMeshes(false)[0]?.material as StandardMaterial;
    expect(blueMat).not.toBe(redMat);
    expect(blueMat).not.toBe(templateMaterial);
    // `stubModel` names its material "webbing", which maps to the shadow slot.
    expectColour(blueMat.diffuseColor, unitPalettes.player.secondary);
    expectColour(redMat.diffuseColor, unitPalettes.hostile.secondary);
    // The template is not one of the units and still carries the artist's material.
    expect(model.material).toBe(templateMaterial);
    expect(templateMaterial.name).toBe("webbing");
  });

  it("lands the model on the ground rather than at the artist's origin", async () => {
    // Rigged characters are exported from the hip bone. A unit floating a metre above
    // the road is the single most visible thing this pipeline can get wrong.
    const scene = newScene();
    const hip = CreateBox("swat-body", { width: 1, height: 1, depth: 1 }, scene);
    hip.position.y = 0.93;
    const factory = new GlbUnitFactory({
      scene,
      manifest: { version: 1, units: { infantry: "swat.glb" } },
      loadMeshes: async () => [hip],
    });

    const node = await factory.create(appearance("infantry"));
    const body = node.getChildMeshes(false)[0];
    expect(body).toBeDefined();
    // The box is 1 m tall centred at 0.93, so its lowest point is 0.43 and the shift
    // that puts it on the ground is exactly -0.43.
    expect((body as Mesh).position.y).toBeCloseTo(0.93 - 0.43, 5);
    expect(node.position.y).toBe(0);
  });

  it("lets the manifest override the caller's palette for one file", async () => {
    const scene = newScene();
    const factory = new GlbUnitFactory({
      scene,
      manifest: {
        version: 1,
        units: { infantry: { url: "swat.glb", slots: { primary: "#123456" } } },
      },
      loadMeshes: async () => [stubModel(scene, "body")],
    });
    const node = await factory.create(appearance("infantry", { palette: unitPalettes.player }));
    const material = node.getChildMeshes(false)[0]?.material as StandardMaterial;
    expectColour(material.diffuseColor, "#123456");
  });

  it("folds the manifest scale and the caller's scale into the unit root", async () => {
    const scene = newScene();
    const factory = new GlbUnitFactory({
      scene,
      manifest: { version: 1, units: { vehicle: { url: "truck.glb", scale: 0.25 } } },
      loadMeshes: async () => [stubModel(scene)],
    });
    const node = await factory.create(appearance("vehicle", { scale: 2 }));
    // A GLB's authored scale is whatever the artist exported, so the manifest's
    // multiplier and the caller's are two separate knobs over the same root.
    expect(node.scaling.x).toBeCloseTo(0.5, 6);
  });

  it("resolves a manifest shorthand string as a URL and reports a half-written entry as absent", () => {
    const manifest: UnitManifest = {
      version: 1,
      baseUrl: "assets/units/",
      units: { infantry: "swat.glb", vehicle: { url: "" }, civilian: { url: "farmer.glb" } },
    };
    const factory = new GlbUnitFactory({ scene: newScene(), manifest });
    expect(factory.has("infantry")).toBe(true);
    expect(factory.urlFor("infantry")).toBe("assets/units/swat.glb");
    expect(factory.urlFor("civilian")).toBe("assets/units/farmer.glb");
    // An entry with no URL is a manifest someone started writing, not a request for the
    // current page.
    expect(factory.has("vehicle")).toBe(false);
    expect(factory.has("cavalry")).toBe(false);
    expect(factory.urlFor("cavalry")).toBeNull();
  });

  it("leaves an absolute URL alone when resolving it", () => {
    expect(resolveUrl("https://example.invalid/swat.glb", "assets/units/")).toBe(
      "https://example.invalid/swat.glb",
    );
    expect(resolveUrl("./assets/units/swat.glb", "ignored/")).toBe("./assets/units/swat.glb");
    expect(resolveUrl("swat.glb", "assets/units")).toBe("assets/units/swat.glb");
  });

  it("maps a material name onto a palette slot, and anything else onto the team colour", () => {
    // This is the whole contract with a pack author: name the four materials and the
    // file arrives in team colours. Unnamed is not left alone, because an unannotated
    // rig in the artist's original palette is exactly the collage `ART_DIRECTION.md`
    // section 8 says the art direction exists to prevent.
    expect(slotForName("body")).toBe("primary");
    expect(slotForName("SWAT_Body")).toBe("primary");
    expect(slotForName("webbing")).toBe("secondary");
    expect(slotForName("coat_dark")).toBe("secondary");
    expect(slotForName("weapon_rifle")).toBe("metal");
    expect(slotForName("steel")).toBe("metal");
    expect(slotForName("pennant")).toBe("accent");
    expect(slotForName("hi-vis")).toBe("accent");
    expect(slotForName("mystery")).toBe("primary");
  });
});

describe("the shipped manifest", () => {
  it("names no asset, so nothing can be fetched at runtime today", () => {
    // `CONSTITUTION.md` section 1.1 and `agents/asset-packs/characters.md`: the packs
    // are catalogued, not vendored. The manifest is empty until files exist to point at.
    expect(Object.keys(EMPTY_UNIT_MANIFEST.units)).toHaveLength(0);
    const factory = new GlbUnitFactory({ scene: newScene(), manifest: EMPTY_UNIT_MANIFEST });
    for (const kind of UNIT_KINDS) expect(factory.has(kind)).toBe(false);
  });

  it("matches the example on disk, which is the shape a future pack fills in", () => {
    const onDisk = JSON.parse(
      readFileSync(join(process.cwd(), "src", "scene", "units", "units.manifest.example.json"), "utf8"),
    ) as UnitManifest;
    expect(onDisk.version).toBe(EMPTY_UNIT_MANIFEST.version);
    expect(onDisk.baseUrl).toBe(EMPTY_UNIT_MANIFEST.baseUrl);
    expect(Object.keys(onDisk.units)).toHaveLength(0);
    expect(onDisk.credits ?? []).toHaveLength(0);
  });
});

/** A stand-in for a vendored GLB: one box, hip-height, with a named material. */
function stubModel(scene: Scene, materialName = "webbing"): Mesh {
  const mesh = CreateBox("swat-body", { width: 0.6, height: 1.8, depth: 0.4 }, scene);
  const material = new StandardMaterial(materialName, scene);
  material.diffuseColor = Color3.FromHexString(unitPalettes.civilian.primary);
  material.specularColor = new Color3(0, 0, 0);
  mesh.material = material;
  return mesh;
}

/** Widest part of a silhouette, in metres. */
function footprint(silhouette: UnitSilhouette): number {
  let widest = 0;
  for (const part of silhouette.parts) widest = Math.max(widest, part.size[0]);
  return widest;
}