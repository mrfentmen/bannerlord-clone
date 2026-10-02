/**
 * Task 79: MVP unit highlight.
 *
 * The report already names the MVP unit *kind* — `report.mvp`, picked from the
 * per-kind kill table. The sim's own citation is finer and richer: the soldier,
 * their damage, and how much of the unit came back alive
 * (`battleflow/mvp.ts`). This module puts that citation in front of the player:
 * the leader highlighted, the rest of the field listed underneath it, so the
 * highlight is a ranking the player can check rather than an assertion.
 *
 * The types come from `battleflow/mvp.ts` as a type-only import, and the citation
 * itself is passed in rather than recomputed here. The sim owns the scoring rule
 * (kills, then damage, then survival); copying those weights would let the two
 * disagree, and a report that highlights one soldier while the citation names
 * another is worse than no highlight at all.
 */

import type { MvpCitation, UnitPerformance } from "../battleflow/mvp.js";

export interface MvpBoardRow {
  unitId: string;
  name: string;
  kind: string;
  kills: number;
  damageDealt: number;
  /** 0..1 share of the unit that ended the battle alive. */
  survivalRate: number;
  /** True for the unit the sim cited, or for the top of the board without a citation. */
  isLeader: boolean;
}

export interface MvpHighlight {
  leader: MvpBoardRow | null;
  rows: MvpBoardRow[];
  /** One line naming the leader and the grounds. Empty when nobody fought. */
  line: string;
}

function survivalRate(u: UnitPerformance): number {
  return u.started > 0 ? Math.max(0, u.ended) / u.started : 0;
}

/**
 * Rank the field. Order is kills, then damage dealt, then survival — the order
 * `mvpScore` weights, so a board built without a citation still puts the sim's
 * soldier on top. `unitId` breaks a genuine tie so the order never wobbles.
 *
 * `citation` is the sim's answer when it computed one; the cited unit is the
 * leader even if this ranking would have put another first.
 */
export function mvpBoard(units: readonly UnitPerformance[], citation: MvpCitation | null = null): MvpHighlight {
  const rows: MvpBoardRow[] = units
    .filter((u) => u.started > 0 || u.kills > 0 || u.damageDealt > 0)
    .map((u) => ({
      unitId: u.unitId,
      name: u.name,
      kind: u.kind,
      kills: u.kills,
      damageDealt: u.damageDealt,
      survivalRate: survivalRate(u),
      isLeader: false,
    }))
    .sort(
      (a, b) =>
        b.kills - a.kills ||
        b.damageDealt - a.damageDealt ||
        b.survivalRate - a.survivalRate ||
        a.unitId.localeCompare(b.unitId),
    );

  if (rows.length === 0) return { leader: null, rows: [], line: "" };

  const cited = citation
    ? rows.find((r) => r.name === citation.name && r.kind === citation.kind)
    : undefined;
  const leader = cited ?? rows[0]!;
  leader.isLeader = true;
  const line = citation ? citation.citation : leaderLine(leader);
  return { leader, rows, line };
}

/** One line for the highlighted unit, from the numbers the board carries. */
export function leaderLine(row: MvpBoardRow): string {
  return (
    `${row.name} (${row.kind}) — ${row.kills} kills, ${Math.round(row.damageDealt)} damage dealt, ` +
    `${Math.round(row.survivalRate * 100)}% survived.`
  );
}

/** The ranked list under the highlight, leader first. */
export function boardLines(highlight: MvpHighlight): string[] {
  return highlight.rows.map((r) => `${r.name} (${r.kind}) — ${r.kills} kills`);
}