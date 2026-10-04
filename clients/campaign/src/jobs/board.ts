/**
 * Jobs board — the two-track work system (§24 of the pull list).
 *
 * **Gang jobs** (per gang, per city — reputation-gated): drug runs,
 * protection collection, hits, boosting cars, lookout work. They pay
 * cash + gang rep and raise police heat — the dirty-money path.
 *
 * **Civilian jobs** (per city, tied to its income identity): dockworker,
 * trucker, bouncer, taxi driver, warehouse shift, farmhand. Clean money,
 * small rep with the employer business, no heat.
 *
 * Both tracks are `MissionDef`s so the runner, HUD and cleanup machinery
 * are shared with heists and bounties. `JobSpots` carries the world
 * positions the adapter resolves from the city layout.
 */
import type { V3 } from "../crime/types.js";
import {
  action,
  custom,
  escapeWanted,
  goto,
  holdPosition,
  survive,
  timed,
} from "../crime/missions/objectives.js";
import type { MissionContext, MissionDef, MissionHost } from "../crime/missions/types.js";

export type JobKind = "gang" | "civilian";

export interface JobDef extends MissionDef {
  kind: JobKind;
  cityId: string;
  /** Gang jobs only. */
  gangId?: string;
  /** Employer id for civilian rep (business id) or gang id. */
  employerId: string;
  minRep: number;
  payMin: number;
  payMax: number;
  repGain: number;
  heatGain: number;
}

/** Named world positions the adapter resolves per city. */
export type JobSpots = Record<string, V3>;

function spot(spots: JobSpots, name: string): V3 {
  return spots[name] ?? { x: 0, y: 0, z: 0 };
}

function payRoll(ctx: MissionContext, job: JobDef): void {
  // Roll from the clock so replays of the same job pay differently.
  const t = Math.floor(ctx.host.now() * 1000);
  const span = job.payMax - job.payMin + 1;
  ctx.reward = job.payMin + (Math.abs((t * 2654435761) % 2147483647) % span);
}

function completeJob(job: JobDef): (ctx: MissionContext) => void {
  return (ctx) => {
    payRoll(ctx, job);
    ctx.host.addRep(job.employerId, job.repGain);
    if (job.heatGain > 0) ctx.host.addHeat(job.heatGain);
    ctx.host.notify(`Job done: ${job.name} — $${ctx.reward}`, "success");
  };
}

interface JobSpec {
  id: string;
  kind: JobKind;
  name: string;
  description: string;
  employerId: string;
  minRep: number;
  payMin: number;
  payMax: number;
  repGain: number;
  heatGain: number;
  contactSpot: string;
  build: (spots: JobSpots, job: JobDef) => MissionDef["build"];
}

