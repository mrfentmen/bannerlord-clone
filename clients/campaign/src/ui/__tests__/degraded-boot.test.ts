/**
 * Degraded boot: an unreachable simulation must not white-screen the client.
 *
 * This is a separate file from `provider.test.ts` because it tests the other side of that
 * boundary. `provider.test.ts` asserts that a failure is *reported* well — a plain sentence,
 * a developer detail, a `retryable` flag. This file asserts that the failure is *survivable*:
 * that boot degrades to a screen with a Retry, that Retry asks again, that the app never
 * reaches its fatal screen on this path, and that the offline option shows only what the
 * world files support.
 *
 * The last of those is the one that matters most and the one a test is the only honest way
 * to hold. `CONSTITUTION.md` section 1.1 says real data is the rule and that a gap must be
 * named rather than filled; `DATA-MANIFEST.md` section 1 says the terrain, roads, places
 * and populations are real and that town fields, prices, unrest, rulers and the ledger are
 * the simulation's and are not in any file. A client with no backend is exactly where the
 * temptation is to show a plausible zero, and a test that renders the offline screen and
 * greps its text for the words that would mean a fabricated figure is the enforcement.
 *
 * `main.ts` is not imported here. It is a module of top-level `await` with a side effect
 * on every one of its statements, so the behaviour under test is the two units it is built
 * from — `classifyBootFailure` / `surveyFacts`, and the two panels — plus a small local
 * harness that performs the same read-and-degrade sequence `main.ts` does. The wiring that
 * would let a throw escape is a `throw` that is no longer there, and the proof of that is
 * the runtime screenshot in the lane's report.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest";
import { classifyBootFailure, surveyFacts, UNSURVEYED, type BootFailure } from "../../boot/bootFailure.js";
import { h } from "../dom.js";
import { SimulationUnavailableError } from "../../data/provider.js";
import { degradedBootScreen, type DegradedBootHandle } from "../panels/DegradedBootScreen.js";
import { offlineWorldPanel, type OfflineWorldHandle } from "../panels/OfflineWorldPanel.js";
import type { SimSnapshot, SimulationProvider } from "../../data/types.js";
import type { WorldData, WorldSettlement } from "../../world/types.js";

const noop = (): void => {};
/** One turn of the event loop, which is all a resolved promise needs. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 5));

function visibleText(root: Node): string {
  const out: string[] = [];
  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        const t = child.textContent?.trim() ?? "";
        if (t.length > 0) out.push(t);
      } else if (child.nodeType === 1) {
        walk(child);
      }
    }
  };
  walk(root);
  return out.join(" ");
}

// -- fixtures for the world side ---------------------------------------------

/**
 * A world built the way `load.ts` builds one: two places with Census figures and one with
 * none, which is the shape that matters. Eleven places in the V1 region have no figure, so
 * a world data set with no unsurveyed place is not representative and would let the code
 * under test get away with something.
 */
const PLACES: WorldSettlement[] = [
  {
    id: "39-18000",
    name: "Columbus",
    place: "city",
    lat: 39.98,
    lon: -82.99,
    population: 913_175,
    populationSource: "U.S. Census Bureau, Vintage 2023 sub-county population estimates",
    state: "Ohio",
    stateCode: "OH",
    osmPopulation: null,
  },
  {
    id: "21-46027",
    name: "Lexington-Fayette",
    place: "city",
    lat: 38.04,
    lon: -84.46,
    population: 320_154,
    populationSource: "U.S. Census Bureau, Vintage 2023 sub-county population estimates",
    state: "Kentucky",
    stateCode: "KY",
    osmPopulation: null,
  },
  {
    id: "un-1",
    name: "Uncounted",
    place: "village",
    lat: 38.5,
    lon: -83.1,
    population: null,
    populationSource: null,
    state: null,
    stateCode: null,
    osmPopulation: null,
  },
];

const WORLD = {
  region: { name: "Ohio River Valley", retrieved: "2026-09-30" },
  settlements: PLACES,
  roads: Array.from({ length: 439 }, (_, i) => ({ id: `w${i}` })),
  rail: Array.from({ length: 12 }, (_, i) => ({ id: `r${i}` })),
} as unknown as WorldData;

const FACTS = surveyFacts(WORLD);

// -- the provider, under the two conditions -----------------------------------

