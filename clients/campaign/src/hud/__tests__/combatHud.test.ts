/**
 * Tasks 31, 33, 35, 41, 45-48: the combat HUD cluster.
 *
 * Every component here reads a source interface, so the tests drive them with
 * scripted sources: a kill is emitted, the feed shows it; a strike lands, the
 * marker flashes. Timers are injected — no test waits on a real clock.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from "vitest";
import { CombatEventBus } from "../../scene/combatEvents.js";
import { createKillFeed, KILL_FEED_MAX } from "../killFeed.js";
import { createHitMarker } from "../hitMarker.js";
import { createKillConfirm } from "../killConfirm.js";
import { createComboCounter } from "../comboCounter.js";
import { createDamageDirection } from "../damageDirection.js";
import { createLowHealthWarning } from "../lowHealthWarning.js";
import { createSelectedUnitPanel } from "../selectedUnitPanel.js";
import type { SelectedUnit } from "../selectedUnitPanel.js";

beforeEach(() => {
  document.body.replaceChildren();
});

function immediateTimer(fn: () => void): unknown {
  fn();
  return 0;
}

describe("combat event bus", () => {
  it("delivers kills and strikes to every listener, then stops on unsubscribe", () => {
    const bus = new CombatEventBus();
    const kills: unknown[] = [];
    const strikes: unknown[] = [];
    const offKill = bus.onKill((e) => kills.push(e));
    bus.onStrike((e) => strikes.push(e));

    bus.emitStrike({ attackerTeam: 0, victimTeam: 1, fromDirection: { x: 1, z: 0 }, killed: false });
    bus.emitKill({ victimTeam: 1, killerTeam: 0 });
    expect(strikes).toHaveLength(1);
    expect(kills).toHaveLength(1);

    offKill();
    bus.emitKill({ victimTeam: 0, killerTeam: 1 });
    expect(kills).toHaveLength(1);
  });
});

describe("kill feed (task 31)", () => {
  it("lists kills newest-first and never more than five", () => {
    const bus = new CombatEventBus();
    const feed = createKillFeed(bus, { setTimeout: () => 0 });
    document.body.appendChild(feed.root);

    for (let i = 0; i < 7; i++) bus.emitKill({ victimTeam: 1, killerTeam: 0 });
    const items = document.querySelectorAll(".hud-killfeed__item");
    expect(items).toHaveLength(KILL_FEED_MAX);
    expect(items[0]?.textContent).toMatch(/Enemy soldier down/);
    feed.destroy();
  });

  it("reports the player's losses as losses", () => {
    const bus = new CombatEventBus();
    const feed = createKillFeed(bus, { setTimeout: () => 0 });
    document.body.appendChild(feed.root);

    bus.emitKill({ victimTeam: 0, killerTeam: 1 });
    expect(document.querySelector(".hud-killfeed__item--player")).not.toBeNull();
    expect(document.querySelector(".hud-killfeed__item")?.textContent).toMatch(/fallen/);
    feed.destroy();
  });

  it("fades entries after the fade interval", () => {
    const bus = new CombatEventBus();
    const feed = createKillFeed(bus, { setTimeout: immediateTimer });
    document.body.appendChild(feed.root);

    bus.emitKill({ victimTeam: 1, killerTeam: 0 });
    expect(document.querySelector(".hud-killfeed__item--fading")).not.toBeNull();
    feed.destroy();
  });
});

describe("hit marker (task 46)", () => {
  it("flashes on the player's non-lethal strikes only", () => {
    const bus = new CombatEventBus();
    const marker = createHitMarker(bus, { setTimeout: () => 0 });
    document.body.appendChild(marker.root);

    bus.emitStrike({ attackerTeam: 0, victimTeam: 1, fromDirection: { x: 0, z: 1 }, killed: false });
    expect(document.querySelector(".hud-hitmarker--show")).not.toBeNull();

    document.querySelector(".hud-hitmarker")?.classList.remove("hud-hitmarker--show");
    bus.emitStrike({ attackerTeam: 0, victimTeam: 1, fromDirection: { x: 0, z: 1 }, killed: true });
    expect(document.querySelector(".hud-hitmarker--show")).toBeNull();

    bus.emitStrike({ attackerTeam: 1, victimTeam: 0, fromDirection: { x: 0, z: 1 }, killed: false });
    expect(document.querySelector(".hud-hitmarker--show")).toBeNull();
    marker.destroy();
  });
});

describe("kill confirm (task 47)", () => {
  it("flashes the skull on player kills, never on enemy kills", () => {
    const bus = new CombatEventBus();
    const confirm = createKillConfirm(bus, { setTimeout: () => 0 });
    document.body.appendChild(confirm.root);

    bus.emitKill({ victimTeam: 1, killerTeam: 0 });
    expect(document.querySelector(".hud-killconfirm--show")).not.toBeNull();

    document.querySelector(".hud-killconfirm")?.classList.remove("hud-killconfirm--show");
    bus.emitKill({ victimTeam: 0, killerTeam: 1 });
    expect(document.querySelector(".hud-killconfirm--show")).toBeNull();
    confirm.destroy();
  });
});

describe("combo counter (task 48)", () => {
  it("names double and triple kills and counts beyond", () => {
    let t = 1000;
    const bus = new CombatEventBus();
    const combo = createComboCounter(bus, { now: () => t });
    document.body.appendChild(combo.root);

    bus.emitKill({ victimTeam: 1, killerTeam: 0 });
    expect((document.querySelector(".hud-combo") as HTMLElement | null)?.hidden).toBe(true);

    bus.emitKill({ victimTeam: 1, killerTeam: 0 });
    expect(document.querySelector(".hud-combo__label")?.textContent).toBe("Double kill");

    bus.emitKill({ victimTeam: 1, killerTeam: 0 });
    expect(document.querySelector(".hud-combo__label")?.textContent).toBe("Triple kill");

    bus.emitKill({ victimTeam: 1, killerTeam: 0 });
    expect(document.querySelector(".hud-combo__label")?.textContent).toBe("4 kills");
    combo.destroy();
  });

  it("drops kills older than the window and ignores enemy kills", () => {
    let t = 0;
    const bus = new CombatEventBus();
    const combo = createComboCounter(bus, { now: () => t, windowMs: 10_000 });
    document.body.appendChild(combo.root);

    bus.emitKill({ victimTeam: 1, killerTeam: 0 });
    bus.emitKill({ victimTeam: 1, killerTeam: 0 });
    expect((document.querySelector(".hud-combo") as HTMLElement | null)?.hidden).toBe(false);

    t = 10_001;
    bus.emitKill({ victimTeam: 0, killerTeam: 1 });
    bus.emitKill({ victimTeam: 1, killerTeam: 0 });
    // Only one player kill inside the window: the counter hides.
    expect((document.querySelector(".hud-combo") as HTMLElement | null)?.hidden).toBe(true);
    combo.destroy();
  });
});

describe("damage direction (task 45)", () => {
  it("points the arc at the attacker in screen space", () => {
    const bus = new CombatEventBus();
    // Attacker straight ahead in world (+z); camera yaw 0.
    const dir = createDamageDirection(bus, () => 0, { setTimeout: () => 0 });
    document.body.appendChild(dir.root);

    bus.emitStrike({ attackerTeam: 1, victimTeam: 0, fromDirection: { x: 0, z: 1 }, killed: false });
    const arc = document.querySelector<HTMLElement>(".hud-dmgdir__arc");
    expect(document.querySelector(".hud-dmgdir--show")).not.toBeNull();
    expect(arc?.style.transform).toBe("rotate(0deg)");

    // Same world hit, camera turned 90°: the arc swings with it.
    dir.destroy();
    const dir2 = createDamageDirection(bus, () => Math.PI / 2, { setTimeout: () => 0 });
    document.body.appendChild(dir2.root);
    bus.emitStrike({ attackerTeam: 1, victimTeam: 0, fromDirection: { x: 0, z: 1 }, killed: false });
    const arc2 = document.querySelector<HTMLElement>(".hud-dmgdir__arc");
    expect(arc2?.style.transform).toBe("rotate(-90deg)");
    dir2.destroy();
  });

  it("ignores strikes against the enemy", () => {
    const bus = new CombatEventBus();
    const dir = createDamageDirection(bus, () => 0, { setTimeout: () => 0 });
    document.body.appendChild(dir.root);

    bus.emitStrike({ attackerTeam: 0, victimTeam: 1, fromDirection: { x: 0, z: 1 }, killed: false });
    expect(document.querySelector(".hud-dmgdir--show")).toBeNull();
    dir.destroy();
  });
});

describe("low-health warning (task 33)", () => {
  it("pulses below the threshold and stays quiet otherwise", () => {
    let fraction: number | null = 0.5;
    const warn = createLowHealthWarning(() => fraction, {
      setInterval: () => 0,
      clearInterval: () => {},
    });
    document.body.appendChild(warn.root);
    expect(document.querySelector(".hud-lowhp--show")).toBeNull();

    fraction = 0.2;
    // Re-check by rebuilding: the poll runs on its own interval in production.
    warn.destroy();
    const warn2 = createLowHealthWarning(() => fraction, {
      setInterval: () => 0,
      clearInterval: () => {},
    });
    document.body.appendChild(warn2.root);
    expect(document.querySelector(".hud-lowhp--show")).not.toBeNull();

    fraction = null;
    warn2.destroy();
    const warn3 = createLowHealthWarning(() => fraction, {
      setInterval: () => 0,
      clearInterval: () => {},
    });
    document.body.appendChild(warn3.root);
    // No report is not an emergency.
    expect(document.querySelector(".hud-lowhp--show")).toBeNull();
    warn3.destroy();
  });
});

describe("selected unit panel (task 35)", () => {
  it("lists selected units with side, state and health", () => {
    let units: SelectedUnit[] = [];
    const panel = createSelectedUnitPanel({ onSelection: (fn) => { fn(units); return () => {}; } });
    document.body.appendChild(panel.root);
    expect(document.querySelector(".hud-selunit__empty")).not.toBeNull();

    units = [
      { team: 0, state: "attacking", health: 75, maxHealth: 100 },
      { team: 1, state: "idle", health: 10, maxHealth: 100 },
    ];
    const panel2 = createSelectedUnitPanel({
      onSelection: (fn) => { fn(units); return () => {}; },
    });
    document.body.appendChild(panel2.root);
    const items = panel2.root.querySelectorAll(".hud-selunit__item");
    expect(items).toHaveLength(2);
    const first = items[0] as HTMLElement;
    const second = items[1] as HTMLElement;
    expect(first.className).toMatch(/ally/);
    expect(second.className).toMatch(/enemy/);
    expect(first.textContent).toMatch(/attacking/);
    const bar = second.querySelector<HTMLElement>(".hud-selunit__bar");
    expect(bar?.style.width).toBe("10%");
    panel.destroy();
    panel2.destroy();
  });
});
