/**
 * The deployment map view (MASTER_PLAN tasks 31-38): a top-down battlefield
 * preview rendered from a `BattlePatch`, with the player's units placeable
 * by click, drag, or keyboard.
 *
 * The view owns no simulation state. It takes a patch + roster, lets the
 * player arrange tokens inside the attacker deployment zone, and reports
 * placements through `onChange` / `onConfirm`. Invalid drops are rejected
 * with the reason spoken aloud and shown as a toast.
 *
 * Around the map: RTS unit cards with health/morale (33), the enemy army
 * list (34), formation presets (35), terrain notes (36), a gated Begin
 * battle ready check (37), and named save/load of deployments (38).
 *
 * @vitest-environment jsdom — see `__tests__/terrain.test.ts` for the pure
 * logic; this file's DOM behaviour is exercised through `openDeployment`.
 */

import { h } from "../ui/dom.js";
import { ink, paper, status, unitKind } from "../design/tokens.js";
import {
  applyFormation,
  cellColor,
  patchToPixel,
  pixelToPatch,
  terrainNotes,
  validatePlacement,
} from "./terrain.js";
import {
  PATCH_RES,
  type DeploymentMapOptions,
  type EnemyUnit,
  type FormationPreset,
  type Placement,
  type SavedDeployment,
} from "./types.js";

export interface DeploymentMapHandle {
  root: HTMLElement;
  getPlacements: () => Placement[];
  close: () => void;
}