function failingProvider(reason: string, detail: string, retryable = true): SimulationProvider {
  return {
    kind: "http",
    label: "Live simulation",
    getSnapshot: async () => {
      throw new SimulationUnavailableError(reason, detail, retryable);
    },
    trade: async () => {
      throw new Error("not reached");
    },
    planMarch: async () => {
      throw new Error("not reached");
    },
    commitMarch: async () => {
      throw new Error("not reached");
    },
    why: async () => {
      throw new Error("not reached");
    },
    subscribeTicks: () => () => {},
  };
}

const REFUSED_LABEL = "The world simulation is not answering. It may not be running.";
const REFUSED_DETAIL = "GET http://127.0.0.1:8080/v1/snapshot threw: TypeError: fetch failed";

const REFUSED = failingProvider(REFUSED_LABEL, REFUSED_DETAIL);

const MALFORMED = failingProvider(
  "The world simulation sent a report this client cannot read, so nothing has been drawn from it.",
  "GET http://127.0.0.1:8080/v1/snapshot returned a snapshot that failed validation: day is not a number",
  false,
);

// =============================================================================
// the failure itself
// =============================================================================

describe("a failed boot is classified into something a player can be shown", () => {
  it("keeps the provider's own sentence and sends the detail to the console", () => {
    const failure = classifyBootFailure(
      new SimulationUnavailableError(
        "The world simulation is not answering. It may not be running.",
        "GET http://127.0.0.1:8080/v1/snapshot threw: TypeError: fetch failed",
      ),
      true,
    );
    expect(failure.playerMessage).toBe("The world simulation is not answering. It may not be running.");
    expect(failure.kind).toBe("unreachable");
    expect(failure.retryable).toBe(true);
    expect(failure.worldAvailable).toBe(true);
  });

  it("calls a 4xx a refusal and a thrown fetch a service that is not there", () => {
    // The distinction decides whether the operator's log needs a status code or a port
    // number, so it is worth carrying rather than flattening to "failed".
    expect(
      classifyBootFailure(new SimulationUnavailableError("No.", "POST /v1/trade -> HTTP 403 Forbidden")).kind,
    ).toBe("refused");
    expect(classifyBootFailure(new SimulationUnavailableError("No.", "GET /v1/snapshot -> HTTP 502 Bad Gateway")).kind).toBe(
      "unreachable",
    );
    expect(classifyBootFailure(new SimulationUnavailableError("No.", "GET /v1/snapshot threw: TypeError")).kind).toBe(
      "unreachable",
    );
  });

  it("says an unreadable reply will not fix itself on retry", () => {
    const failure = classifyBootFailure(
      new SimulationUnavailableError(
        "The world simulation sent a report this client cannot read, so nothing has been drawn from it.",
        "GET /v1/snapshot returned a snapshot that failed validation: day is not a number",
        false,
      ),
    );
    expect(failure.kind).toBe("unreadable");
    expect(failure.retryable).toBe(false);
  });

  it("handles a value that is not an error at all, rather than assuming one", () => {
    // `provider.getSnapshot()` is typed to reject with an Error, but CONSTITUTION.md 1.3
    // treats every external call as untrusted, and a rejected promise carrying a string or
    // a plain object is a real thing a library will do.
    for (const thrown of ["connection refused", { code: "ECONNREFUSED" }, null, 42, undefined]) {
      const failure = classifyBootFailure(thrown, true);
      expect(failure.playerMessage.length).toBeGreaterThan(20);
      expect(failure.developerDetail.length).toBeGreaterThan(0);
      expect(failure.kind).toBe("unknown");
    }
  });

  it("puts no developer string, port, URL or status code on the player-facing sentence", () => {
    const failures = [
      classifyBootFailure(new SimulationUnavailableError("No.", "GET http://127.0.0.1:8080/v1/snapshot -> HTTP 500")),
      classifyBootFailure(new Error("connect ECONNREFUSED 127.0.0.1:8080")),
      classifyBootFailure("socket hang up"),
    ];
    for (const failure of failures) {
      for (const banned of [/127\.0\.0\.1/, /http/i, /ECONN/, /undefined/, /\bNaN\b/, /\bnull\b/, /Error/, /:\d{2,5}\b/]) {
        expect(banned.test(failure.playerMessage), `${banned} reached the player: ${failure.playerMessage}`).toBe(false);
      }
    }
  });

  it("records whether the world itself is available, so the screen can offer the map", () => {
    expect(classifyBootFailure(new Error("x"), true).worldAvailable).toBe(true);
    expect(classifyBootFailure(new Error("x"), false).worldAvailable).toBe(false);
  });
});

