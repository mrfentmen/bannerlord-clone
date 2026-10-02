/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  assignNegotiationEnvoy,
  availableNegotiationEnvoys,
  envoyRounds,
  recallNegotiationEnvoy,
  recruitNegotiationEnvoy,
} from "../envoyAssignment.js";

beforeEach(() => localStorage.clear());

describe("envoy assignment (solo task 88)", () => {
  it("speeds up negotiations", () => {
    const envoy = recruitNegotiationEnvoy("Sarella", 6);
    const posting = assignNegotiationEnvoy(envoy.id, "n1", "Peace talks", "Ironhold", 10);
    expect(posting.rounds).toBe(4);
    expect(posting.line).toContain("Sarella");
    expect(availableNegotiationEnvoys()).toHaveLength(0);
  });

  it("never goes below 1 round", () => {
    expect(envoyRounds(5, 10)).toBe(1);
    expect(envoyRounds(5, 0)).toBe(5);
  });

  it("recall frees the envoy", () => {
    const envoy = recruitNegotiationEnvoy("Sarella", 6);
    assignNegotiationEnvoy(envoy.id, "n1", "Peace talks", "Ironhold", 10);
    recallNegotiationEnvoy(envoy.id);
    expect(availableNegotiationEnvoys()).toHaveLength(1);
  });

  it("an envoy takes one posting at a time", () => {
    const envoy = recruitNegotiationEnvoy("Sarella", 6);
    assignNegotiationEnvoy(envoy.id, "n1", "Peace talks", "Ironhold", 10);
    expect(() => assignNegotiationEnvoy(envoy.id, "n2", "Trade deal", "Vex", 8)).toThrow(
      "already assigned",
    );
  });

  it("rejects unknown envoys", () => {
    expect(() => assignNegotiationEnvoy("nope", "n1", "Peace talks", "Ironhold", 10)).toThrow(
      "no envoy",
    );
    expect(() => recallNegotiationEnvoy("nope")).toThrow("no envoy");
  });
});
