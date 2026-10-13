import { describe, expect, it } from "vitest";
import {
  BORDER_INCIDENT_KINDS,
  INCIDENT_RESPONSES,
  raiseBorderIncident,
  respondToIncident,
} from "../borderIncidents.js";

describe("border incident responses (solo task 89)", () => {
  it("raises incidents with descriptions", () => {
    for (const kind of BORDER_INCIDENT_KINDS) {
      const incident = raiseBorderIncident(kind, "f1", "Ironhold");
      expect(incident.description).toContain("Ironhold");
    }
  });

  it("offers three responses", () => {
    expect(INCIDENT_RESPONSES).toHaveLength(3);
  });

  it("retaliation hurts relations and risks war", () => {
    const incident = raiseBorderIncident("skirmish", "f1", "Ironhold");
    const r = respondToIncident(incident, "retaliate", 1);
    expect(r.relationDelta).toBe(-15);
    expect(r.warRisk).toBeGreaterThan(0);
  });

  it("overlooking calms the border", () => {
    const incident = raiseBorderIncident("skirmish", "f1", "Ironhold");
    const r = respondToIncident(incident, "overlook", 1);
    expect(r.relationDelta).toBeGreaterThan(0);
    expect(r.warRisk).toBe(0);
  });

  it("protest can be heard or ignored", () => {
    const incident = raiseBorderIncident("seized-caravan", "f1", "Ironhold");
    const results = new Set(
      Array.from({ length: 20 }, (_, s) => respondToIncident(incident, "protest", s).line),
    );
    expect(results.size).toBeGreaterThan(1);
  });

  it("is deterministic per seed", () => {
    const incident = raiseBorderIncident("skirmish", "f1", "Ironhold");
    expect(respondToIncident(incident, "retaliate", 42)).toEqual(respondToIncident(incident, "retaliate", 42));
  });

  it("rejects unknown kinds and responses", () => {
    expect(() => raiseBorderIncident("nope" as never, "f1", "Ironhold")).toThrow("unknown incident kind");
    const incident = raiseBorderIncident("skirmish", "f1", "Ironhold");
    expect(() => respondToIncident(incident, "nope" as never, 1)).toThrow("unknown incident response");
  });
});