// =============================================================================
// the degraded screen
// =============================================================================

function degradedScreen(failure: BootFailure, onRetry = vi.fn(), onLookAtWorld = vi.fn()): {
  handle: DegradedBootHandle;
  onRetry: () => void;
  onLookAtWorld: () => void;
} {
  const retry = vi.fn(onRetry);
  const world = vi.fn(onLookAtWorld);
  const handle = degradedBootScreen({ failure, facts: FACTS, onRetry: retry, onLookAtWorld: world });
  return { handle, onRetry: retry, onLookAtWorld: world };
}

describe("the degraded screen is a screen, not a fatal error", () => {
  it("is not the fatal error screen, which is what a white screen was", () => {
    const { handle } = degradedScreen(classifyBootFailure(new Error("boom"), true));
    expect(handle.root.querySelector("[data-testid='fatal-error']")).toBeNull();
    // The root itself is the region, so the id is on the element rather than inside it.
    expect(handle.root.dataset.testid).toBe("degraded-boot");
  });

  it("says in one sentence that the map loaded and the world did not", () => {
    const { handle } = degradedScreen(classifyBootFailure(new Error("boom"), true));
    expect(handle.root.textContent).toMatch(/map loaded/i);
  });

  it("offers a Retry that calls back, and a way into the world", () => {
    const { handle, onRetry, onLookAtWorld } = degradedScreen(classifyBootFailure(new Error("boom"), true));
    const retry = handle.root.querySelector<HTMLButtonElement>("[data-testid='degraded-boot-error-retry']")!;
    const world = handle.root.querySelector<HTMLButtonElement>("[data-testid='degraded-boot-world-open']")!;
    expect(retry).not.toBeNull();
    expect(world).not.toBeNull();
    retry.click();
    world.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onLookAtWorld).toHaveBeenCalledTimes(1);
  });

  it("names both ways out in words a player can act on (CONSTITUTION.md 1.3)", () => {
    const { handle } = degradedScreen(classifyBootFailure(new Error("boom"), true));
    const retry = handle.root.querySelector("[data-testid='degraded-boot-error-retry']")!;
    const world = handle.root.querySelector("[data-testid='degraded-boot-world-open']")!;
    expect(retry.textContent).toMatch(/simulation/i);
    expect(retry.textContent?.trim().length).toBeGreaterThan(4);
    expect(world.textContent).toMatch(/world/i);
  });

  it("still offers both ways out when the reply was unreadable rather than absent", async () => {
    // A malformed payload is the one failure a retry will not fix, but it is still a
    // recoverable screen: the player may be behind a proxy that mangled the reply, and
    // CONSTITUTION.md 1.3 asks for a way to recover rather than a verdict.
    const boot = await bootedHarness(MALFORMED);
    expect(mustScreen(boot).textContent).toMatch(/cannot read/i);
    const retry = mustScreen(boot).querySelector<HTMLButtonElement>("[data-testid='degraded-boot-error-retry']")!;
    expect(retry.disabled).toBe(false);
    mustScreen(boot).querySelector<HTMLButtonElement>("[data-testid='degraded-boot-world-open']")!.click();
    expect(boot.lookedAtWorld).toBe(true);
    boot.dispose();
  });

  it("draws the status in a glyph and in words, never in colour alone (ART_DIRECTION.md 5.3)", () => {
    const { handle } = degradedScreen(classifyBootFailure(new Error("boom"), true));
    const chip = handle.root.querySelector("[data-testid='degraded-boot-status'] .chip")!;
    expect(chip.getAttribute("role")).toBe("img");
    expect(chip.getAttribute("aria-label")).toBeTruthy();
    expect(chip.querySelector(".chip__glyph")).not.toBeNull();
  });

  it("puts focus on the heading, never on the button that would retry", () => {
    const { handle } = degradedScreen(classifyBootFailure(new Error("boom"), true));
    document.body.appendChild(handle.root);
    return flush().then(() => {
      expect(document.activeElement?.id).toBe("degraded-boot-title");
      handle.root.remove();
    });
  });
});

