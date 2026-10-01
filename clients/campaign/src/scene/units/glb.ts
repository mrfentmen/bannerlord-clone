/**
 * Vendored GLB units, driven by a manifest, degrading to procedural ones.
 *
 * The scene never learns which factory it has. It calls `create(appearance)` and gets
 * a `TransformNode` back; whether that node is a 40-triangle placeholder or a rigged
 * Quaternius character is the factory's business. That is the whole architecture, and
 * it is what makes vendoring the CC0 packs later a manifest edit rather than a change
 * to `CampaignScene.ts`.
 *
 * No asset has been downloaded and none is expected at runtime today. The manifest is
 * empty, so every call takes the procedural path. The load path is real code, not a
 * stub, because the failure modes are the point: a missing entry, a 404, a decode error
 * and a missing loader plugin all end in the same place — a usable unit — and each one
 * reports which it was so the log is worth reading (`CONSTITUTION.md` section 1.3).
 *
 * Character choices are settled in `agents/asset-packs/characters.md`: the Quaternius
 * modular packs and the Universal Animation Library are CC0 and share one
 * `CharacterArmature` rig, and three.js's Soldier/Xbot are MIT. Which of those ships is
 * a manifest decision, so nothing here names a file that does not exist.
 */

import {
  Color3,
  Scene,
  SceneLoader,
  StandardMaterial,
  TransformNode,
  type AbstractMesh,
  type ISceneLoaderAsyncResult,
  type Material,
} from "@babylonjs/core";
import { ProceduralUnitFactory, metadataFor, slotColour } from "./procedural.js";
import {
  clampScale,
  isUnitKind,
  slotForName,
  type UnitAppearance,
  type UnitFactory,
  type UnitKind,
  type UnitPalette,
} from "./types.js";

/**
 * One kind's asset.
 *
 * A bare string is accepted as shorthand for `{ "url": ... }`, because the common case
 * is a single GLB and a manifest full of one-field objects is harder to read than a
 * manifest full of URLs.
 */
export interface UnitManifestEntry {
  /** Where the GLB lives. Relative to `baseUrl` unless it is absolute. */
  readonly url: string;
  /** Node inside the GLB to use as the unit's root. The first mesh when absent. */
  readonly root?: string;
  /** Multiplier on the loaded model. A GLB's own scale is whatever the artist exported. */
  readonly scale?: number;
  /** An `AnimationGroup` name to loop, usually an idle. */
  readonly idleClip?: string;
  /**
   * Slot overrides, so one file can serve several teams and the manifest decides.
   * Keyed by the same four slots as the palette.
   */
  readonly slots?: Partial<UnitPalette>;
}

/**
 * The manifest: `UnitKind` to URL.
 *
 * Deliberately small and hand-editable. It is data, not code, and it is the one thing
 * that changes when a pack lands in `assets/units/`.
 */
export interface UnitManifest {
  readonly version: 1;
  /** Prepended to every relative URL. */
  readonly baseUrl?: string;
  readonly units: {
    readonly [K in UnitKind]?: UnitManifestEntry | string;
  };
  /**
   * Where these files came from, for the credits screen `ASSETS.md` section 2 asks for.
   * Copied onto every unit's metadata.
   */
  readonly credits?: readonly string[];
}

/**
 * The shipped manifest, empty.
 *
 * Every kind falls back to the procedural factory, which is what makes this safe to
 * import from production today: there is no URL in it to fail on. `units.manifest.example.json`
 * on disk is the same object, and the test asserts the two agree.
 */
export const EMPTY_UNIT_MANIFEST: UnitManifest = {
  version: 1,
  baseUrl: "./assets/units/",
  units: {},
};

/**
 * Load one GLB and hand back its meshes.
 *
 * Injected rather than called directly so the glTF plugin registration can be supplied
 * — the plugin ships separately from Babylon core in v8 — and so the tests can exercise
 * every failure mode without a network or a decoder. The default is
 * `SceneLoader.ImportMeshAsync`, which is the Babylon API for exactly this.
 */
export type GlbLoader = (url: string, scene: Scene) => Promise<AbstractMesh[]>;

/** The default loader. */
export const sceneLoaderGlb: GlbLoader = async (url, scene) => {
  const result = (await SceneLoader.ImportMeshAsync(null, url, undefined, scene)) as
    | ISceneLoaderAsyncResult
    | null;
  return result?.meshes ?? [];
};

/**
 * Whether this build can decode a GLB at all.
 *
 * The glTF loader is a separate package from `@babylonjs/core` in v8, and adding a
 * dependency is a decision with a cost and a `CHANGELOG.md` entry
 * (`CONSTITUTION.md` section 4.2) rather than something to slip in from here. So it is
 * checked at runtime and the answer is reported rather than assumed.
 */