export function openDeployment(options: DeploymentMapOptions): DeploymentMapHandle {
  const { patch, roster } = options;
  const placements = new Map<string, Placement>();
  const byId = new Map(roster.map((u) => [u.id, u]));
  let selectedId: string | null = null;
  let placingId: string | null = null;
  let dragId: string | null = null;
  let dragValid = true;
  let dragFrom: { x: number; y: number } | null = null;
  let toastTimer = 0;

  const root = h("div", { class: "deploy", role: "dialog", "aria-modal": "true", "aria-label": "Battle deployment map" });
  const header = h("div", { class: "deploy__header" });
  const title = h("h2", { class: "deploy__title", text: `Deploy — ${patch.settlement_id}` });
  const sub = h("p", { class: "deploy__sub", text: `${patch.biome} · 2 km × 2 km · N ↑` });
  header.append(title, sub);
  if (patch.preview) {
    header.append(h("p", { class: "deploy__preview", text: "PREVIEW TERRAIN — generated stand-in, not survey data" }));
  }
  const closeBtn = h("button", { type: "button", class: "btn btn--quiet", text: "Close", "aria-label": "Close deployment map" });

  const main = h("div", { class: "deploy__main" });
  const mapWrap = h("div", { class: "deploy__mapwrap" });
  const canvas = h("canvas", {
    class: "deploy__canvas",
    tabindex: "0",
    role: "application",
    "aria-label": "Top-down battlefield. Arrow keys nudge the selected unit, Delete removes it.",
  }) as HTMLCanvasElement;
  const hint = h("p", { class: "deploy__hint", "aria-live": "polite", text: "Pick a unit from the roster, then click inside the green deployment zone." });
  mapWrap.append(canvas, hint);

  const rosterEl = h("div", { class: "deploy__roster", role: "list", "aria-label": "Units to deploy" });

  // -- side panels: terrain notes (36), enemy army list (34) -------------------

  const panels = h("div", { class: "deploy__panels" });

  const notesPanel = h("section", { class: "deploy__panel", "aria-label": "Terrain notes" });
  notesPanel.append(h("h3", { class: "deploy__paneltitle", text: "Terrain" }));
  const notesList = h("ul", { class: "deploy__notes" });
  for (const note of terrainNotes(patch)) {
    const li = h("li", { class: "deploy__note" });
    li.append(h("strong", { text: note.label }), document.createTextNode(` — ${note.detail}`));
    notesList.append(li);
  }
  notesPanel.append(notesList);

  const enemyPanel = h("section", { class: "deploy__panel", "aria-label": "Enemy forces" });
  enemyPanel.append(h("h3", { class: "deploy__paneltitle", text: "Enemy forces" }));
  const enemyRoster: EnemyUnit[] = options.enemyRoster ?? [];
  if (enemyRoster.length === 0) {
    enemyPanel.append(h("p", { class: "deploy__muted", text: "No scouting report — the enemy order of battle is unknown." }));
  } else {
    const enemyList = h("ul", { class: "deploy__enemy" });
    let enemyTotal = 0;
    for (const e of enemyRoster) {
      enemyTotal += e.count;
      const li = h("li", { class: "deploy__enemyrow" });
      const dot = h("span", { class: "deploy__dot" });
      dot.style.background = unitKind[e.kind];
      li.append(dot, h("span", { class: "deploy__cardname", text: e.label ?? e.kind }), h("span", { class: "deploy__cardmeta", text: `${e.count} · ${e.kind}` }));
      enemyList.append(li);
    }
    enemyPanel.append(enemyList, h("p", { class: "deploy__muted", text: `${enemyRoster.length} unit types, ~${enemyTotal} fighters` }));
  }

  // -- formations (35) + saved deployments (38) ---------------------------------

  const setupPanel = h("section", { class: "deploy__panel", "aria-label": "Formations and saved deployments" });
  setupPanel.append(h("h3", { class: "deploy__paneltitle", text: "Formation" }));
  const formationRow = h("div", { class: "deploy__formrow", role: "group", "aria-label": "Formation presets" });
  const formationBtns: Record<FormationPreset, HTMLButtonElement> = {
    line: h("button", { type: "button", class: "btn", text: "Line" }),
    column: h("button", { type: "button", class: "btn", text: "Column" }),
    wedge: h("button", { type: "button", class: "btn", text: "Wedge" }),
  };
  for (const [preset, btn] of Object.entries(formationBtns) as [FormationPreset, HTMLButtonElement][]) {
    btn.addEventListener("click", () => applyPreset(preset));
    formationRow.append(btn);
  }
  setupPanel.append(formationRow);

  setupPanel.append(h("h3", { class: "deploy__paneltitle", text: "Saved deployments" }));
  const saveRow = h("div", { class: "deploy__formrow" });
  const saveName = h("input", {
    class: "deploy__savename",
    type: "text",
    placeholder: "Name this setup…",
    "aria-label": "Name for the saved deployment",
    maxlength: "40",
  }) as HTMLInputElement;
  const saveBtn = h("button", { type: "button", class: "btn", text: "Save" });
  saveBtn.addEventListener("click", () => saveDeployment(saveName.value.trim()));
  saveRow.append(saveName, saveBtn);
  const savedList = h("ul", { class: "deploy__saved", "aria-label": "Saved deployments" });
  setupPanel.append(saveRow, savedList);

  panels.append(notesPanel, enemyPanel, setupPanel);

  // -- footer: ready check (37) --------------------------------------------------

  const footer = h("div", { class: "deploy__footer" });
  const count = h("p", { class: "deploy__count", "aria-live": "polite" });
  const reasons = h("ul", { class: "deploy__reasons", "aria-live": "polite" });
  const beginBtn = h("button", { type: "button", class: "btn btn--primary", text: "Begin battle" });
  beginBtn.addEventListener("click", () => {
    if (beginBtn.disabled) return;
    options.onConfirm?.([...placements.values()]);
    close();
  });
  footer.append(count, reasons, beginBtn);
  main.append(mapWrap, rosterEl);
  root.append(header, closeBtn, main, panels, footer);

  function emit(): void {
    const list = [...placements.values()];
    count.textContent = `${list.length} of ${roster.length} units placed`;
    readyCheck();
    options.onChange?.(list);
  }

  /**
   * Task 37: the Begin battle button enables only when every roster unit is
   * placed and every placement validates. Otherwise the button is disabled
   * and the reasons are listed for the player.
   */
  function readyCheck(): void {
    const problems: string[] = [];
    for (const unit of roster) {
      const p = placements.get(unit.id);
      if (!p) {
        problems.push(`${unit.label} is not placed`);
        continue;
      }
      const v = validatePlacement(patch, p.x, p.y, unit.radius_m);
      if (!v.ok) problems.push(`${unit.label}: ${v.reason}`);
    }
    reasons.replaceChildren();
    for (const problem of problems) {
      reasons.append(h("li", { text: problem }));
    }
    beginBtn.disabled = problems.length > 0;
    beginBtn.title = problems.length > 0 ? problems.join("; ") : "All units placed — sound the horn";
  }

  /**
   * Task 35: arrange every roster unit in the chosen preset inside the
   * deployment zone. Units that fail validation (usually water or cover in
   * the generated slot) stay where they were and are reported.
   */
  function applyPreset(preset: FormationPreset): void {
    const spots = applyFormation(
      patch.spawn_zones.attacker,
      roster.map((u) => ({ unitId: u.id, radius_m: u.radius_m })),
      preset,
    );
    const failed: string[] = [];
    for (const spot of spots) {
      const unit = byId.get(spot.unitId);
      if (!unit) continue;
      const v = validatePlacement(patch, spot.x, spot.y, unit.radius_m);
      if (v.ok) {
        placements.set(spot.unitId, { unitId: spot.unitId, x: spot.x, y: spot.y });
      } else {
        failed.push(`${unit.label} (${v.reason})`);
      }
    }
    renderRoster();
    draw();
    emit();
    toast(
      failed.length === 0
        ? `Formation: ${preset}. ${spots.length} units placed.`
        : `Formation: ${preset}. Could not place: ${failed.join(", ")}.`,
    );
  }

  // -- saved deployments (task 38) ----------------------------------------------

  const store = options.storage ?? window.localStorage;
  const STORE_KEY = "campaign.deployments.v1";

  function readSaved(): SavedDeployment[] {
    try {
      const raw = store.getItem(STORE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as SavedDeployment[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeSaved(list: SavedDeployment[]): void {
    try {
      store.setItem(STORE_KEY, JSON.stringify(list));
    } catch {
      toast("Could not save — storage is unavailable.");
    }
  }

  function saveDeployment(name: string): void {
    if (!name) {
      toast("Give the setup a name first.");
      saveName.focus();
      return;
    }
    if (placements.size === 0) {
      toast("Place at least one unit before saving.");
      return;
    }
    const list = readSaved().filter((s) => s.name !== name);
    list.unshift({
      name,
      savedAt: new Date().toISOString(),
      placements: [...placements.values()],
    });
    writeSaved(list);
    saveName.value = "";
    renderSaved();
    toast(`Saved "${name}".`);
  }

  function loadDeployment(saved: SavedDeployment): void {
    const known = new Set(roster.map((u) => u.id));
    const failed: string[] = [];
    let applied = 0;
    for (const p of saved.placements) {
      const unit = byId.get(p.unitId);
      if (!unit || !known.has(p.unitId)) {
        failed.push(p.unitId);
        continue;
      }
      const v = validatePlacement(patch, p.x, p.y, unit.radius_m);
      if (!v.ok) {
        failed.push(`${unit.label} (${v.reason})`);
        continue;
      }
      placements.set(p.unitId, { unitId: p.unitId, x: p.x, y: p.y });
      applied++;
    }
    renderRoster();
    draw();
    emit();
    toast(
      failed.length === 0
        ? `Loaded "${saved.name}" — ${applied} units placed.`
        : `Loaded "${saved.name}" — ${applied} placed, skipped: ${failed.join(", ")}.`,
    );
  }

  function renderSaved(): void {
    savedList.replaceChildren();
    const list = readSaved();
    if (list.length === 0) {
      savedList.append(h("li", { class: "deploy__muted", text: "No saved setups yet." }));
      return;
    }
    for (const saved of list) {
      const li = h("li", { class: "deploy__savedrow" });
      const load = h("button", { type: "button", class: "btn btn--quiet", text: saved.name, title: `${saved.placements.length} units, saved ${saved.savedAt.slice(0, 10)}` });
      load.addEventListener("click", () => loadDeployment(saved));
      const del = h("button", { type: "button", class: "btn btn--quiet", text: "Delete", "aria-label": `Delete saved deployment ${saved.name}` });
      del.addEventListener("click", () => {
        writeSaved(readSaved().filter((s) => s.name !== saved.name));
        renderSaved();
      });
      li.append(load, del);
      savedList.append(li);
    }
  }

  function toast(msg: string): void {
    hint.textContent = msg;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      hint.textContent = placingId
        ? "Click inside the green deployment zone to place the unit."
        : "Pick a unit from the roster, then click inside the green deployment zone.";
    }, 4000);
  }

  // -- roster (task 33: cards show count, health, morale; live on change) ----------

  /** A labelled 0-100 meter, or an honest "—" when the value is unreported. */
  function meter(label: string, value: number | undefined): HTMLElement {
    const wrap = h("span", { class: "deploy__meter" });
    wrap.append(h("span", { class: "deploy__meterlabel", text: label }));
    if (value == null || Number.isNaN(value)) {
      wrap.append(h("span", { class: "deploy__meterna", text: "—" }));
      wrap.title = `${label} not reported`;
      return wrap;
    }
    const clamped = Math.max(0, Math.min(100, value));
    const track = h("span", { class: "deploy__metertrack", role: "img", "aria-label": `${label} ${Math.round(clamped)} of 100` });
    const fill = h("span", { class: "deploy__meterfill" });
    fill.style.width = `${clamped}%`;
    fill.style.background = clamped >= 60 ? status.good.mark : clamped >= 30 ? status.warning.mark : status.critical.mark;
    track.append(fill);
    wrap.append(track);
    return wrap;
  }

  function renderRoster(): void {
    rosterEl.replaceChildren();
    for (const unit of roster) {
      const placed = placements.has(unit.id);
      const card = h("button", {
        type: "button",
        class: "deploy__card" + (placed ? " is-placed" : "") + (placingId === unit.id ? " is-placing" : ""),
        role: "listitem",
        disabled: placed || undefined,
        "aria-pressed": placingId === unit.id ? "true" : "false",
        "aria-label": placed
          ? `${unit.label}, ${unit.count} ${unit.kind}, placed`
          : `Place ${unit.label}, ${unit.count} ${unit.kind}`,
      });
      const dot = h("span", { class: "deploy__dot" });
      dot.style.background = unitKind[unit.kind];
      const head = h("span", { class: "deploy__cardhead" });
      head.append(dot, h("span", { class: "deploy__cardname", text: unit.label }), h("span", { class: "deploy__cardmeta", text: `${unit.count} · ${unit.kind}` }));
      const meters = h("span", { class: "deploy__meters" });
      meters.append(meter("HP", unit.health), meter("Morale", unit.morale));
      card.append(head, meters);
      card.addEventListener("click", () => {
        placingId = placingId === unit.id ? null : unit.id;
        selectedId = null;
        renderRoster();
        draw();
        canvas.focus();
        if (placingId) toast(`Placing ${unit.label} — click inside the green zone. Esc cancels.`);
      });
      rosterEl.append(card);
    }
  }

  // -- canvas -----------------------------------------------------------------

  function sizeCanvas(): void {
    const rect = mapWrap.getBoundingClientRect();
    const css = Math.max(280, Math.min(rect.width || 600, (rect.height || 600) - 40));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(css * dpr);
    canvas.height = Math.round(css * dpr);
    canvas.style.width = `${css}px`;
    canvas.style.height = `${css}px`;
  }

  function draw(): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const S = canvas.width; // device px; square
    const cell = S / PATCH_RES;
    for (let i = 0; i < patch.heightfield.length; i++) {
      const [r, g, b] = cellColor(patch, i);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      const row = Math.floor(i / PATCH_RES);
      const col = i % PATCH_RES;
      ctx.fillRect(col * cell, row * cell, Math.ceil(cell), Math.ceil(cell));
    }
    const toPx = (x: number, y: number) => {
      const { px, py } = patchToPixel(x, y, S);
      return { px, py };
    };
    // Spawn zones.
    for (const [key, color] of [["attacker", status.good.mark], ["defender", status.critical.mark]] as const) {
      const z = patch.spawn_zones[key];
      const a = toPx(z.x, z.y + z.height_m);
      const b = toPx(z.x + z.width_m, z.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, S / 400);
      ctx.setLineDash([S / 80, S / 120]);
      ctx.globalAlpha = 0.9;
      ctx.strokeRect(a.px, a.py, b.px - a.px, b.py - a.py);
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = color;
      ctx.fillRect(a.px, a.py, b.px - a.px, b.py - a.py);
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.font = `${Math.max(10, S / 45)}px sans-serif`;
      ctx.fillText(key === "attacker" ? "DEPLOY HERE" : "ENEMY", a.px + 6, a.py + 16);
    }
    // Reinforcement edge arrow.
    const edge = patch.spawn_zones.reinforcement_edge;
    ctx.fillStyle = status.good.mark;
    ctx.font = `${Math.max(14, S / 30)}px sans-serif`;
    ctx.textAlign = "center";
    const mid = S / 2;
    if (edge === "south") ctx.fillText("▼ reinforcements", mid, S - 8);
    else if (edge === "north") ctx.fillText("▲ reinforcements", mid, 18);
    else if (edge === "west") ctx.fillText("◀", 14, mid);
    else ctx.fillText("▶", S - 14, mid);
    ctx.textAlign = "left";
    // Cover objects.
    ctx.globalAlpha = 0.85;
    for (const c of patch.cover_objects) {
      const { px, py } = toPx(c.x, c.y);
      const pr = (c.radius_m / 2000) * S;
      ctx.strokeStyle = ink[900];
      ctx.lineWidth = Math.max(1.5, S / 500);
      ctx.beginPath();
      if (c.type === "building" || c.type === "wall") ctx.rect(px - pr, py - pr, pr * 2, pr * 2);
      else if (c.type === "rock") {
        ctx.moveTo(px, py - pr);
        ctx.lineTo(px + pr, py + pr);
        ctx.lineTo(px - pr, py + pr);
        ctx.closePath();
      } else ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Unit tokens.
    for (const p of placements.values()) {
      const unit = byId.get(p.unitId);
      if (!unit) continue;
      const { px, py } = toPx(p.x, p.y);
      const r = Math.max(10, (unit.radius_m / 2000) * S * 2.2, S / 55);
      const isDrag = dragId === p.unitId;
      ctx.globalAlpha = isDrag ? 0.65 : 1;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = isDrag && !dragValid ? status.critical.mark : unitKind[unit.kind];
      ctx.fill();
      ctx.lineWidth = p.unitId === selectedId ? 3 : 1.5;
      if (p.unitId === selectedId) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = paper[0];
      } else {
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = ink[900];
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = paper[0];
      ctx.font = `bold ${Math.max(10, r * 0.9)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(unit.count), px, py);
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
    }
    // North arrow + scale bar.
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = paper[0];
    ctx.font = `bold ${Math.max(12, S / 40)}px sans-serif`;
    ctx.fillText("N ↑", 10, 22);
    const barM = 200;
    const barPx = (barM / 2000) * S;
    ctx.fillRect(10, S - 18, barPx, 4);
    ctx.font = `${Math.max(10, S / 55)}px sans-serif`;
    ctx.fillText("200 m", 12 + barPx, S - 12);
    ctx.globalAlpha = 1;
  }

  function canvasPos(ev: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const { x, y } = pixelToPatch((ev.clientX - rect.left) * sx, (ev.clientY - rect.top) * sx, canvas.width);
    return { x, y };
  }

  function tokenAt(x: number, y: number): Placement | null {
    const S = canvas.width;
    let best: Placement | null = null;
    let bestD = Infinity;
    for (const p of placements.values()) {
      const unit = byId.get(p.unitId);
      if (!unit) continue;
      const { px, py } = patchToPixel(p.x, p.y, S);
      const { px: qx, py: qy } = patchToPixel(x, y, S);
      const d = Math.hypot(px - qx, py - qy);
      const grab = Math.max(14, (unit.radius_m / 2000) * S * 2.2);
      if (d < grab && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  function attemptPlace(unitId: string, x: number, y: number): void {
    const unit = byId.get(unitId);
    if (!unit) return;
    const v = validatePlacement(patch, x, y, unit.radius_m);
    if (!v.ok) {
      toast(`Can't place ${unit.label} there — ${v.reason}.`);
      return;
    }
    placements.set(unitId, { unitId, x: Math.round(x), y: Math.round(y) });
    placingId = null;
    selectedId = unitId;
    renderRoster();
    draw();
    emit();
  }

  canvas.addEventListener("pointerdown", (ev) => {
    canvas.focus();
    const { x, y } = canvasPos(ev);
    const hit = tokenAt(x, y);
    if (hit) {
      selectedId = hit.unitId;
      placingId = null;
      dragId = hit.unitId;
      dragFrom = { x: hit.x, y: hit.y };
      dragValid = true;
      canvas.setPointerCapture(ev.pointerId);
      renderRoster();
      draw();
      return;
    }
    if (placingId) {
      attemptPlace(placingId, x, y);
    } else {
      selectedId = null;
      draw();
    }
  });

  canvas.addEventListener("pointermove", (ev) => {
    if (!dragId) return;
    const { x, y } = canvasPos(ev);
    const unit = byId.get(dragId);
    if (!unit) return;
    dragValid = validatePlacement(patch, x, y, unit.radius_m).ok;
    placements.set(dragId, { unitId: dragId, x: Math.round(x), y: Math.round(y) });
    draw();
  });

  canvas.addEventListener("pointerup", (ev) => {
    if (!dragId) return;
    const { x, y } = canvasPos(ev);
    const unit = byId.get(dragId);
    const id = dragId;
    dragId = null;
    if (!unit) {
      draw();
      return;
    }
    const v = validatePlacement(patch, x, y, unit.radius_m);
    if (!v.ok) {
      // Snap back to where the drag started.
      if (dragFrom) placements.set(id, { unitId: id, x: dragFrom.x, y: dragFrom.y });
      toast(`Can't move ${unit.label} there — ${v.reason}.`);
    }
    dragFrom = null;
    draw();
    emit();
  });

  canvas.addEventListener("keydown", (ev) => {
    if (!selectedId) return;
    const unit = byId.get(selectedId);
    const p = placements.get(selectedId);
    if (!unit || !p) return;
    const step = ev.shiftKey ? 50 : 10;
    let dx = 0;
    let dy = 0;
    if (ev.key === "ArrowLeft") dx = -step;
    else if (ev.key === "ArrowRight") dx = step;
    else if (ev.key === "ArrowUp") dy = step;
    else if (ev.key === "ArrowDown") dy = -step;
    else if (ev.key === "Delete" || ev.key === "Backspace") {
      placements.delete(selectedId);
      selectedId = null;
      renderRoster();
      draw();
      emit();
      toast(`${unit.label} returned to the roster.`);
      ev.preventDefault();
      return;
    } else return;
    ev.preventDefault();
    const v = validatePlacement(patch, p.x + dx, p.y + dy, unit.radius_m);
    if (!v.ok) {
      toast(`Can't move ${unit.label} there — ${v.reason}.`);
      return;
    }
    placements.set(selectedId, { unitId: selectedId, x: p.x + dx, y: p.y + dy });
    draw();
    emit();
  });

  function onDocKey(ev: KeyboardEvent): void {
    if (ev.key !== "Escape" || !root.isConnected) return;
    if (placingId) {
      placingId = null;
      renderRoster();
      draw();
      toast("Placement cancelled.");
    } else close();
  }
  document.addEventListener("keydown", onDocKey);

  closeBtn.addEventListener("click", () => close());

  function close(): void {
    document.removeEventListener("keydown", onDocKey);
    window.removeEventListener("resize", draw);
    root.remove();
    options.onClose?.();
  }

  window.addEventListener("resize", draw);

  renderRoster();
  renderSaved();
  emit();
  // The wrap may not be laid out yet when opened synchronously; size on the
  // next frame so getBoundingClientRect is meaningful.
  requestAnimationFrame(() => {
    sizeCanvas();
    draw();
  });

  return {
    root,
    getPlacements: () => [...placements.values()],
    close,
  };
}
