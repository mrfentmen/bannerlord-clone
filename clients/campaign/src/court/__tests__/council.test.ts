import { describe, expect, it } from "vitest";
import { breakTie, holdVote } from "../council.js";

const council = [
  { id: "c1", name: "Aldric", stance: 0.8 },
  { id: "c2", name: "Bryn", stance: 0.6 },
  { id: "c3", name: "Cid", stance: -0.7 },
  { id: "c4", name: "Dara", stance: -0.5 },
];

describe("council voting (solo task 57)", () => {
  it("records every vote", () => {
    const r = holdVote("war-tax", council, 11);
    expect(r.votes).toHaveLength(4);
    expect(r.note).toBeTruthy();
  });

  it("a supportive council passes", () => {
    const friendly = council.map((c) => ({ ...c, stance: 1 }));
    const r = holdVote("war-tax", friendly, 11);
    expect(r.outcome).toBe("passed");
    expect(r.tie).toBe(false);
  });

  it("a hostile council fails", () => {
    const hostile = council.map((c) => ({ ...c, stance: -1 }));
    const r = holdVote("war-tax", hostile, 11);
    expect(r.outcome).toBe("failed");
  });

  it("ties go to the player", () => {
    // Two strong supporters, two strong opponents, seed chosen for a tie.
    let tied = null;
    for (let seed = 0; seed < 200 && !tied; seed++) {
      const r = holdVote("war-tax", council, seed);
      if (r.tie) tied = r;
    }
    expect(tied).not.toBeNull();
    const decided = breakTie(tied!, "pass");
    expect(decided.outcome).toBe("passed");
    expect(decided.note).toContain("break the tie");
  });

  it("breaking a non-tie throws", () => {
    const r = holdVote("war-tax", council.map((c) => ({ ...c, stance: 1 })), 11);
    expect(() => breakTie(r, "pass")).toThrow("no tie");
  });

  it("is deterministic per seed", () => {
    expect(holdVote("war-tax", council, 11)).toEqual(holdVote("war-tax", council, 11));
  });
});