// The spec table is data; `JobsBoard` binds it to a city's spots and gang.
const JOB_SPECS: JobSpec[] = [
  {
    id: "drug-run",
    kind: "gang",
    name: "Drug Run",
    description: "Drive the package across town. Don't get searched.",
    employerId: "",
    minRep: 0,
    payMin: 800,
    payMax: 1500,
    repGain: 5,
    heatGain: 8,
    contactSpot: "gang_hq",
    build: (spots, job) => () => {
      const pickup = spot(spots, "drug_pickup");
      const dropoff = spot(spots, "drug_dropoff");
      return [
        goto(pickup, 5, "Pick up the package"),
        holdPosition(() => pickup, 4, 5, "Load the package"),
        timed(goto(dropoff, 6, "Deliver the package — stay clean"), 240, "the buyer walked"),
        action(completeJob(job)),
      ];
    },
  },
  {
    id: "protection",
    kind: "gang",
    name: "Protection Collection",
    description: "Visit the fronts. Remind them who keeps the street safe.",
    employerId: "",
    minRep: 5,
    payMin: 600,
    payMax: 1000,
    repGain: 4,
    heatGain: 4,
    contactSpot: "gang_hq",
    build: (spots, job) => () => {
      const fronts = [spot(spots, "front_1"), spot(spots, "front_2"), spot(spots, "front_3")];
      const legs = fronts.flatMap((f, i) => [
        goto(f, 5, `Collect from front ${i + 1}/3`),
        holdPosition(() => f, 4, 5, "Lean on the owner"),
      ]);
      return [...legs, action(completeJob(job))];
    },
  },
  {
    id: "hit",
    kind: "gang",
    name: "Hit",
    description: "A name, a photo, a last known location. Make it quiet.",
    employerId: "",
    minRep: 20,
    payMin: 2000,
    payMax: 4000,
    repGain: 10,
    heatGain: 15,
    contactSpot: "gang_hq",
    build: (spots, job) => () => {
      const area = spot(spots, "hit_area");
      return [
        goto(area, 12, "Find the mark"),
        custom({
          text: "Eliminate the mark",
          target: () => area,
          start(ctx) {
            ctx.host.notify("The mark is somewhere in the area. Make it quiet.", "warning");
          },
          // The adapter emits `hit:confirmed` when the marked ped dies by the
          // player's hand; the runner fails the mission on `player:busted`.
          update: () => "running",
          stop() {},
        }),
        escapeWanted(180),
        action(completeJob(job)),
      ];
    },
  },
  {
    id: "boost-cars",
    kind: "gang",
    name: "Boost Cars",
    description: "Steal something fast. The chop shop pays by the pound.",
    employerId: "",
    minRep: 10,
    payMin: 1200,
    payMax: 2200,
    repGain: 6,
    heatGain: 6,
    contactSpot: "gang_hq",
    build: (spots, job) => () => {
      const chop = spot(spots, "chop_shop");
      return [
        custom({
          text: "Steal a car",
          start(ctx) {
            ctx.host.notify("Find something worth stealing.", "info");
          },
          update: (ctx) => (ctx.host.playerInVehicle() ? "done" : "running"),
          stop() {},
        }),
        timed(goto(chop, 6, "Deliver it to the chop shop"), 300, "the shop found another supplier"),
        action(completeJob(job)),
      ];
    },
  },
  {
    id: "lookout",
    kind: "gang",
    name: "Lookout",
    description: "Sit on the corner. Phone in hand. Eyes open.",
    employerId: "",
    minRep: 0,
    payMin: 400,
    payMax: 700,
    repGain: 3,
    heatGain: 2,
    contactSpot: "gang_hq",
    build: (spots, job) => () => {
      const corner = spot(spots, "lookout_corner");
      return [
        goto(corner, 5, "Get to the corner"),
        holdPosition(() => corner, 6, 90, "Keep watch"),
        action(completeJob(job)),
      ];
    },
  },
  {
    id: "dockworker",
    kind: "civilian",
    name: "Dockworker Shift",
    description: "Unload the morning freighter. Honest work.",
    employerId: "port_authority",
    minRep: 0,
    payMin: 300,
    payMax: 450,
    repGain: 1,
    heatGain: 0,
    contactSpot: "docks",
    build: (spots, job) => () => {
      const docks = spot(spots, "docks");
      return [
        goto(docks, 6, "Report to the docks"),
        holdPosition(() => docks, 8, 60, "Work the shift"),
        action(completeJob(job)),
      ];
    },
  },
  {
    id: "trucker",
    kind: "civilian",
    name: "Haul Goods",
    description: "Take the load across the city. Keep the schedule.",
    employerId: "haulage_co",
    minRep: 0,
    payMin: 500,
    payMax: 800,
    repGain: 2,
    heatGain: 0,
    contactSpot: "warehouse",
    build: (spots, job) => () => {
      const from = spot(spots, "haul_from");
      const to = spot(spots, "haul_to");
      return [
        goto(from, 6, "Pick up the load"),
        timed(goto(to, 8, "Deliver the load"), 420, "the client cancelled"),
        action(completeJob(job)),
      ];
    },
  },
  {
    id: "bouncer",
    kind: "civilian",
    name: "Bouncer",
    description: "Work the door. Nobody starts anything on your watch.",
    employerId: "club",
    minRep: 0,
    payMin: 350,
    payMax: 500,
    repGain: 2,
    heatGain: 0,
    contactSpot: "club",
    build: (spots, job) => () => {
      const club = spot(spots, "club");
      return [
        goto(club, 5, "Get to the club"),
        survive(120, "Work the door"),
        action(completeJob(job)),
      ];
    },
  },
  {
    id: "taxi",
    kind: "civilian",
    name: "Taxi Shift",
    description: "Fares don't wait. Neither does the meter.",
    employerId: "cab_co",
    minRep: 0,
    payMin: 250,
    payMax: 400,
    repGain: 1,
    heatGain: 0,
    contactSpot: "taxi_stand",
    build: (spots, job) => () => {
      const pickup = spot(spots, "taxi_pickup");
      const dropoff = spot(spots, "taxi_dropoff");
      return [
        goto(pickup, 5, "Pick up the fare"),
        timed(goto(dropoff, 6, "Drop off the fare"), 300, "the fare walked"),
        action(completeJob(job)),
      ];
    },
  },
  {
    id: "warehouse",
    kind: "civilian",
    name: "Warehouse Shift",
    description: "Inventory doesn't count itself.",
    employerId: "warehouse",
    minRep: 0,
    payMin: 280,
    payMax: 400,
    repGain: 1,
    heatGain: 0,
    contactSpot: "warehouse",
    build: (spots, job) => () => {
      const wh = spot(spots, "warehouse");
      return [
        goto(wh, 6, "Report to the warehouse"),
        holdPosition(() => wh, 8, 60, "Work the shift"),
        action(completeJob(job)),
      ];
    },
  },
  {
    id: "farmhand",
    kind: "civilian",
    name: "Farmhand",
    description: "Rural towns run on this work.",
    employerId: "farm",
    minRep: 0,
    payMin: 250,
    payMax: 350,
    repGain: 1,
    heatGain: 0,
    contactSpot: "farm",
    build: (spots, job) => () => {
      const farm = spot(spots, "farm");
      return [
        goto(farm, 8, "Get to the farm"),
        holdPosition(() => farm, 10, 90, "Work the fields"),
        action(completeJob(job)),
      ];
    },
  },
];

