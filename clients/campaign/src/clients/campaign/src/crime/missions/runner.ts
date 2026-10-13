/**
 * MissionRun — one attempt of one mission.
 *
 * Ported from leonida's `missions/Runner.ts` (MIT; license caveat in
 * `../types.ts`): sequential objectives, mission-wide fail conditions
 * (wasted / busted) and a LIFO `onCleanup` stack that fires on pass, fail
 * *or* abort so spawned guards/vehicles tear down without leaks. Pure
 * enough to drive from vitest with a fake host.
 */
import type { V3 } from "../types.js";
import type { MissionContext, MissionDef, MissionHost, Objective } from "./types.js";

export type RunStatus = "running" | "passed" | "failed" | "aborted";

export class MissionRun implements MissionContext {
  readonly missionId: string;
  reward: number;
  failReason: string | null = null;
  fast: boolean;
  status: RunStatus = "running";
  private objectives: Objective[] = [];
  private index = -1;
  private readonly cleanups: Array<() => void> = [];
  private readonly offs: Array<() => void> = [];
  private started = false;

  constructor(
    readonly host: MissionHost,
    readonly def: MissionDef,
    fast = false,
  ) {
    this.missionId = def.id;
    this.reward = def.reward;
    this.fast = fast;
  }

  fail(reason: string): void {
    if (this.failReason === null) this.failReason = reason;
  }

  onCleanup(fn: () => void): void {
    this.cleanups.push(fn);
  }

  get current(): Objective | null {
    return this.objectives[this.index] ?? null;
  }

  get objectiveIndex(): number {
    return this.index;
  }

  get objectiveCount(): number {
    return this.objectives.length;
  }

  get text(): string {
    return this.current?.text ?? "";
  }

  target(): V3 | null {
    return this.current?.target() ?? null;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.objectives = this.def.build(this);
    this.offs.push(
      this.host.on("player:died", () => this.failNow("wasted")),
      this.host.on("player:busted", () => this.failNow("busted")),
    );
    this.advance();
  }

  /** Steps the current objective; call every fixed update while `status === 'running'`. */
  update(dt: number): void {
    if (this.status !== "running") return;
    const obj = this.current;
    if (!obj) {
      this.finish("passed");
      return;
    }
    let result: ReturnType<Objective["update"]>;
    try {
      result = obj.update(this, dt);
    } catch (err) {
      console.error(`[missions:${this.missionId}] objective ${this.index} threw`, err);
      this.fail("script error");
      result = "failed";
    }
    if (result === "done") {
      this.stopCurrent();
      this.advance();
    } else if (result === "failed") {
      this.failNow(this.failReason ?? "failed");
    }
  }

  /** Debug fast-forward: forces the current objective done and steps once. */
  fastForward(): void {
    const obj = this.current;
    if (!obj || this.status !== "running") return;
    try {
      obj.skip(this);
    } catch (err) {
      console.error(`[missions:${this.missionId}] skip threw`, err);
    }
    this.update(0);
  }

  abort(): void {
    if (this.status !== "running") return;
    this.stopCurrent();
    this.finish("aborted");
  }

  private failNow(reason: string): void {
    if (this.status !== "running") return;
    this.failReason = reason;
    this.stopCurrent();
    this.finish("failed");
  }

  private advance(): void {
    this.index++;
    const obj = this.current;
    if (!obj) {
      this.finish("passed");
      return;
    }
    try {
      obj.start(this);
    } catch (err) {
      console.error(`[missions:${this.missionId}] objective ${this.index} failed to start`, err);
      this.failNow("script error");
    }
  }

  private stopCurrent(): void {
    const obj = this.current;
    if (!obj) return;
    try {
      obj.stop(this);
    } catch (err) {
      console.error(`[missions:${this.missionId}] objective ${this.index} failed to stop`, err);
    }
  }

  private finish(status: RunStatus): void {
    this.status = status;
    this.index = this.objectives.length;
    for (const off of this.offs) off();
    this.offs.length = 0;
    for (let i = this.cleanups.length - 1; i >= 0; i--) {
      try {
        this.cleanups[i]!();
      } catch (err) {
        console.error(`[missions:${this.missionId}] cleanup failed`, err);
      }
    }
    this.cleanups.length = 0;
    if (status === "passed") this.host.addCash(this.reward);
  }
}
