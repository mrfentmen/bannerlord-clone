/**
 * Border incident responses (Rowan solo task 89).
 *
 * Border incidents — a skirmish, a seized caravan, a burned farm — each
 * offer three responses: retaliate, protest, or overlook. Each response
 * shifts relations and carries a risk, resolved deterministically from a
 * seed. Pure model.
 */

export type BorderIncidentKind = "skirmish" | "seized-caravan" | "burned-farm";

export const BORDER_INCIDENT_KINDS: BorderIncidentKind[] = ["skirmish", "seized-caravan", "burned-farm"];

export type IncidentResponse = "retaliate" | "protest" | "overlook";

export const INCIDENT_RESPONSES: IncidentResponse[] = ["retaliate", "protest", "overlook"];

export interface BorderIncident {
  id: string;
  kind: BorderIncidentKind;
  factionId: string;
  factionName: string;
  description: string;
}

export interface IncidentResolution {
  response: IncidentResponse;
  /** Relation delta with the faction. */
  relationDelta: number;
  /** War risk added 0..20. */
  warRisk: number;
  line: string;
}

const KIND_DESCRIPTIONS: Record<BorderIncidentKind, string> = {
  skirmish: "Their patrols crossed the border and bloodied your scouts.",
  "seized-caravan": "Their watch seized one of your caravans at the crossing.",
  "burned-farm": "Raiders burned a border farm and fled back across the line.",
};

export function raiseBorderIncident(
  kind: BorderIncidentKind,
  factionId: string,
  factionName: string,
): BorderIncident {
  if (!(BORDER_INCIDENT_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`unknown incident kind: ${kind}`);
  }
  return {
    id: `incident-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    kind,
    factionId,
    factionName,
    description: `${factionName}: ${KIND_DESCRIPTIONS[kind]}`,
  };
}

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function draw(seed: number): number {
  let s = seed >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x21f0aaad);
  s = Math.imul(s ^ (s >>> 15), 0x735a2d97);
  return ((s ^ (s >>> 15)) >>> 0) / 4294967296;
}

/**
 * Respond to an incident. Retaliation hurts relations and risks war;
 * protest is measured; overlooking calms but looks weak. Deterministic
 * from incident + response + seed.
 */
export function respondToIncident(
  incident: BorderIncident,
  response: IncidentResponse,
  seed: number,
): IncidentResolution {
  if (!(INCIDENT_RESPONSES as readonly string[]).includes(response)) {
    throw new Error(`unknown incident response: ${response}`);
  }
  const roll = draw(hash(`${incident.id}:${response}`) ^ (seed >>> 0));
  if (response === "retaliate") {
    const escalates = roll < 0.35;
    return {
      response,
      relationDelta: -15,
      warRisk: escalates ? 20 : 8,
      line: escalates
        ? `You strike back across the border. ${incident.factionName} calls it an act of war.`
        : `You strike back across the border. ${incident.factionName} absorbs the blow and stands down.`,
    };
  }
  if (response === "protest") {
    const heard = roll < 0.6;
    return {
      response,
      relationDelta: heard ? 2 : -5,
      warRisk: 2,
      line: heard
        ? `Your protest is heard. ${incident.factionName} disavows the incident and pays compensation.`
        : `Your protest is ignored. ${incident.factionName} denies everything.`,
    };
  }
  return {
    response,
    relationDelta: 3,
    warRisk: 0,
    line: `You let it pass. The border stays quiet — and ${incident.factionName} notes your patience.`,
  };
}