export interface BoardJob extends JobDef {
  /** Whether the player's current rep locks this job. */
  locked: boolean;
}

export class JobsBoard {
  private readonly jobs: JobDef[];

  constructor(
    cityId: string,
    private readonly spots: JobSpots,
    gangId?: string,
  ) {
    // Bind each spec to this city's spots and gang. `completeJob` closes
    // over the finished def, so `build` is bound after the def exists.
    this.jobs = JOB_SPECS.map((spec) => {
      const full = {
        id: spec.id,
        kind: spec.kind,
        name: spec.name,
        contact: spec.kind === "gang" ? "Crew" : spec.employerId,
        cityId,
        gangId: spec.kind === "gang" ? gangId : undefined,
        employerId: spec.kind === "gang" ? (gangId ?? "crew") : spec.employerId,
        minRep: spec.minRep,
        payMin: spec.payMin,
        payMax: spec.payMax,
        repGain: spec.repGain,
        heatGain: spec.heatGain,
        position: spot(this.spots, spec.contactSpot),
        reward: spec.payMin,
        repeatable: true,
        build: (_ctx: MissionContext) => [],
      } as JobDef;
      full.build = spec.build(this.spots, full);
      return full;
    });
  }

  /** Jobs the player can see, with lock state from their reputation map. */
  available(rep: (employerId: string) => number): BoardJob[] {
    return this.jobs.map((j) => ({ ...j, locked: rep(j.employerId) < j.minRep }));
  }

  byId(id: string): JobDef | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  get count(): number {
    return this.jobs.length;
  }
}

// Re-export the host type for adapters.
export type { MissionHost };