describe("a retry asks again and cannot be asked twice at once", () => {
  it("re-attempts the read, and disables itself while the second one is in flight", async () => {
    let answer: (v: SimSnapshot) => void = () => {};
    let reads = 0;
    const boot = await bootedHarness({
      ...REFUSED,
      getSnapshot: () => {
        reads += 1;
        if (reads === 1) return Promise.reject(new SimulationUnavailableError(REFUSED_LABEL, REFUSED_DETAIL));
        // Never settles until the test says so, so the waiting state can be inspected.
        return new Promise<SimSnapshot>((r) => (answer = r));
      },
    });
    expect(reads).toBe(1);

    const retry = mustScreen(boot).querySelector<HTMLButtonElement>("[data-testid='degraded-boot-error-retry']")!;
    retry.click();
    await flush();

    expect(reads).toBe(2);
    const waiting = mustScreen(boot).querySelector<HTMLButtonElement>("[data-testid='degraded-boot-error-retry']")!;
    expect(waiting.disabled, "a second press would issue a second identical request").toBe(true);
    expect(waiting.textContent).toMatch(/asking/i);
    // A status line in words, not a spinner (CONSTITUTION.md 3.2).
    expect(mustScreen(boot).querySelector("[data-testid='degraded-boot-waiting']")).not.toBeNull();
    expect(mustScreen(boot).innerHTML).not.toMatch(/spinner/i);

    answer({} as SimSnapshot);
    await flush();
    // A successful retry hands the campaign over rather than re-drawing the failure.
    expect(boot.snapshot).not.toBeNull();
    expect(boot.screen(), "the failure screen is gone once the read succeeds").toBeNull();
    boot.dispose();
  });

  it("re-renders the screen with the new reason when the retry fails too", async () => {
    let reads = 0;
    const boot = await bootedHarness({
      ...REFUSED,
      getSnapshot: async () => {
        reads += 1;
        throw new SimulationUnavailableError(
          reads === 1 ? "The world simulation is not answering." : "The world simulation answered, but with something this client cannot read.",
          reads === 1
            ? "GET /v1/snapshot -> HTTP 503 Service Unavailable"
            : "GET /v1/snapshot returned a snapshot that failed validation: eraTier is not one of 1, 2, 3 or 4",
          reads > 1 ? false : true,
        );
      },
    });

    mustScreen(boot).querySelector<HTMLButtonElement>("[data-testid='degraded-boot-error-retry']")!.click();
    await flush();

    expect(reads).toBe(2);
    expect(mustScreen(boot).querySelector("[data-testid='fatal-error']"), "a failed retry must not be fatal").toBeNull();
    expect(visibleText(mustScreen(boot))).toMatch(/cannot read/i);
    // And the retry button is live again, because the player may start the service now.
    expect(mustScreen(boot).querySelector<HTMLButtonElement>("[data-testid='degraded-boot-error-retry']")!.disabled).toBe(false);
    boot.dispose();
  });

  it("still offers the world after a failed retry", async () => {
    const boot = await bootedHarness({ ...REFUSED });
    mustScreen(boot).querySelector<HTMLButtonElement>("[data-testid='degraded-boot-error-retry']")!.click();
    await flush();
    mustScreen(boot).querySelector<HTMLButtonElement>("[data-testid='degraded-boot-world-open']")!.click();
    expect(boot.lookedAtWorld).toBe(true);
    boot.dispose();
  });
});

// =============================================================================
// the sequence, end to end, with nothing escaping
// =============================================================================

/** The harness's screen, asserted present. Every test below expects a failure on it. */
function mustScreen(boot: BootedHarness): HTMLElement {
  const screen = boot.screen();
  expect(screen, "expected a failure screen on display").not.toBeNull();
  return screen!;
}

interface BootedHarness {
  /**
   * The node currently on screen, or `null` once the boot succeeded and the failure
   * screen has been taken down — which is itself the assertion a retry test wants to make.
   */
  screen(): HTMLElement | null;
  snapshot: SimSnapshot | null;
  lookedAtWorld: boolean;
  dispose(): void;
}

/**
 * The read-and-degrade sequence `main.ts` performs, with the screen handling.
 *
 * Returning rather than throwing on failure is the behaviour under test, so this is
 * written the way `main.ts` now writes it: one `try`, no rethrow, the outcome is the
 * degraded screen, and the retry callback re-reads and rebuilds rather than throwing. A
 * version that rethrows — the code as it was — fails these tests the moment it is written
 * that way, which is the reason for having it here at all. `main.ts` itself is not
 * imported because it is a module of top-level `await` with a side effect on every
 * statement; the throw that used to escape it is simply no longer written.
 */
