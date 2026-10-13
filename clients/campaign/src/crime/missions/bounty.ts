/**
 * Bounty hunting — built from parts, per the honest finding in
 * `docs/BUFFY_PULL_LIST.md` §28: no permissively-licensed bounty system
 * exists anywhere (every implementation is GPL/unlicensed FiveM Lua), so
 * this is assembled from the pulled pieces:
 *
 * - mission framework + job-board loop (`missions/`): availability gate →
 *   contact marker → objective array → reward → `repeatable`.
 * - `timed()` for the capture window; `custom()` + `waitForEvent()` for
 *   the "target flees" branch; capture-or-kill as a custom objective.
 * - reputation→payout curve from `liberty-drive`'s `syndicate.js` (MIT,
 *   in the agent report): `floor((baseReward + reputation × 12) × timeBonusRatio)`.
 * - tracking: the target's last-known position updates over events, the
 *   way a cop's `MemoryRecord.lastSensedPosition` works (yuka, MIT).
 */
import type { V3 } from "../types.js";
import { action, custom, goto, timed } from "./objectives.js";
import type { MissionContext, MissionDef } from "./types.js";

export interface BountyTarget {
  id: string;
  name: string;
  /** Last known position — the opening lead. */
  lastKnown: V3;
  baseReward: number;
  /** "alive": killing the target fails the contract. */
  deadOrAlive: "dead-or-alive" | "alive";
  /** Player reputation with the issuing fixer (for the payout curve). */
  reputation: () => number;
}

/**
 * Payout curve from libertydrive's syndicate.js (MIT).
 * Faster, cleaner captures pay more; reputation raises the floor.
 */
export function bountyPayout(baseReward: number, reputation: number, timeBonusRatio: number): number {
  return Math.floor((baseReward + reputation * 12) * timeBonusRatio);
}

const CAPTURE_WINDOW = 300; // seconds

export function bountyContract(target: BountyTarget): MissionDef {
  return {
    id: `bounty-${target.id}`,
    name: `Bounty: ${target.name}`,
    contact: "Fixer",
    position: target.lastKnown,
    reward: target.baseReward,
    repeatable: true,
    build() {
      let targetPos: V3 = { ...target.lastKnown };
      let captured = false;
      let killed = false;
      let off: (() => void) | null = null;
      const windowStart = { t: 0 };

      const trackTarget = custom({
        text: `Track ${target.name} — follow the leads`,
        target: () => ({ ...targetPos }),
        start(ctx) {
          off = ctx.host.on("bounty:located", (data) => {
            const x = data?.["x"];
            const z = data?.["z"];
            if (typeof x === "number" && typeof z === "number") {
              targetPos = { x, y: targetPos.y, z };
              ctx.host.notify("New lead on the target's position", "info");
            }
          });
        },
        update(ctx) {
          const p = ctx.host.playerPosition();
          const d = Math.hypot(p.x - targetPos.x, p.z - targetPos.z);
          return d <= 25 ? "done" : "running";
        },
        skip() {},
        stop() {
          off?.();
          off = null;
        },
      });

      const takeDown = custom({
        text:
          target.deadOrAlive === "alive"
            ? `Bring ${target.name} in alive`
            : `Take ${target.name} down — dead or alive`,
        target: () => ({ ...targetPos }),
        start(ctx) {
          windowStart.t = ctx.host.now();
          const off2 = ctx.host.on("bounty:captured", () => {
            captured = true;
          });
          const off3 = ctx.host.on("bounty:killed", () => {
            killed = true;
          });
          ctx.onCleanup(() => {
            off2();
            off3();
          });
        },
        update(ctx) {
          if (captured) return "done";
          if (killed) {
            if (target.deadOrAlive === "alive") {
              ctx.fail("the target is dead — the contract wanted them alive");
              return "failed";
            }
            return "done";
          }
          return "running";
        },
        skip() {
          captured = true;
        },
        stop() {},
      });

      return [
        goto(target.lastKnown, 10, `Pick up ${target.name}'s trail`),
        trackTarget,
        timed(takeDown, CAPTURE_WINDOW, "the target slipped the net"),
        action((ctx: MissionContext) => {
          const elapsed = ctx.host.now() - windowStart.t;
          const ratio = Math.max(0.25, Math.min(1.5, 1.5 - elapsed / CAPTURE_WINDOW));
          const rep = target.reputation();
          const base = killed && !captured ? target.baseReward / 2 : target.baseReward;
          ctx.reward = bountyPayout(base, rep, ratio);
          ctx.host.notify(
            captured ? "Target delivered. The fixer pays." : "Target down. The fixer pays half.",
            "success",
          );
        }),
      ];
    },
  };
}
