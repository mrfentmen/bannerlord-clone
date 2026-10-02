/**
 * @vitest-environment jsdom
 *
 * Tests for the battle UI mount.
 *
 * The mount owns DOM only: every test runs the real `BattleFlow` against a
 * fake `BattleApi` (unreachable = local fallback, refused = recoverable
 * error) and asserts on what the player can see and click — screens,
 * order buttons, mode labels, and the after-action arc.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BattleApiError,
  type BattleApi,
  type BattleOrders,
  type Encounter,
  type EncounterSide,
} from "../index";
import { mountBattleUi, type BattleMount } from "../mount";

const attacker: EncounterSide = {
  partyId: 1,
  name: "Player Warband",
  troops: 100,
  power: 120,
};
const defender: EncounterSide = {
  partyId: 2,
  name: "Rival Gang",
  troops: 80,
  power: 90,
};

function encounter(): Encounter {
  return { id: "enc-1", attacker, defender, status: "pending" };
}

function localSource() {
  return {
    describeEncounter: (a: number, d: number) => ({
      attacker: { ...attacker, partyId: a },
      defender: { ...defender, partyId: d },
    }),
  };
}

function unreachable(what = "The battle server is down."): BattleApiError {
  return new BattleApiError("unreachable", "down", what, 0);
}

/** Every call fails as "server down": the flow must use the local fallback. */
function unreachableApi(): BattleApi {
  const down = async (): Promise<never> => {
    throw unreachable();
  };
  return {
    createEncounter: down,
    listEncounters: down,
    getEncounter: down,
    resolveEncounter: down,
    startBattle: down,
    getBattle: down,
    submitOrders: down,
    endBattle: down,
  };
}


/** Flush pending promise continuations (button handlers are async). */
async function flush(times = 4): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

function query(mount: BattleMount, testId: string): HTMLElement | null {
  return mount.root.querySelector(`[data-testid="${testId}"]`);
}

function click(mount: BattleMount, testId: string): void {
  const el = query(mount, testId);
  expect(el, testId).not.toBeNull();
  (el as HTMLElement).click();
}

const mounts: BattleMount[] = [];
afterEach(() => {
  while (mounts.length > 0) mounts.pop()!.destroy();
});

function makeMount(api: BattleApi, onDone = vi.fn()) {
  const into = document.createElement("div");
  const mount = mountBattleUi({
    apiBaseUrl: "http://127.0.0.1:9",
    playerPartyId: 1,
    local: localSource(),
    api,
    mountInto: into,
    onDone,
  });
  mounts.push(mount);
  return { mount, onDone, into };
}

