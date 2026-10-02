/** Task 100: detection meter, blown cover, and the chase. */

import { describe, expect, it } from "vitest";
import { exfiltrate, layLow, runChase, snoop, startInfiltration } from "../infiltration.js";

describe("infiltration (task 100)", () => {
  it("snooping gathers intel and drains the detection meter", () => {
    let op = startInfiltration("harbor", "dockhand");
    op = snoop(op, 30);
    expect(op.intel).toBe(1);
    expect(op.cover).toBe(70);
    expect(op.status).toBe("active");
  });

  it("laying low rebuilds cover", () => {
    let op = startInfiltration("harbor", "dockhand");
    op = snoop(op, 60);
    op = layLow(op);
    expect(op.cover).toBe(65);
  });

  it("empty meter blows the cover and starts a chase", () => {
    let op = startInfiltration("harbor", "dockhand");
    op = snoop(op, 200);
    expect(op.cover).toBe(0);
    expect(op.status).toBe("chase");
  });

  it("two good chase rounds escape; a bad round burns the agent", () => {
    let op = snoop(startInfiltration("harbor", "dockhand"), 200);
    op = runChase(op, () => 0.1);
    expect(op.status).toBe("chase");
    op = runChase(op, () => 0.1);
    expect(op.status).toBe("escaped");
    let op2 = snoop(startInfiltration("rust", "porter"), 200);
    op2 = runChase(op2, () => 0.9);
    expect(op2.status).toBe("caught");
  });

  it("exfiltrates quietly while under cover", () => {
    const op = exfiltrate(snoop(startInfiltration("harbor", "dockhand"), 10));
    expect(op.status).toBe("escaped");
    expect(op.intel).toBe(1);
  });
});
