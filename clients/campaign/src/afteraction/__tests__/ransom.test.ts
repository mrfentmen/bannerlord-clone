/**
 * Task 71: ransom negotiation — at most 3 rounds of offers.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import {
  RANSOM_MAX_ROUNDS,
  createRansomPanel,
  offerRansom,
  startRansom,
} from "../ransom.js";

describe("ransom negotiation (task 71)", () => {
  it("accepts a bid that meets the demand", () => {
    const neg = startRansom(["c1", "c2"], 100);
    expect(neg.demand).toBe(200);
    const r = offerRansom(neg, 200);
    expect(r).toEqual({ kind: "accepted", paid: 200 });
    expect(neg.status).toBe("accepted");
  });

  it("counters below-demand bids, rising toward the demand", () => {
    const neg = startRansom(["c1"], 100);
    const r1 = offerRansom(neg, 40);
    expect(r1.kind).toBe("counter");
    if (r1.kind === "counter") {
      expect(r1.counter).toBe(70); // halfway between 40 and 100
      expect(r1.round).toBe(2);
    }
  });

  it("walks away after the third rejected offer — never a fourth round", () => {
    expect(RANSOM_MAX_ROUNDS).toBe(3);
    const neg = startRansom(["c1"], 100);
    expect(offerRansom(neg, 10).kind).toBe("counter");
    expect(offerRansom(neg, 10).kind).toBe("counter");
    expect(offerRansom(neg, 10).kind).toBe("walked");
    expect(neg.status).toBe("walked");
    expect(offerRansom(neg, 1000).kind).toBe("closed");
  });

  it("ignores non-positive bids without consuming a round", () => {
    const neg = startRansom(["c1"], 100);
    offerRansom(neg, 0);
    offerRansom(neg, -5);
    expect(neg.round).toBe(1);
    expect(neg.offers).toHaveLength(0);
  });
});

describe("ransom panel (task 71)", () => {
  it("reports acceptance and walk-away through the callbacks", () => {
    const neg = startRansom(["c1"], 100);
    let paid = 0;
    let walked = 0;
    const panel = createRansomPanel(neg, {
      onAccepted: (p) => (paid = p),
      onWalkedAway: () => (walked += 1),
    });
    document.body.append(panel.root);
    try {
      const input = panel.root.querySelector(".aa-ransom-bid") as HTMLInputElement;
      const send = panel.root.querySelector(".aa-ransom-row .btn") as HTMLButtonElement;
      input.value = "30";
      send.click();
      send.click();
      input.value = "30";
      send.click();
      expect(walked).toBe(1);
      expect(paid).toBe(0);
      expect(panel.root.textContent).toContain("walks away");
    } finally {
      panel.destroy();
    }

    const neg2 = startRansom(["c1"], 100);
    const panel2 = createRansomPanel(neg2, {
      onAccepted: (p) => (paid = p),
      onWalkedAway: () => (walked += 1),
    });
    document.body.append(panel2.root);
    try {
      const input = panel2.root.querySelector(".aa-ransom-bid") as HTMLInputElement;
      const send = panel2.root.querySelector(".aa-ransom-row .btn") as HTMLButtonElement;
      input.value = "100";
      send.click();
      expect(paid).toBe(100);
      expect(walked).toBe(1);
    } finally {
      panel2.destroy();
    }
  });
});