describe("battle mount", () => {
  it("starts hidden and shows the pre-battle screen when an encounter is adopted", () => {
    const { mount } = makeMount(unreachableApi());
    expect(mount.root.hidden).toBe(true);

    mount.adoptEncounter(encounter());

    expect(mount.root.hidden).toBe(false);
    expect(query(mount, "battle-prebattle")).not.toBeNull();
    expect(mount.root.textContent).toContain("Player Warband");
    expect(mount.root.textContent).toContain("Rival Gang");
    expect(query(mount, "battle-fight")).not.toBeNull();
    expect(query(mount, "battle-autoresolve")).not.toBeNull();
    expect(query(mount, "battle-standdown")).not.toBeNull();
  });

  it("ignores a second encounter while a battle is already active", () => {
    const { mount } = makeMount(unreachableApi());
    mount.adoptEncounter(encounter());
    mount.adoptEncounter({
      ...encounter(),
      id: "enc-2",
      attacker: { ...attacker, name: "Latecomers" },
    });

    expect(mount.root.textContent).toContain("Player Warband");
    expect(mount.root.textContent).not.toContain("Latecomers");
  });

  it("labels the local fallback as a local drill, not a server battle", async () => {
    const { mount } = makeMount(unreachableApi());
    await mount.attack(1, 2);
    await flush();

    const mode = query(mount, "battle-mode");
    expect(mode?.textContent).toContain("Local drill");
    expect(query(mount, "battle-local-note")).not.toBeNull();
    expect(mount.root.textContent).toContain("not the real battle simulation");
  });

  it("fight the battle opens the live view and Advance issues orders", async () => {
    const events: string[] = [];
    const into = document.createElement("div");
    const mount = mountBattleUi({
      apiBaseUrl: "http://127.0.0.1:9",
      playerPartyId: 1,
      local: localSource(),
      api: unreachableApi(),
      mountInto: into,
      onBattleEvent: (e) => events.push(e),
    });
    mounts.push(mount);

    await mount.attack(1, 2);
    await flush();
    click(mount, "battle-fight");
    await flush();

    expect(query(mount, "battle-live")).not.toBeNull();
    for (const id of [
      "battle-order-advance",
      "battle-order-hold",
      "battle-order-retreat",
      "battle-order-focusfire",
    ]) {
      expect(query(mount, id), id).not.toBeNull();
    }

    const before = mount.flow.liveView()?.battle.tick ?? -1;
    click(mount, "battle-order-advance");
    await flush();

    const after = mount.flow.liveView()?.battle.tick ?? -1;
    expect(after).toBe(before + 1);
    expect(events).toContain("order");
  });

  it("auto-resolve reaches after-action and dismiss returns to the campaign", async () => {
    const { mount, onDone } = makeMount(unreachableApi());
    await mount.attack(1, 2);
    await flush();
    click(mount, "battle-autoresolve");
    await flush();

    expect(query(mount, "battle-afteraction")).not.toBeNull();
    expect(query(mount, "battle-result")).not.toBeNull();
    expect(query(mount, "battle-summary")).not.toBeNull();

    click(mount, "battle-dismiss");
    expect(mount.root.hidden).toBe(true);
    expect(mount.flow.phase).toBe("idle");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("after-action shows the recorded aftermath (rival, appraisal)", async () => {
    const { mount } = makeMount(unreachableApi());
    await mount.attack(1, 2);
    await flush();
    click(mount, "battle-autoresolve");
    await flush();

    expect(query(mount, "battle-afteraction")).not.toBeNull();
    const rival = query(mount, "battle-rival");
    expect(rival).not.toBeNull();
    expect(rival!.textContent).toContain("Rival Gang");
  });

  it("stand down closes the overlay without an after-action", async () => {
    const { mount, onDone } = makeMount(unreachableApi());
    await mount.attack(1, 2);
    await flush();
    click(mount, "battle-standdown");

    expect(mount.root.hidden).toBe(true);
    expect(mount.flow.phase).toBe("idle");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("shows a recoverable error when the server refuses orders, with a way back", async () => {
    const base = unreachableApi();
    const api: BattleApi = {
      ...base,
      createEncounter: async () => encounter(),
      startBattle: async () => ({
        id: "b-1",
        encounterId: "enc-1",
        status: "active",
        tick: 0,
        attacker: { partyId: 1, name: "Player Warband", troops: 100, morale: 1 },
        defender: { partyId: 2, name: "Rival Gang", troops: 80, morale: 1 },
      }),
      submitOrders: async () => {
        throw new BattleApiError(
          "denied",
          "refused",
          "The server refused the orders.",
          400,
        );
      },
    };
    const { mount } = makeMount(api);
    mount.adoptEncounter(encounter());
    click(mount, "battle-fight");
    await flush();
    expect(query(mount, "battle-live")).not.toBeNull();

    click(mount, "battle-order-advance");
    await flush();

    expect(query(mount, "battle-error")).not.toBeNull();
    expect(mount.root.textContent).toContain("The server refused the orders.");
    // Back re-renders the current phase: the battle is still live.
    click(mount, "battle-error-back");
    expect(query(mount, "battle-live")).not.toBeNull();
    expect(mount.flow.phase).toBe("live");
  });

  it("destroy removes the overlay and stops the poller", () => {
    const { mount, into } = makeMount(unreachableApi());
    expect(mount.poller.running).toBe(true);
    mount.destroy();
    expect(into.contains(mount.root)).toBe(false);
    expect(mount.poller.running).toBe(false);
    mounts.pop();
  });

  it("orders are posted to the server api when the server answers", async () => {
    const seen: BattleOrders[] = [];
    const base = unreachableApi();
    const api: BattleApi = {
      ...base,
      createEncounter: async () => encounter(),
      startBattle: async () => ({
        id: "b-1",
        encounterId: "enc-1",
        status: "active",
        tick: 0,
        attacker: { partyId: 1, name: "Player Warband", troops: 100, morale: 1 },
        defender: { partyId: 2, name: "Rival Gang", troops: 80, morale: 1 },
      }),
      submitOrders: async (_id, orders) => {
        seen.push(orders);
        return {
          id: "b-1",
          encounterId: "enc-1",
          status: "active",
          tick: 1,
          attacker: { partyId: 1, name: "Player Warband", troops: 98, morale: 0.98 },
          defender: { partyId: 2, name: "Rival Gang", troops: 70, morale: 0.9 },
        };
      },
    };
    const { mount } = makeMount(api);
    mount.adoptEncounter(encounter());
    click(mount, "battle-fight");
    await flush();
    expect(query(mount, "battle-mode")?.textContent).toContain("Live battle");

    click(mount, "battle-order-focusfire");
    await flush();

    expect(seen).toEqual([{ focusFire: true }]);
  });
});
