/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { dealMapCandidates, pickMap, tallyVotes } from "../mapVoting.js";
import { h } from "../../ui/dom.js";

describe("skirmish map voting (solo task 33)", () => {
  it("deals three distinct candidates", () => {
    const candidates = dealMapCandidates(42);
    expect(candidates).toHaveLength(3);
    const biomes = candidates.map((c) => c.biome);
    expect(new Set(biomes).size).toBe(3);
  });

  it("is deterministic", () => {
    expect(dealMapCandidates(42)).toEqual(dealMapCandidates(42));
  });

  it("tallies votes for the winner", () => {
    const candidates = dealMapCandidates(42);
    const winner = tallyVotes(candidates, [
      { candidateId: candidates[1]!.id, weight: 2 },
      { candidateId: candidates[0]!.id, weight: 1 },
    ]);
    expect(winner?.id).toBe(candidates[1]!.id);
  });

  it("breaks ties toward the earliest candidate", () => {
    const candidates = dealMapCandidates(42);
    const winner = tallyVotes(candidates, [
      { candidateId: candidates[1]!.id, weight: 1 },
      { candidateId: candidates[0]!.id, weight: 1 },
    ]);
    expect(winner?.id).toBe(candidates[0]!.id);
  });

  it("returns null with no votes", () => {
    expect(tallyVotes(dealMapCandidates(42), [])).toBeNull();
  });

  it("pickMap selects directly", () => {
    const candidates = dealMapCandidates(42);
    expect(pickMap(candidates, candidates[2]!.id)?.id).toBe(candidates[2]!.id);
    expect(pickMap(candidates, "nope")).toBeNull();
  });

  it("vote UI picks the next map", () => {
    const candidates = dealMapCandidates(42);
    const onPick = vi.fn();
    const root = h("div", {});
    for (const c of candidates) {
      const btn = h("button", { type: "button", "data-testid": `vote-${c.id}` }, c.label);
      btn.addEventListener("click", () => onPick(pickMap(candidates, c.id)));
      root.appendChild(btn);
    }
    (root.querySelector('[data-testid="vote-map-1"]') as HTMLButtonElement).click();
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]![0]?.id).toBe("map-1");
  });
});
