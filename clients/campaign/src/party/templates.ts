/**
 * Party templates: saved compositions, Bannerlord's muster made deliberate.
 *
 * Save your current party as a named template (target counts by tier and
 * branch), then "refit toward" it: the template tells you exactly what to
 * recruit and what to dismiss. Light cavalry wing for the plains, heavy
 * foot for a siege — pick the tool for the ground.
 */

export interface TemplateEntry {
  /** Troop tier. */
  tier: number;
  /** Branch id, or null for unbranched. */
  branch: string | null;
  /** Desired headcount. */
  count: number;
}

export interface PartyTemplate {
  id: string;
  name: string;
  entries: TemplateEntry[];
  savedDay: number;
}

export interface PartyStack {
  tier: number;
  branch: string | null;
  count: number;
}

/** Snapshot the current party into a template. */
export function saveTemplate(id: string, name: string, stacks: PartyStack[], day: number): PartyTemplate {
  const entries: TemplateEntry[] = stacks
    .filter((s) => s.count > 0)
    .map((s) => ({ tier: s.tier, branch: s.branch, count: s.count }));
  return { id, name, entries, savedDay: day };
}

export interface RefitOrder {
  /** "recruit tier X (branch) xN" / "dismiss tier X (branch) xN". */
  action: "recruit" | "dismiss";
  tier: number;
  branch: string | null;
  count: number;
}

/**
 * Compare the current party against the template. Returns recruit orders
 * for deficits and dismiss orders for surpluses (cheapest first: lowest
 * tier dismissed first, so the template keeps your veterans).
 */
export function refitToward(template: PartyTemplate, stacks: PartyStack[]): RefitOrder[] {
  const orders: RefitOrder[] = [];
  const key = (tier: number, branch: string | null) => `${tier}:${branch ?? "-"}`;

  const have = new Map<string, number>();
  for (const s of stacks) {
    have.set(key(s.tier, s.branch), (have.get(key(s.tier, s.branch)) ?? 0) + s.count);
  }
  const want = new Map<string, { tier: number; branch: string | null; count: number }>();
  for (const e of template.entries) {
    want.set(key(e.tier, e.branch), e);
  }

  // Deficits: recruit.
  for (const [k, e] of want) {
    const deficit = e.count - (have.get(k) ?? 0);
    if (deficit > 0) orders.push({ action: "recruit", tier: e.tier, branch: e.branch, count: deficit });
  }
  // Surpluses: dismiss, lowest tier first.
  const surplus: RefitOrder[] = [];
  for (const [k, count] of have) {
    const e = want.get(k);
    const over = count - (e?.count ?? 0);
    if (over > 0) {
      const [tierStr, branchStr] = k.split(":");
      surplus.push({
        action: "dismiss",
        tier: Number(tierStr),
        branch: !branchStr || branchStr === "-" ? null : branchStr,
        count: over,
      });
    }
  }
  surplus.sort((a, b) => a.tier - b.tier);
  return [...orders, ...surplus];
}

/** One-line summary of a template. */
export function templateSummary(template: PartyTemplate): string {
  const total = template.entries.reduce((sum, e) => sum + e.count, 0);
  const parts = template.entries.map(
    (e) => `${e.count}x T${e.tier}${e.branch ? ` ${e.branch}` : ""}`,
  );
  return `${template.name}: ${total} troops (${parts.join(", ")}).`;
}
