/**
 * Task 76: family tree layout. Positions every member by generation (y) and
 * sibling order (x) with a simple tidy-tree pass: leaves take sequential
 * slots, parents center over their children. Dead members are flagged for
 * the viewer to render differently. The accept is structural: N generations
 * produce N distinct, correctly ordered rows with no overlapping nodes.
 */

import type { ClanMember } from "./types.js";

export interface TreeNode {
  member: ClanMember;
  generation: number;
  x: number;
  y: number;
  dead: boolean;
}

export interface TreeEdge {
  from: string;
  to: string;
}

export interface FamilyTree {
  nodes: TreeNode[];
  edges: TreeEdge[];
  generations: number;
}

const ROW_H = 90;
const COL_W = 140;

export function layoutFamilyTree(members: ClanMember[]): FamilyTree {
  const byId = new Map(members.map((m) => [m.id, m]));
  const childrenOf = new Map<string, string[]>();
  for (const m of members) {
    for (const p of [m.fatherId, m.motherId]) {
      if (p && byId.has(p)) {
        const list = childrenOf.get(p) ?? [];
        list.push(m.id);
        childrenOf.set(p, list);
      }
    }
  }

  // Generation = longest chain from a founder (member with no known parents).
  const genMemo = new Map<string, number>();
  function generation(id: string, seen: Set<string>): number {
    const hit = genMemo.get(id);
    if (hit !== undefined) return hit;
    if (seen.has(id)) return 0; // cycle guard: data should be a DAG
    seen.add(id);
    const m = byId.get(id)!;
    const parents = [m.fatherId, m.motherId].filter((p): p is string => !!p && byId.has(p));
    const g = parents.length === 0 ? 0 : 1 + Math.max(...parents.map((p) => generation(p, seen)));
    seen.delete(id);
    genMemo.set(id, g);
    return g;
  }
  for (const m of members) generation(m.id, new Set());

  // Tidy x: post-order; leaves take the next slot, parents center.
  const xMemo = new Map<string, number>();
  let slot = 0;
  function place(id: string): number {
    const hit = xMemo.get(id);
    if (hit !== undefined) return hit;
    const kids = (childrenOf.get(id) ?? []).filter((k) => (genMemo.get(k) ?? 0) > (genMemo.get(id) ?? 0));
    let x: number;
    if (kids.length === 0) {
      x = slot++;
    } else {
      const xs = kids.map(place);
      x = (Math.min(...xs) + Math.max(...xs)) / 2;
    }
    xMemo.set(id, x);
    return x;
  }
  const roots = members.filter((m) => (genMemo.get(m.id) ?? 0) === 0);
  // Place deepest subtrees first so sibling groups stay compact.
  const ordered = [...members].sort((a, b) => (genMemo.get(b.id) ?? 0) - (genMemo.get(a.id) ?? 0));
  for (const m of ordered) place(m.id);
  void roots;

  const nodes: TreeNode[] = members.map((m) => {
    const g = genMemo.get(m.id) ?? 0;
    let x = (xMemo.get(m.id) ?? 0) * COL_W;
    // Spouses share children, so both parents center on the same slot —
    // nudge them apart so the pair renders side by side, not overlapped.
    if (m.spouseId && byId.has(m.spouseId)) {
      x += (m.id < m.spouseId ? -1 : 1) * COL_W * 0.32;
    }
    return {
      member: m,
      generation: g,
      x,
      y: g * ROW_H,
      dead: m.deathYear !== undefined,
    };
  });
  // Post-pass: within each generation row, enforce a minimum gap so no two
  // nodes ever overlap, no matter how degenerate the slot assignment is
  // (single-line descents center every ancestor on one slot).
  const MIN_GAP = COL_W * 0.95;
  const rows = new Map<number, TreeNode[]>();
  for (const n of nodes) {
    rows.set(n.generation, [...(rows.get(n.generation) ?? []), n]);
  }
  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) {
      const prev = row[i - 1]!;
      const cur = row[i]!;
      if (cur.x - prev.x < MIN_GAP) cur.x = prev.x + MIN_GAP;
    }
  }

  const edges: TreeEdge[] = [];
  for (const m of members) {
    for (const p of [m.fatherId, m.motherId]) {
      if (p && byId.has(p)) edges.push({ from: p, to: m.id });
    }
    if (m.spouseId && byId.has(m.spouseId) && m.id < m.spouseId) {
      edges.push({ from: m.id, to: m.spouseId });
    }
  }
  const generations = members.length === 0 ? 0 : Math.max(...nodes.map((n) => n.generation)) + 1;
  return { nodes, edges, generations };
}
