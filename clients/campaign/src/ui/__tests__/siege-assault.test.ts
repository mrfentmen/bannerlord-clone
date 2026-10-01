/**
 * @vitest-environment jsdom
 *
 * Siege assault UI: staging panel (camp + equipment), wall/breach state,
 * bombardment progress + ETA, assault launch, defender sorties + gate defence.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  breachEtaSeconds,
  createSiegeAssaultPanel,
  type EquipmentKind,
  type SiegeState,
} from "../siege-assault.js";

function baseState(): SiegeState {
  return {
    phase: "staging",
    tick: 100,
    ticksPerSecond: 20,
    camp: { supplies: 500, suppliesPerTick: -2, troops: 800 },
    equipment: [
      { kind: "ladder", built: 4, building: 1, buildProgress: 0.5 },
      { kind: "catapult", built: 2, building: 0, buildProgress: 0 },
    ],
    walls: [
      { id: "w1", name: "North Wall", integrity: 0.8, breached: false, laddersDeployed: 0, towersDeployed: 0 },
      { id: "w2", name: "East Wall", integrity: 0.0, breached: true, laddersDeployed: 2, towersDeployed: 1 },
    ],
    bombardment: {
      active: false,
      targetSectionId: null,
      progress: 0,
      damagePerTick: 0.001,
    },
    gateIntegrity: 0.9,
    sorties: [],
  };
}

function setup() {
  const calls: {
    build: EquipmentKind[];
    target: (string | null)[];
    deploy: [string, string][];
    assault: string[];
    repel: string[];
  } = { build: [], target: [], deploy: [], assault: [], repel: [] };
  const panel = createSiegeAssaultPanel({
    onBuildEquipment: (kind) => calls.build.push(kind),
    onSetBombardTarget: (id) => calls.target.push(id),
    onDeploy: (sectionId, kind) => calls.deploy.push([sectionId, kind]),
    onLaunchAssault: (sectionId) => calls.assault.push(sectionId),
    onRepelSortie: (id) => calls.repel.push(id),
  });
  document.body.append(panel.root);
  return { panel, calls };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("staging panel (task 78)", () => {
  it("renders camp supplies and troops", () => {
    const { panel } = setup();
    panel.update(baseState());
    expect(panel.root.textContent).toContain("Supplies: 500");
    expect(panel.root.textContent).toContain("Troops: 800");
    panel.destroy();
  });

  it("lists equipment built and fires build actions", () => {
    const { panel, calls } = setup();
    panel.update(baseState());
    expect(panel.root.textContent).toContain("Ladder");
    expect(panel.root.textContent).toContain("Built: 4");
    const buildBtn = panel.root.querySelector('[data-equip="catapult"]') as HTMLButtonElement;
    buildBtn.click();
    expect(calls.build).toEqual(["catapult"]);
    panel.destroy();
  });

  it("shows build progress while equipment is under construction", () => {
    const { panel } = setup();
    panel.update(baseState());
    expect(panel.root.textContent).toContain("Building: 1");
    panel.destroy();
  });
});

describe("wall state (task 78)", () => {
  it("shows integrity percentages and breached badges", () => {
    const { panel } = setup();
    panel.update(baseState());
    const bar = panel.root.querySelector('[data-integrity="80"]');
    expect(bar).not.toBeNull();
    expect(panel.root.textContent).toContain("Breached");
    panel.destroy();
  });
});

describe("bombardment (task 79)", () => {
  it("computes the breach ETA from progress and damage rate", () => {
    const s = baseState();
    s.bombardment = { active: true, targetSectionId: "w1", progress: 0.5, damagePerTick: 0.001 };
    // 0.5 / (0.001 * 20) = 25 seconds.
    expect(breachEtaSeconds(s)).toBe(25);
  });

  it("returns null ETA when bombardment is idle", () => {
    expect(breachEtaSeconds(baseState())).toBeNull();
  });

  it("returns null ETA when the damage rate is zero", () => {
    const s = baseState();
    s.bombardment = { active: true, targetSectionId: "w1", progress: 0.5, damagePerTick: 0 };
    expect(breachEtaSeconds(s)).toBeNull();
  });

  it("renders the progress bar and the ETA text", () => {
    const { panel } = setup();
    const s = baseState();
    s.bombardment = { active: true, targetSectionId: "w1", progress: 0.5, damagePerTick: 0.001 };
    panel.update(s);
    expect(panel.root.querySelector('[data-progress="50"]')).not.toBeNull();
    expect(panel.root.textContent).toContain("Breach ETA 0:25");
    panel.destroy();
  });

  it("selecting a target section fires onSetBombardTarget", () => {
    const { panel, calls } = setup();
    panel.update(baseState());
    const targetBtn = panel.root.querySelector('[data-section="w1"]') as HTMLButtonElement;
    targetBtn.click();
    expect(calls.target).toEqual(["w1"]);
    panel.destroy();
  });

  it("clicking the active target again clears it", () => {
    const { panel, calls } = setup();
    const s = baseState();
    s.bombardment = { active: true, targetSectionId: "w1", progress: 0.2, damagePerTick: 0.001 };
    panel.update(s);
    const targetBtn = panel.root.querySelector('[data-section="w1"]') as HTMLButtonElement;
    expect(targetBtn.getAttribute("aria-pressed")).toBe("true");
    targetBtn.click();
    expect(calls.target).toEqual([null]);
    panel.destroy();
  });
});

describe("assault launch (task 80)", () => {
  it("deploys ladders and towers at wall sections", () => {
    const { panel, calls } = setup();
    panel.update(baseState());
    const ladderBtn = panel.root.querySelector('[data-deploy="ladder"]') as HTMLButtonElement;
    ladderBtn.click();
    const towerBtn = panel.root.querySelector('[data-deploy="tower"]') as HTMLButtonElement;
    towerBtn.click();
    expect(calls.deploy).toEqual([
      ["w1", "ladder"],
      ["w1", "tower"],
    ]);
    panel.destroy();
  });

  it("enables assault only on breached sections", () => {
    const { panel, calls } = setup();
    panel.update(baseState());
    const intactBtn = panel.root.querySelector(
      '[data-assault="launch"][data-section="w1"]',
    ) as HTMLButtonElement;
    const breachedBtn = panel.root.querySelector(
      '[data-assault="launch"][data-section="w2"]',
    ) as HTMLButtonElement;
    expect(intactBtn.disabled).toBe(true);
    expect(breachedBtn.disabled).toBe(false);
    breachedBtn.click();
    expect(calls.assault).toEqual(["w2"]);
    panel.destroy();
  });

  it("shows deployed equipment counts per section", () => {
    const { panel } = setup();
    panel.update(baseState());
    expect(panel.root.textContent).toContain("Ladder (2)");
    expect(panel.root.textContent).toContain("Tower (1)");
    panel.destroy();
  });
});

describe("defender sorties (task 81)", () => {
  function stateWithSortie(): SiegeState {
    const s = baseState();
    s.sorties = [
      { id: "s1", tick: 120, label: "Cavalry sally", strength: 60, repelled: false },
      { id: "s2", tick: 90, label: "Night raid", strength: 25, repelled: true },
    ];
    return s;
  }

  it("lists sorties with tick and strength", () => {
    const { panel } = setup();
    panel.update(stateWithSortie());
    expect(panel.root.textContent).toContain("Cavalry sally");
    expect(panel.root.textContent).toContain("Tick 120");
    expect(panel.root.textContent).toContain("Strength 60");
    panel.destroy();
  });

  it("fires repel for active sorties and marks repelled ones", () => {
    const { panel, calls } = setup();
    panel.update(stateWithSortie());
    const repelBtn = panel.root.querySelector('[data-sortie="s1"]') as HTMLButtonElement;
    repelBtn.click();
    expect(calls.repel).toEqual(["s1"]);
    expect(panel.root.textContent).toContain("Repelled");
    panel.destroy();
  });

  it("renders the gate integrity bar", () => {
    const { panel } = setup();
    panel.update(baseState());
    expect(panel.root.querySelector('[data-integrity="90"]')).not.toBeNull();
    panel.destroy();
  });

  it("shows a quiet empty state when no sorties happened", () => {
    const { panel } = setup();
    panel.update(baseState());
    expect(panel.root.textContent).toContain("No sorties reported.");
    panel.destroy();
  });
});

describe("lifecycle", () => {
  it("updates the phase badge on new state", () => {
    const { panel } = setup();
    const s = baseState();
    panel.update(s);
    expect(panel.root.querySelector(".siege-phase")?.textContent).toBe("Staging");
    s.phase = "bombarding";
    panel.update(s);
    expect(panel.root.querySelector(".siege-phase")?.textContent).toBe("Bombarding");
    panel.destroy();
  });

  it("destroy removes the panel", () => {
    const { panel } = setup();
    panel.update(baseState());
    panel.destroy();
    expect(document.body.innerHTML).toBe("");
  });
});
