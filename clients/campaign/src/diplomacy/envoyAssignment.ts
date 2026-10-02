/**
 * Envoy assignment (Rowan solo task 88).
 *
 * Assign companions as envoys to negotiations: a skilled envoy shortens
 * the rounds a negotiation takes. Envoys are busy while assigned; recall
 * them when done. Persists in localStorage.
 */

export interface NegotiationEnvoy {
  id: string;
  name: string;
  /** 0..10 persuasion skill. */
  skill: number;
  assignedTo: string | null;
}

export interface NegotiationPosting {
  id: string;
  name: string;
  factionName: string;
  /** Rounds the negotiation takes without an envoy. */
  baseRounds: number;
  envoyId: string | null;
  /** Rounds with the envoy's help. */
  rounds: number;
  line: string;
}

const ENVOYS_KEY = "campaign.negotiation-envoys.v1";
const POSTINGS_KEY = "campaign.negotiation-postings.v1";

function loadEnvoys(): NegotiationEnvoy[] {
  try {
    const raw = localStorage.getItem(ENVOYS_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function saveEnvoys(envoys: NegotiationEnvoy[]): void {
  try {
    localStorage.setItem(ENVOYS_KEY, JSON.stringify(envoys));
  } catch {
    // ignore
  }
}

function loadPostings(): NegotiationPosting[] {
  try {
    const raw = localStorage.getItem(POSTINGS_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function savePostings(postings: NegotiationPosting[]): void {
  try {
    localStorage.setItem(POSTINGS_KEY, JSON.stringify(postings));
  } catch {
    // ignore
  }
}

/** Register a companion as an available envoy. */
export function recruitNegotiationEnvoy(name: string, skill: number): NegotiationEnvoy {
  const envoy: NegotiationEnvoy = {
    id: `nenvoy-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    name,
    skill: Math.max(0, Math.min(10, Math.round(skill))),
    assignedTo: null,
  };
  const envoys = loadEnvoys();
  envoys.push(envoy);
  saveEnvoys(envoys);
  return envoy;
}

/** Rounds saved: each skill point cuts one round, minimum 1 round. */
export function envoyRounds(baseRounds: number, skill: number): number {
  return Math.max(1, baseRounds - Math.max(0, Math.min(10, Math.round(skill))));
}

/**
 * Assign an envoy to a negotiation. Returns the posting with the
 * shortened round count. The envoy is busy until recalled.
 */
export function assignNegotiationEnvoy(
  envoyId: string,
  negotiationId: string,
  negotiationName: string,
  factionName: string,
  baseRounds: number,
): NegotiationPosting {
  const envoys = loadEnvoys();
  const envoy = envoys.find((e) => e.id === envoyId);
  if (!envoy) throw new Error(`no envoy: ${envoyId}`);
  if (envoy.assignedTo) throw new Error(`${envoy.name} is already assigned`);
  const rounds = envoyRounds(baseRounds, envoy.skill);
  envoy.assignedTo = negotiationId;
  saveEnvoys(envoys);
  const posting: NegotiationPosting = {
    id: negotiationId,
    name: negotiationName,
    factionName,
    baseRounds,
    envoyId,
    rounds,
    line: `${envoy.name} takes ${negotiationName} with ${factionName}: ${baseRounds} rounds → ${rounds}.`,
  };
  const postings = loadPostings().filter((p) => p.id !== negotiationId);
  postings.push(posting);
  savePostings(postings);
  return posting;
}

/** Recall an envoy, freeing them for the next negotiation. */
export function recallNegotiationEnvoy(envoyId: string): NegotiationEnvoy {
  const envoys = loadEnvoys();
  const envoy = envoys.find((e) => e.id === envoyId);
  if (!envoy) throw new Error(`no envoy: ${envoyId}`);
  envoy.assignedTo = null;
  saveEnvoys(envoys);
  return envoy;
}

/** Available (unassigned) envoys. */
export function availableNegotiationEnvoys(): NegotiationEnvoy[] {
  return loadEnvoys().filter((e) => !e.assignedTo);
}
