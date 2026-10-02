/**
 * Battle UI: deployment phase, camera controls, minimap, intro/outro.
 *
 * These are the DOM/UI components for the battle scene.
 * The 3D scene is in BattleScene.ts; this is the overlay UI.
 */

import { battleSide, status } from "../design/tokens.js";
import { h } from "../ui/dom.js";
import { PLAYABLE_SIDE_IDS, factionPalette, type PlayableSideId } from "../design/factions.js";
import { BANNER_COLORS } from "../clan/bannerPalette.js";
import type { ColorblindMode } from "../settings/schema.js";

/** Deployment phase: player places troops before battle starts. */
export interface DeploymentZone {
  x: number;
  z: number;
  width: number;
  depth: number;
  faction: "player" | "enemy";
}

/** Seconds the player gets to deploy before the battle starts itself. */
export const DEPLOY_SECONDS = 60;

/** `90` -> `1:30`, `5` -> `0:05`. The header shows minutes:seconds. */
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const min = Math.floor(whole / 60);
  const sec = whole % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

/**
 * What the battle site can tell the deployment header about itself. Every field is
 * optional: the header says what it has been given and nothing more.
 */
export interface DeploymentInfo {
  playerFaction?: string;
  terrainName?: string;
}

/** The playable side a faction name names, if it names one. */
function factionSideId(name: string): PlayableSideId | null {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return PLAYABLE_SIDE_IDS.find((id) => id === slug) ?? null;
}

/** The colour-blind mode the app is running in, which main.ts records on the root. */
function activeColorblindMode(): ColorblindMode {
  const mode = document.documentElement.getAttribute("data-colorblind-mode");
  return mode === "deuteranopia" || mode === "protanopia" || mode === "tritanopia" ? mode : "off";
}

/**
 * A faction's cloth. A playable side takes the swatch from the locked faction
 * palette, in whichever colour-blind mode is active; anything else — a clan, a
 * mercenary band — takes a stable pick from the locked clan-banner palette, so
 * the same name is always the same colour. Both are palettes rather than values
 * chosen here, which is why this file holds no colour of its own.
 */
export function factionColor(name: string): string {
  const side = factionSideId(name);
  if (side) return factionPalette(activeColorblindMode())[side].color;
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % BANNER_COLORS.length;
  return BANNER_COLORS[hash] ?? BANNER_COLORS[0];
}

/**
 * The player's banner. The cloth carries the identity and the name carries the
 * information, so the name stays on the header's own ground rather than on the
 * cloth — a pairing no contrast test has verified would be the wrong thing to
 * put under text.
 */
function bannerEl(name: string): HTMLElement {
  return h(
    "div",
    { class: "deploy-banner" },
    h("span", { class: "deploy-banner__field", "aria-hidden": "true", style: `background: ${factionColor(name)}` }),
    h("span", { class: "deploy-banner__name" }, name),
  );
}

export class DeploymentUI {
  private container: HTMLElement | null = null;
  private timerEl: HTMLElement | null = null;
  private timerId: ReturnType<typeof setInterval> | null = null;
  /** Kept so the countdown can end the phase on the same path the button uses. */
  private onExpire: (() => void) | null = null;
  private completed = false;
  private countEl: HTMLElement | null = null;

  show(_zones: DeploymentZone[], onComplete: () => void, info: DeploymentInfo = {}): void {
    // show() may be called again on a still-visible overlay; the old interval has to
    // go before a new one starts or the two tick against the same header.
    this.hide();

    const timerEl = h("span", { class: "deploy-timer", role: "timer" }, formatCountdown(DEPLOY_SECONDS));
    const btn = h("button", { type: "button", class: "deploy-ready" }, "Ready");
    const countEl = h("p", { class: "deploy-count", role: "status", "aria-live": "polite" });

    // The strip above the header: what the site is, before the clock and the sides.
    const strip = h("div", { class: "deploy-info" });
    if (info.playerFaction) strip.appendChild(bannerEl(info.playerFaction));
    if (info.terrainName) strip.appendChild(h("span", { class: "deploy-terrain" }, info.terrainName));

    // Single player: the enemy is the AI, which is never waiting on the player, so its
    // side of the strip is a state rather than a control. Both sides are rendered as
    // labelled slots because a battle where only one side can act has to say so.
    const sides = h(
      "div",
      { class: "deploy-sides" },
      h(
        "div",
        { class: "deploy-side deploy-side--player" },
        h("span", { class: "deploy-side__label" }, "Your troops"),
        btn,
      ),
      h(
        "div",
        { class: "deploy-side deploy-side--enemy" },
        h("span", { class: "deploy-side__label" }, "Enemy troops"),
        h(
          "span",
          { class: "deploy-ready deploy-ready--ai", role: "status" },
          h("span", { class: "deploy-ready__glyph", "aria-hidden": "true" }, status.good.glyph),
          h("span", { class: "deploy-ready__label" }, "Ready"),
          h("span", { class: "visually-hidden" }, " — the enemy is computer controlled and deploys for you"),
        ),
      ),
    );

    const container = h(
      "div",
      { class: "battle-deployment" },
      h(
        "div",
        { class: "deployment-header" },
        strip,
        h(
          "div",
          { class: "deployment-title" },
          h("h2", {}, "Deploy Your Troops"),
          h("p", {}, "Place your units in the highlighted zone"),
          countEl,
        ),
        timerEl,
        sides,
      ),
    );
    document.body.appendChild(container);

    btn.addEventListener("click", () => {
      this.complete(onComplete);
    });

    this.container = container;
    this.timerEl = timerEl;
    this.countEl = countEl;
    this.completed = false;
    this.onExpire = onComplete;
    this.startCountdown();
  }

  /**
   * How much of the army is on the field: `12/20 placed`. The scene owns the
   * placements, so it reports the numbers here and the header states them.
   */
  updateCount(placed: number, total: number): void {
    if (!this.countEl) return;
    this.countEl.textContent = `${placed}/${total} placed`;
  }

  /** The one way the deployment phase ends: the overlay goes, the battle begins. */
  private complete(onComplete: () => void): void {
    // Running out of time and pressing Ready are the same act, so they share one
    // guard: whichever gets there first ends the phase exactly once.
    if (this.completed) return;
    this.completed = true;
    this.hide();
    onComplete();
  }

  /**
   * Run the countdown in the header. The value only ever moves down, and the interval
   * is cleared in hide(), so a hidden overlay leaves nothing running. Reaching zero
   * ends the deployment phase, which is why the interval is also stopped there.
   */
  startCountdown(seconds: number = DEPLOY_SECONDS): void {
    this.stopCountdown();
    let remaining = seconds;
    if (this.timerEl) this.timerEl.textContent = formatCountdown(remaining);
    this.timerId = setInterval(() => {
      remaining -= 1;
      if (this.timerEl) this.timerEl.textContent = formatCountdown(remaining);
      if (remaining > 0) return;
      this.stopCountdown();
      if (this.onExpire) this.complete(this.onExpire);
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.timerId === null) return;
    clearInterval(this.timerId);
    this.timerId = null;
  }

  hide(): void {
    this.stopCountdown();
    this.container?.remove();
    this.container = null;
    this.timerEl = null;
    this.countEl = null;
    this.onExpire = null;
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