async function bootedHarness(provider: SimulationProvider): Promise<BootedHarness> {
  let snapshot: SimSnapshot | null = null;
  let handle: DegradedBootHandle | null = null;
  let failure: BootFailure | null = null;
  let lookedAtWorld = false;
  const mounted = h("div", {});
  document.body.appendChild(mounted);

  function show(): void {
    if (!failure) return;
    handle = degradedBootScreen({
      failure,
      facts: FACTS,
      onRetry: () => void retry(),
      onLookAtWorld: () => {
        lookedAtWorld = true;
      },
    });
    mounted.replaceChildren(handle.root);
  }

  async function retry(): Promise<void> {
    handle?.setRetrying(true);
    try {
      snapshot = await provider.getSnapshot();
    } catch (err) {
      const again = classifyBootFailure(err, true);
      console.error(`[campaign-client] test: the retry did not answer: ${again.developerDetail}`);
      handle?.root.remove();
      failure = again;
      show();
      return;
    }
    handle?.setRetrying(false);
    handle?.root.remove();
    handle = null;
    failure = null;
  }

  try {
    snapshot = await provider.getSnapshot();
  } catch (err) {
    failure = classifyBootFailure(err, true);
    console.error(`[campaign-client] test: ${failure.developerDetail}`);
    show();
  }

  return {
    screen: () => (mounted.firstElementChild as HTMLElement | null),
    get snapshot() {
      return snapshot;
    },
    get lookedAtWorld() {
      return lookedAtWorld;
    },
    dispose: () => mounted.remove(),
  };
}

// =============================================================================
// the offline world: real data only
// =============================================================================

