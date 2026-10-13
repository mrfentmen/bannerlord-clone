/**
 * Turf war — zone-control rules for gang territory.
 *
 * Ported from `jaydendavisnc/inkwave`'s `zones.js` (MIT): coverage
 * thresholds (take at 80%, neutralize at 40%), hold-countdown scoring,
 * penalty locks on losing a zone, objective rotation between centre and
 * side zones, contest warnings. "Ink coverage" becomes crew presence /
 * tag coverage — gang members standing in a block, or fresh tags, fill
 * the coverage share. Countdown scoring becomes per-block income while
 * held; the penalty becomes the rival's retaliation lock.
 *
 * Pure TypeScript, no engine. The adapter paints presence from live peds
 * and turns `turf:income` events into cash.
 */
import { TURF_CONFIG } from "./config.js";
import type { Rng } from "./borderGrowth.js";

const Z = TURF_CONFIG.zones;

export interface TurfZoneDef {
  id: string;
  /** Simple polygon outline, world metres as [x, z] pairs. */
  poly: Array<[number, number]>;
  kind: "centre" | "side";
}

export interface ZoneState {
  def: TurfZoneDef;
  owner: string | null;
  coverage: Map<string, number>;
  lastWarnAt: number;
}

export type TurfEvent =
  | { type: "zone:captured"; zone: string; owner: string; prev: string | null }
  | { type: "zone:neutralized"; zone: string; prev: string }
  | { type: "zone:contest"; zone: string; holder: string; rival: string; share: number }
  | { type: "turf:income"; team: string; zone: string; amount: number }
  | { type: "turf:penalty"; team: string; penalty: number }
  | { type: "objective:rotated"; zone: string }
  | { type: "turf:end"; winner: string; counts: Record<string, number> };

export class TurfWar {
  private readonly zones: ZoneState[];
  private readonly counts = new Map<string, number>();
  private readonly penalties = new Map<string, number>();
  /** count+penalty when the team took the operational objective from its rival. */
  private readonly startMarks = new Map<string, number>();
  private objective: ZoneState;
  private rotateIn: number;
  private sampleAcc = 0;
  private time = 0;
  private ended = false;
  /** Last crew to hold the operational objective (survives neutral gaps). */
  private lastObjectiveHolder: string | null = null;

  constructor(
    defs: TurfZoneDef[],
    private readonly teams: string[],
    private readonly onEvent: (e: TurfEvent) => void,
    private readonly rng: Rng = { next: () => Math.random() },
  ) {
    if (defs.length === 0) throw new Error("turf war needs at least one zone");
    this.zones = defs.map((def) => ({ def, owner: null, coverage: new Map(), lastWarnAt: -Infinity }));
    for (const t of teams) {
      this.counts.set(t, Z.startCount);
      this.penalties.set(t, 0);
    }
    const centre = this.zones.find((z) => z.def.kind === "centre") ?? this.zones[0]!;
    this.objective = centre;
    this.rotateIn = this.nextRotation();
  }

  /** Crew presence paints coverage: members standing in the zone over dt. */
  presence(teamId: string, x: number, z: number, members: number, dt: number): void {
    this.paint(teamId, x, z, members * Z.presenceRate * dt);
  }

  /** A fresh tag paints a chunk of coverage at once. */
  tag(teamId: string, x: number, z: number): void {
    this.paint(teamId, x, z, Z.tagAmount);
  }

  tick(dt: number): void {
    if (this.ended) return;
    this.time += dt;
    // Coverage decay: tags fade, presence is fleeting.
    for (const z of this.zones) {
      for (const [team, share] of z.coverage) {
        const next = share - Z.decayPerSecond * dt;
        if (next <= 0.001) z.coverage.delete(team);
        else z.coverage.set(team, next);
      }
    }
    this.sampleAcc += dt;
    if (this.sampleAcc >= 1 / Z.sampleHz) {
      this.sampleAcc = 0;
      this.checkZones();
    }
    this.tickCountdown(dt);
    this.rotateIn -= dt;
    if (this.rotateIn <= 0) this.rotate();
  }

  zone(id: string): ZoneState | undefined {
    return this.zones.find((z) => z.def.id === id);
  }

  coverage(zoneId: string, teamId: string): number {
    return this.zone(zoneId)?.coverage.get(teamId) ?? 0;
  }

  owner(zoneId: string): string | null {
    return this.zone(zoneId)?.owner ?? null;
  }

  count(teamId: string): number {
    return this.counts.get(teamId) ?? 0;
  }

  get objectiveZoneId(): string {
    return this.objective.def.id;
  }

  // --- Internals ---------------------------------------------------------------

  private paint(teamId: string, x: number, z: number, amount: number): void {
    const zone = this.zones.find((zone) => insidePoly(zone.def.poly, x, z));
    if (!zone) return;
    // Painting over rival coverage removes it (tags get crossed out).
    for (const [team, share] of zone.coverage) {
      if (team !== teamId) zone.coverage.set(team, Math.max(0, share - amount * 0.75));
    }
    zone.coverage.set(teamId, Math.min(1, (zone.coverage.get(teamId) ?? 0) + amount));
  }