export function hasGlbLoader(): boolean {
  // `GetPluginForExtension` falls back to the default `.babylon` plugin when nothing
  // registers for `.glb`, so a defined return is not proof a GLB can be decoded. The
  // honest check is whether the returned plugin advertises `.glb` in its extensions,
  // which v8 plugins declare either as a comma-separated string or as an
  // extension-keyed map.
  const plugin = SceneLoader.GetPluginForExtension(".glb");
  if (!plugin) return false;
  const exts = plugin.extensions;
  if (typeof exts === "string") {
    return exts
      .split(",")
      .map((ext) => ext.trim().toLowerCase())
      .includes(".glb");
  }
  return Object.keys(exts).some((ext) => ext.trim().toLowerCase() === ".glb");
}

/** Why a unit fell back to procedural geometry. Reported verbatim; the caller logs it. */
export type FallbackReason = "no-manifest-entry" | "load-failed" | "empty-model";

export interface FallbackReport {
  readonly kind: UnitKind;
  readonly reason: FallbackReason;
  /** The URL that failed, or null when the manifest never had an entry. */
  readonly url: string | null;
  readonly message: string;
}

export interface GlbUnitFactoryOptions {
  readonly scene: Scene;
  readonly manifest: UnitManifest;
  /** Used for any kind the manifest cannot supply. Defaults to a procedural factory. */
  readonly fallback?: UnitFactory;
  readonly loadMeshes?: GlbLoader;
  /** Every fallback, with the reason. Full detail for developers. */
  readonly onFallback?: (report: FallbackReport) => void;
  /** Prefix for node names, so a vendored unit is distinguishable in a scene dump. */
  readonly namePrefix?: string;
}

export class GlbUnitFactory implements UnitFactory {
  readonly #scene: Scene;
  readonly #manifest: UnitManifest;
  readonly #fallback: UnitFactory;
  readonly #load: GlbLoader;
  readonly #onFallback: GlbUnitFactoryOptions["onFallback"];
  readonly #namePrefix: string;
  /**
   * One loaded template per kind, and the promise that loads it.
   *
   * Cached because a crowd of 300 infantry must not be 300 fetches of the same 2 MB
   * file. The promise is cached alongside the result, so 300 units created in the same
   * frame share one request instead of stampeding it.
   */
  readonly #templates = new Map<UnitKind, Promise<Template | null>>();
  #lastFallback: FallbackReport | null = null;

  constructor(options: GlbUnitFactoryOptions) {
    this.#scene = options.scene;
    this.#manifest = options.manifest;
    this.#load = options.loadMeshes ?? sceneLoaderGlb;
    this.#onFallback = options.onFallback;
    this.#namePrefix = options.namePrefix ?? "unit";
    // A scene that has vendored every kind should not pay for a procedural material it
    // will never use, so the fallback is only built if nothing else was supplied. A
    // NullEngine-free unit still gets one, because that is the whole point.
    this.#fallback = options.fallback ?? new ProceduralUnitFactory({ scene: options.scene });
  }

  /** True when the manifest names an asset for this kind. Says nothing about the fetch. */
  has(kind: UnitKind): boolean {
    return this.#entryFor(kind) !== null;
  }

