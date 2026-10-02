/**
 * Battle UI: deployment phase, camera controls, minimap, intro/outro.
 *
 * These are the DOM/UI components for the battle scene.
 * The 3D scene is in BattleScene.ts; this is the overlay UI.
 */

import { battleSide } from "../design/tokens.js";

/** Deployment phase: player places troops before battle starts. */
export interface DeploymentZone {
  x: number;
  z: number;
  width: number;
  depth: number;
  faction: "player" | "enemy";
}

export class DeploymentUI {
  private container: HTMLElement | null = null;

  show(_zones: DeploymentZone[], onComplete: () => void): void {
    this.container = document.createElement("div");
    this.container.className = "battle-deployment";
    this.container.innerHTML = `
      <div class="deployment-header">
        <h2>Deploy Your Troops</h2>
        <p>Place your units in the highlighted zone</p>
        <button class="deploy-done">Start Battle</button>
      </div>
    `;
    document.body.appendChild(this.container);

    const btn = this.container.querySelector(".deploy-done");
    btn?.addEventListener("click", () => {
      this.hide();
      onComplete();
    });
  }

  hide(): void {
    this.container?.remove();
    this.container = null;
  }
}

/** Battle intro: faction banners, troop counts, terrain name. */
export interface BattleIntroData {
  playerFaction: string;
  enemyFaction: string;
  playerCount: number;
  enemyCount: number;
  terrainName: string;
  biome: string;
}

export function showBattleIntro(data: BattleIntroData, onDismiss: () => void): void {
  const el = document.createElement("div");
  el.className = "battle-intro";
  el.innerHTML = `
    <div class="intro-factions">
      <div class="faction player">
        <h3>${data.playerFaction}</h3>
        <div class="count">${data.playerCount} troops</div>
      </div>
      <div class="vs">VS</div>
      <div class="faction enemy">
        <h3>${data.enemyFaction}</h3>
        <div class="count">${data.enemyCount} troops</div>
      </div>
    </div>
    <div class="terrain">${data.terrainName} — ${data.biome}</div>
    <button class="intro-start">To Battle</button>
  `;
  document.body.appendChild(el);

  el.querySelector(".intro-start")?.addEventListener("click", () => {
    el.remove();
    onDismiss();
  });

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    if (el.parentNode) {
      el.remove();
      onDismiss();
    }
  }, 5000);
}

/** Battle outro: victory/defeat screen with casualties. */
export interface BattleResultData {
  victory: boolean;
  playerCasualties: number;
  enemyCasualties: number;
  prisoners: number;
  loot: string[];
}
export function showBattleOutro(data: BattleResultData, onContinue: () => void): void {
  const el = document.createElement("div");
  el.className = "battle-outro";
  el.innerHTML = `
    <div class="result-header ${data.victory ? "victory" : "defeat"}">
      <h2>${data.victory ? "VICTORY" : "DEFEAT"}</h2>
    </div>
    <div class="casualties">
      <div>Your losses: ${data.playerCasualties}</div>
      <div>Enemy losses: ${data.enemyCasualties}</div>
      <div>Prisoners: ${data.prisoners}</div>
    </div>
    ${data.loot.length > 0 ? `<div class="loot">Loot: ${data.loot.join(", ")}</div>` : ""}
    <button class="outro-continue">Continue</button>
  `;
  document.body.appendChild(el);

  el.querySelector(".outro-continue")?.addEventListener("click", () => {
    el.remove();
    onContinue();
  });
}

/** Minimap: troop dots and objective markers (Pax task 62). */
export interface MinimapDot {
  x: number; // 0-1 normalized
  z: number; // 0-1 normalized
  faction: "player" | "enemy";
}

export class BattleMinimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(size = 160) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = size;
    this.canvas.height = size;
    this.canvas.className = "battle-minimap";
    this.ctx = this.canvas.getContext("2d")!;
    document.body.appendChild(this.canvas);
  }

  /** Update troop positions. Coords are 0-1 normalized battlefield positions. */
  update(dots: MinimapDot[]): void {
    const { ctx, canvas } = this;
    const s = canvas.width;
    ctx.clearRect(0, 0, s, s);

    // Background
    ctx.fillStyle = "rgba(20, 30, 20, 0.7)";
    ctx.fillRect(0, 0, s, s);

    // Dots
    for (const d of dots) {
      ctx.fillStyle = d.faction === "player" ? battleSide.player : battleSide.enemy;
      ctx.beginPath();
      ctx.arc(d.x * s, d.z * s, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  dispose(): void {
    this.canvas.remove();
  }
}