describe("the world without a simulation shows only what the world files support", () => {
  function panel(places = PLACES, onSelect = vi.fn(), onRetry = vi.fn()): {
    handle: OfflineWorldHandle;
    onSelect: (id: string) => void;
    onRetry: () => void;
  } {
    const select = vi.fn(onSelect);
    const retry = vi.fn(onRetry);
    const handle = offlineWorldPanel({
      facts: surveyFacts({ ...WORLD, settlements: places } as unknown as WorldData),
      places,
      groundAt: () => 1_612,
      onRetry: retry,
      onSelect: select,
    });
    return { handle, onSelect: select, onRetry: retry };
  }

  it("counts the survey correctly and separates the places with no Census figure", () => {
    const facts = surveyFacts(WORLD);
    expect(facts.settlements).toBe(3);
    expect(facts.surveyed).toBe(2);
    // The distinction is the whole point: one number for "places" would claim the
    // uncounted place has a population, which is the invented figure 1.1 forbids.
    expect(facts.unsurveyed).toBe(1);
    expect(facts.roads).toBe(439);
    expect(facts.rail).toBe(12);
  });

  it("reports zero rather than a NaN when there is no world data at all", () => {
    for (const empty of [null, undefined]) {
      const facts = surveyFacts(empty);
      expect(facts.settlements).toBe(0);
      expect(facts.surveyed).toBe(0);
      expect(Number.isNaN(facts.unsurveyed)).toBe(false);
    }
  });

  it("names the systems that are missing instead of showing figures for them", () => {
    const { handle } = panel();
    const text = visibleText(handle.root);
    expect(handle.root.querySelector("[data-testid='offline-world-absent']")).not.toBeNull();
    for (const system of [/prices?/i, /unrest/i, /ledger/i, /cause log/i]) {
      expect(system.test(text), `the missing systems are not named: ${text}`).toBe(true);
    }
    expect(text).toMatch(/rather than inventing one/i);
  });

  it("shows a real population, and the words 'not surveyed' where there is none", () => {
    const { handle } = panel();
    const rows = Array.from(handle.root.querySelectorAll("tbody tr")).map((r) => r.textContent ?? "");
    const columbus = rows.find((r) => r.includes("Columbus"))!;
    const uncounted = rows.find((r) => r.includes("Uncounted"))!;
    expect(columbus).toContain("913,175");
    expect(uncounted).toContain(UNSURVEYED);
    // And no row shows a number where the survey has none.
    expect(uncounted).not.toMatch(/\b0\b/);
  });

  it("puts the places with no figure last, so a zero-sized place is never implied", () => {
    const { handle } = panel();
    const names = Array.from(handle.root.querySelectorAll("tbody tr td:first-child")).map((td) => td.textContent ?? "");
    expect(names[0]).toBe("Columbus");
    expect(names[names.length - 1]).toBe("Uncounted");
  });

  it("shows one place's real record on request, and says what it is not showing", () => {
    const { handle } = panel();
    handle.showPlace(PLACES[2]!); // the uncounted place
    const text = visibleText(handle.root);
    expect(text).toContain("Uncounted");
    expect(text).toContain(UNSURVEYED);
    expect(text).toMatch(/no population figure behind it/i);
    expect(text).toMatch(/simulation/i);
    expect(text).not.toMatch(/\b0 people\b/i);
  });

  it("shows the ground height it was given, which is the terrain's own", () => {
    const { handle } = panel();
    handle.showPlace(PLACES[0]!);
    expect(visibleText(handle.root)).toMatch(/1,612 m/);
  });

  it("omits the ground height rather than printing a zero when the tiles did not decode", () => {
    const handle = offlineWorldPanel({
      facts: FACTS,
      places: PLACES,
      groundAt: () => null,
      onRetry: noop,
      onSelect: noop,
    });
    handle.showPlace(PLACES[0]!);
    expect(visibleText(handle.root)).not.toMatch(/ground here/i);
  });

  it("opens a place from the list through a real button, since the canvas is not in the tab order", () => {
    const { handle, onSelect } = panel();
    const open = handle.root.querySelector<HTMLButtonElement>("[data-testid='offline-place-39-18000']");
    expect(open).not.toBeNull();
    expect(open!.getAttribute("aria-label")).toBeTruthy();
    open!.click();
    expect(onSelect).toHaveBeenCalledWith("39-18000");
  });

  it("offers a retry from the offline view, because the service may come back", () => {
    const { handle, onRetry } = panel();
    handle.root.querySelector<HTMLButtonElement>("[data-testid='offline-retry']")!.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("carries no placeholder, developer or banned copy (CONSTITUTION.md 3.3)", () => {
    const { handle } = panel();
    handle.showPlace(PLACES[2]!);
    const offenders: string[] = [];
    for (const line of visibleText(handle.root).split(/(?<=\.)\s+/)) {
      for (const pattern of [
        /\bTODO\b/,
        /\bFIXME\b/,
        /placeholder/i,
        /\bundefined\b/,
        /\bNaN\b/,
        /\bnull\b/,
        /\bSomething went wrong\b/i,
        /\bOops\b/,
      ]) {
        if (pattern.test(line)) offenders.push(`${pattern} in "${line}"`);
      }
    }
    expect(offenders, `banned copy: ${offenders.join("; ")}`).toHaveLength(0);
  });

  it("gives every control on both degraded screens an accessible name (UI_UX.md 12)", () => {
    const degraded = degradedScreen(classifyBootFailure(new Error("boom"), true));
    const offlinePanel = panel().handle;
    offlinePanel.showPlace(PLACES[0]!);
    for (const root of [degraded.handle.root, offlinePanel.root]) {
      for (const el of Array.from(root.querySelectorAll("button, input, select"))) {
        const name = el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "";
        expect(name.length, `<${el.tagName.toLowerCase()}> with no accessible name`).toBeGreaterThan(0);
      }
    }
  });
});

// =============================================================================
// the fixture quarantine, from this lane's side
// =============================================================================

describe("the degraded path cannot reach the fixture", () => {
  it("names no fixture module in any file the degraded path is built from", async () => {
    // Read from the project root: jsdom rewrites `import.meta.url`, so a URL relative to
    // this module does not survive the environment switch.
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    for (const file of ["src/boot/bootFailure.ts", "src/ui/panels/DegradedBootScreen.ts", "src/ui/panels/OfflineWorldPanel.ts"]) {
      const text = await readFile(join(process.cwd(), file), "utf8");
      expect(text, `${file} imports the fixture`).not.toMatch(/from\s+"[^"]*fixture/);
      expect(text, `${file} names a fixture marker`).not.toMatch(/FIXTURE|TOWN_SPECS|mulberry32|FixtureState/);
    }
  });
});