  /** The resolved URL for a kind, or null when the manifest has no entry. */
  urlFor(kind: UnitKind): string | null {
    const entry = this.#entryFor(kind);
    return entry ? resolveUrl(entry.url, this.#manifest.baseUrl) : null;
  }

  /** The most recent fallback, for a status line or a test. */
  get lastFallback(): FallbackReport | null {
    return this.#lastFallback;
  }

  async create(appearance: UnitAppearance): Promise<TransformNode> {
    const entry = this.#entryFor(appearance.kind);
    if (!entry) {
      return this.#fallBack(appearance, "no-manifest-entry", null, "The manifest has no asset for this kind.");
    }

    const url = resolveUrl(entry.url, this.#manifest.baseUrl);
    let template: Template | null;
    try {
      template = await this.#templateFor(appearance.kind, entry, url);
    } catch (error) {
      // A load that throws is a load that failed. The cache entry goes, so a later unit
      // retries rather than inheriting one failure for the rest of the session.
      this.#templates.delete(appearance.kind);
      return this.#fallBack(appearance, "load-failed", url, messageOf(error));
    }
    if (!template) {
      return this.#fallBack(appearance, "empty-model", url, "The asset loaded but carried no mesh.");
    }
    return this.#instantiate(template, appearance, url, entry);
  }

  /** Drops and disposes the cached templates. Call after the manifest changes. */
  invalidate(): void {
    for (const pending of this.#templates.values()) {
      void pending.then((template) => template?.dispose()).catch(() => undefined);
    }
    this.#templates.clear();
  }

  /** A fresh unit under a copy of the template. Never returns a fallback. */
  #instantiate(template: Template, appearance: UnitAppearance, url: string, entry: UnitManifestEntry): TransformNode {
    const name = `${this.#namePrefix}-${appearance.kind}-glb`;
    const root = template.root.clone(name, null);
    if (!root) {
      // Node.clone returning null is not a real path, and a caller that got null here
      // would crash somewhere less informative. Treat it as a failed load.
      throw new Error("The unit template could not be copied.");
    }

    // The template sits where the artist put it, which for a rigged character is
    // usually a hip bone at y = 0.93. Shifting the children down by the model's own
    // lowest point puts the feet on the ground, which is the difference between a unit
    // standing on the road and a unit hovering above it.
    for (const child of transformChildren(root)) child.position.y += template.groundOffset;

    const palette = applySlotOverrides(appearance.palette, entry.slots);
    tintHierarchy(root, palette);

    // Everything that changes the unit's size folds into the root, so a caller can
    // still scale the whole unit later without knowing where any of it came from.
    // `template.scale` already carries the manifest multiplier, so it is not applied
    // twice.
    root.scaling.setAll(appearance.scale * template.scale);
    root.metadata = metadataFor(appearance, "glb", url);
    if (entry.idleClip) startIdleClip(root, entry.idleClip);
    return root;
  }

  async #fallBack(
    appearance: UnitAppearance,
    reason: FallbackReason,
    url: string | null,
    message: string,
  ): Promise<TransformNode> {
    const report: FallbackReport = { kind: appearance.kind, reason, url, message };
    this.#lastFallback = report;
    this.#onFallback?.(report);
    return this.#fallback.create(appearance);
  }

  #entryFor(kind: UnitKind): UnitManifestEntry | null {
    const raw = isUnitKind(kind) ? this.#manifest.units[kind] : undefined;
    if (raw === undefined || raw === null) return null;
    const entry: UnitManifestEntry = typeof raw === "string" ? { url: raw } : raw;
    // An empty URL is a manifest that has been started but not finished, and it is
    // treated as absent rather than as a request for the current page.
    return entry.url.length > 0 ? entry : null;
  }

  #templateFor(kind: UnitKind, entry: UnitManifestEntry, url: string): Promise<Template | null> {
    const cached = this.#templates.get(kind);
    if (cached) return cached;
    const loading = this.#loadTemplate(kind, entry, url);
    this.#templates.set(kind, loading);
    return loading;
  }

  async #loadTemplate(kind: UnitKind, entry: UnitManifestEntry, url: string): Promise<Template | null> {
    if (this.#load === sceneLoaderGlb && !hasGlbLoader()) {
      // Nothing in this build can decode a GLB, and the loader's own failure message
      // would be about a missing file rather than a missing plugin. Say the true thing.
      throw new Error("No glTF loader is registered for .glb in this build.");
    }

    const imported = await this.#load(url, this.#scene);
    if (imported.length === 0) return null;

    // The template is a detached, disabled copy that is never added to the visible
    // graph: every unit is a clone of it, and it exists only to be cloned from.
    const root = new TransformNode(`unit-template-${kind}`, this.#scene);
    root.setEnabled(false);
    let lowest = Number.POSITIVE_INFINITY;
    for (const mesh of imported) {
      mesh.parent = root;
      mesh.isPickable = false;
      mesh.computeWorldMatrix(true);
      const minY = mesh.getBoundingInfo().boundingBox.minimumWorld.y;
      if (minY < lowest) lowest = minY;
    }

    const scale = clampScale(entry.scale ?? 1);
    return {
      kind,
      url,
      root,
      groundOffset: Number.isFinite(lowest) ? -lowest : 0,
      scale,
      dispose() {
        root.dispose(false, true);
      },
    };
  }
}

/** A loaded, detached, shared unit, waiting to be copied. */
interface Template {
  readonly kind: UnitKind;
  readonly url: string;
  /** Detached and disabled. Cloned per unit; never rendered itself. */
  readonly root: TransformNode;
  /** Metres to add to each direct child so the model's lowest point lands on y = 0. */
  readonly groundOffset: number;
  /** The manifest's own scale multiplier. */
  readonly scale: number;
  dispose(): void;
}

/**
 * Re-colour a whole copied hierarchy from the palette.
 *
 * Returns the number of meshes tinted, because a model that tints zero meshes is the
 * difference between a unit in team colours and a unit in the artist's original
 * palette, and that is worth being able to assert.
 */