  private checkZones(): void {
    for (const z of this.zones) {
      if (z.owner === null) {
        for (const team of this.teams) {
          if ((z.coverage.get(team) ?? 0) >= Z.takeShare) {
            this.capture(z, team);
            break;
          }
        }
      } else {
        const holder = z.owner;
        for (const team of this.teams) {
          if (team === holder) continue;
          const share = z.coverage.get(team) ?? 0;
          if (share >= Z.neutralizeShare) {
            this.neutralize(z, holder);
            break;
          }
          if (share >= Z.warnShare && this.time - z.lastWarnAt >= Z.warnGap) {
            z.lastWarnAt = this.time;
            this.onEvent({ type: "zone:contest", zone: z.def.id, holder, rival: team, share });
          }
        }
      }
    }
  }

  private capture(zone: ZoneState, team: string): void {
    const prev = zone.owner;
    zone.owner = team;
    // Taking a zone floods it: the other crews have to paint the full
    // neutralize share back. (inkwave's capture flood, minus the GPU.)
    for (const t of this.teams) {
      if (t !== team) zone.coverage.delete(t);
    }
    this.onEvent({ type: "zone:captured", zone: zone.def.id, owner: team, prev });
    if (zone === this.objective) {
      if (prev !== null && prev !== team) {
        // Took the operational objective straight from its holder.
        this.startMarks.set(team, (this.counts.get(team) ?? 0) + (this.penalties.get(team) ?? 0));
        this.applyPenalty(prev);
      } else if (prev === null && this.lastObjectiveHolder !== null && this.lastObjectiveHolder !== team) {
        // Took it after a neutral gap: the last holder still "loses the
        // objective to" the taker (inkwave's penalty rule).
        this.startMarks.set(team, (this.counts.get(team) ?? 0) + (this.penalties.get(team) ?? 0));
        this.applyPenalty(this.lastObjectiveHolder);
      } else {
        this.startMarks.set(team, (this.counts.get(team) ?? 0) + (this.penalties.get(team) ?? 0));
      }
      this.lastObjectiveHolder = team;
    }
  }

  private neutralize(zone: ZoneState, prev: string): void {
    zone.owner = null;
    this.onEvent({ type: "zone:neutralized", zone: zone.def.id, prev });
  }

  private applyPenalty(loser: string): void {
    const start = this.startMarks.get(loser);
    if (start === undefined) return;
    const end = (this.counts.get(loser) ?? 0) + (this.penalties.get(loser) ?? 0);
    const penalty = Math.round(Z.penaltyK * (start - end)) + (start === Z.startCount ? 1 : 0);
    if (penalty > 0) {
      this.penalties.set(loser, (this.penalties.get(loser) ?? 0) + penalty);
      this.onEvent({ type: "turf:penalty", team: loser, penalty });
    }
    this.startMarks.delete(loser);
  }

  private tickCountdown(dt: number): void {
    const holder = this.objective.owner;
    // Per-block income for every held zone.
    for (const z of this.zones) {
      if (z.owner !== null) {
        this.onEvent({
          type: "turf:income",
          team: z.owner,
          zone: z.def.id,
          amount: Z.incomePerSecond * dt,
        });
      }
    }
    if (holder === null) return;
    // The penalty is a lock: holding the objective counts it off before
    // the count moves again.
    const penalty = this.penalties.get(holder) ?? 0;
    if (penalty > 0) {
      this.penalties.set(holder, Math.max(0, penalty - Z.holdRate * dt));
    } else {
      const next = (this.counts.get(holder) ?? 0) - Z.holdRate * dt;
      this.counts.set(holder, Math.max(0, next));
      if (next <= 0) {
        this.ended = true;
        const counts: Record<string, number> = {};
        for (const t of this.teams) counts[t] = this.counts.get(t) ?? 0;
        this.onEvent({ type: "turf:end", winner: holder, counts });
      }
    }
  }

  private rotate(): void {
    this.rotateIn = this.nextRotation();
    if (this.objective.def.kind === "centre") {
      const sides = this.zones.filter((z) => z.def.kind === "side");
      if (sides.length > 0) {
        this.objective = sides[Math.floor(this.rng.next() * sides.length)]!;
        this.onEvent({ type: "objective:rotated", zone: this.objective.def.id });
      }
    } else {
      const centre = this.zones.find((z) => z.def.kind === "centre");
      if (centre && centre !== this.objective) {
        this.objective = centre;
        this.onEvent({ type: "objective:rotated", zone: this.objective.def.id });
      }
    }
  }

  private nextRotation(): number {
    return Z.rotateMin + this.rng.next() * (Z.rotateMax - Z.rotateMin);
  }
}

/** Ray-cast point-in-polygon. */
export function insidePoly(poly: Array<[number, number]>, x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
