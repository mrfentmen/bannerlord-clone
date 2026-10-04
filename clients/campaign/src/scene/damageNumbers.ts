/**
 * Tasks 330-332: floating damage numbers.
 *
 * Every strike pops its damage figure above the victim's head: white for a
 * clean hit, yellow when flanking multiplied it, red when the blow killed.
 * The numbers are billboarded planes with canvas-drawn text — they live in
 * the 3D scene, so they track the victim as the camera moves, and they rise
 * and fade over about a second before disposing themselves.
 *
 * The `floatingDamageNumbers` setting gates the whole layer (task 332): when
 * the player turns it off, strikes stay silent visually. The setting is read
 * through the injected reader so the layer follows live changes.
 */

import {
  DynamicTexture,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
} from "@babylonjs/core";
import type { CombatEventSource, StrikeEvent } from "./combatEvents.js";
import { battleSide, subtitle } from "../design/tokens.js";

const NUMBER_WIDTH = 1.2;
const NUMBER_HEIGHT = 0.6;
const RISE_SPEED = 1.4;
const LIFE_S = 1.1;
const TEXTURE_SIZE = 128;

interface FloatEntry {
  mesh: Mesh;
  texture: DynamicTexture;
  material: StandardMaterial;
  age: number;
}

function numberColor(e: StrikeEvent, baseDamage: number): string {
  if (e.killed) return battleSide.enemy;
  if (e.amount > baseDamage * 1.01) return subtitle.speaker;
  return subtitle.text;
}

export interface DamageNumbersOptions {
  /** Live reader for the `floatingDamageNumbers` setting. Default: always on. */
  enabled?: () => boolean;
  /** Base damage, for deciding what counts as a multiplied hit. Default 12. */
  baseDamage?: number;
}

export class DamageNumbers {
  private readonly entries: FloatEntry[] = [];
  private readonly enabled: () => boolean;
  private readonly baseDamage: number;
  private readonly unsubscribe: () => void;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    source: CombatEventSource,
    opts: DamageNumbersOptions = {},
  ) {
    this.enabled = opts.enabled ?? (() => true);
    this.baseDamage = opts.baseDamage ?? 12;
    this.unsubscribe = source.onStrike((e) => this.spawn(e));
  }

  private spawn(e: StrikeEvent): void {
    if (this.disposed || !this.enabled()) return;
    const texture = new DynamicTexture(
      `dmgNum_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      { width: TEXTURE_SIZE, height: TEXTURE_SIZE / 2 },
      this.scene,
      true,
    );
    const ctx = texture.getContext() as CanvasRenderingContext2D | null;
    const text = String(Math.round(e.amount));
    if (ctx) {
      // Headless engines (NullEngine in tests) have no 2D context; the number
      // still spawns, floats and disposes — it just draws nothing.
      ctx.font = "bold 64px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.lineWidth = 8;
      ctx.strokeText(text, TEXTURE_SIZE / 2, TEXTURE_SIZE / 4);
      ctx.fillStyle = numberColor(e, this.baseDamage);
      ctx.fillText(text, TEXTURE_SIZE / 2, TEXTURE_SIZE / 4);
      texture.update();
    }
    texture.hasAlpha = true;

    const material = new StandardMaterial(`dmgNumMat_${Date.now()}`, this.scene);
    material.diffuseTexture = texture;
    material.emissiveColor.set(1, 1, 1);
    material.disableLighting = true;
    material.useAlphaFromDiffuseTexture = true;

    const mesh = MeshBuilder.CreatePlane("dmgNum", {
      width: NUMBER_WIDTH,
      height: NUMBER_HEIGHT,
    }, this.scene);
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    mesh.isPickable = false;
    mesh.material = material;
    mesh.position.set(e.victimPosition.x, e.victimPosition.y + 2.4, e.victimPosition.z);

    this.entries.push({ mesh, texture, material, age: 0 });
  }

  /** Float the numbers up and fade them out. Call once per frame. */
  update(dt: number): void {
    if (this.disposed) return;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      if (!entry) continue;
      entry.age += dt;
      const t = entry.age / LIFE_S;
      if (t >= 1) {
        entry.mesh.dispose();
        entry.texture.dispose();
        entry.material.dispose();
        this.entries.splice(i, 1);
        continue;
      }
      entry.mesh.position.y += RISE_SPEED * dt;
      entry.material.alpha = 1 - t;
    }
  }

  /** How many numbers are currently floating. For tests. */
  get count(): number {
    return this.entries.length;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    for (const entry of this.entries) {
      entry.mesh.dispose();
      entry.texture.dispose();
      entry.material.dispose();
    }
    this.entries.length = 0;
  }
}