export function tintHierarchy(root: TransformNode, palette: UnitPalette): number {
  let tinted = 0;
  for (const mesh of root.getChildMeshes(false)) {
    tintMesh(mesh, palette);
    tinted += 1;
  }
  return tinted;
}

/**
 * Re-colour one mesh from the palette, cloning its material first.
 *
 * The slot comes from the material's name, because that is all a GLB carries and
 * because it is the one thing a pack author can be told in advance: name the materials
 * `body`, `webbing`, `weapon` and `pennant` and the file arrives in four team colours
 * with no per-file work. Anything unrecognised is `primary`, so a rig nobody annotated
 * still reads as one team rather than as a collage of the artist's choices — which is
 * the whole reason `ART_DIRECTION.md` section 8 picked stylized low-poly.
 *
 * The clone is what makes two units on the same road able to be different colours; the
 * geometry stays shared, which is the half that costs memory at 300 units.
 */
export function tintMesh(mesh: AbstractMesh, palette: UnitPalette): void {
  const source = mesh.material;
  const slot = slotForName(source?.name ?? mesh.name);
  const colour = slotColour(slot, palette);

  if (!source) {
    // Legal but unusual: a GLB with no material. A team-coloured placeholder reads as
    // a unit; an untextured black one reads as a bug in the loader.
    const material = new StandardMaterial(`${mesh.name}-tint`, mesh.getScene());
    material.diffuseColor = colour;
    material.specularColor = new Color3(0, 0, 0);
    mesh.material = material;
    return;
  }

  const clone = source.clone(`${mesh.name}-tint`);
  if (!clone) return;
  // StandardMaterial keeps its colour in `diffuseColor` and PBR in `albedoColor`, and
  // neither class is imported here because importing one would force it into the bundle
  // for every scene whether or not any asset is ever vendored.
  const tinted = tintable(clone);
  if (tinted.albedoColor) tinted.albedoColor = colour;
  else tinted.diffuseColor = colour;
  if (tinted.specularColor) tinted.specularColor = new Color3(0, 0, 0);
  mesh.material = clone;
}

function tintable(material: Material): {
  diffuseColor?: Color3;
  albedoColor?: Color3;
  specularColor?: Color3;
} {
  return material as unknown as { diffuseColor?: Color3; albedoColor?: Color3; specularColor?: Color3 };
}

/** Manifest slot overrides win over the appearance, which is what the file is for. */
export function applySlotOverrides(palette: UnitPalette, overrides: UnitManifestEntry["slots"]): UnitPalette {
  if (!overrides) return palette;
  return {
    primary: overrides.primary ?? palette.primary,
    secondary: overrides.secondary ?? palette.secondary,
    accent: overrides.accent ?? palette.accent,
    metal: overrides.metal ?? palette.metal,
  };
}

/**
 * Loop one of the template's clips on a copy of the template.
 *
 * An `AnimationGroup` is bound to the node instances it was built against, so the
 * template's own group cannot drive a clone: playing it would move the template and
 * every unit would be frozen. Cloning the group per unit with a target converter is
 * the supported way to do this, and it is why the animation work in
 * `agents/asset-packs/animations.md` does not need a battle-layer rewrite later.
 */
export function startIdleClip(root: TransformNode, clip: string): boolean {
  const scene = root.getScene();
  const source = scene.animationGroups.find((group) => group.name === clip);
  if (!source) return false;
  const byName = new Map<string, TransformNode>();
  collectNames(root, byName);
  source
    .clone(`${source.name}@${root.name}`, (old: TransformNode) => byName.get(old?.name) ?? old, true, true)
    .start(true);
  return true;
}

function collectNames(node: TransformNode, into: Map<string, TransformNode>): void {
  into.set(node.name, node);
  for (const child of transformChildren(node)) collectNames(child, into);
}

/**
 * The children of a unit node that can be positioned.
 *
 * `Node.getChildren` is typed as `Node[]` because a scene can hold things that are not
 * transform nodes. Everything inside a unit is one — a GLB root, a mesh, a bone — and
 * anything that is not is skipped rather than asserted on.
 */
function transformChildren(node: TransformNode): TransformNode[] {
  return node.getChildren().filter((child): child is TransformNode => child instanceof TransformNode);
}

/** Absolute URLs pass through; everything else resolves against `baseUrl`. */
export function resolveUrl(url: string, baseUrl: string | undefined): string {
  if (/^(?:https?:)?\/\//i.test(url) || url.startsWith("./") || url.startsWith("../") || url.startsWith("/")) {
    return url;
  }
  if (!baseUrl) return url;
  return `${baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`}${url}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}