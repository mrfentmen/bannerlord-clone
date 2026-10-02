/** Task 118: the militia queue completes over days. */

import { describe, expect, it } from "vitest";
import { createMilitiaQueue, queueMilitia, tickMilitia } from "../militia.js";

describe("militia training queue (task 118)", () => {
  it("completes a batch after its training days", () => {
    const q = createMilitiaQueue();
    queueMilitia(q, 20, 3);
    expect(tickMilitia(q)).toHaveLength(0);
    expect(tickMilitia(q)).toHaveLength(0);
    const done = tickMilitia(q);
    expect(done).toHaveLength(1);
    expect(q.ready).toBe(20);
    expect(q.batches).toHaveLength(0);
  });

  it("processes batches independently", () => {
    const q = createMilitiaQueue();
    queueMilitia(q, 10, 1);
    queueMilitia(q, 15, 2);
    tickMilitia(q);
    expect(q.ready).toBe(10);
    expect(q.batches).toHaveLength(1);
    tickMilitia(q);
    expect(q.ready).toBe(25);
  });
});
