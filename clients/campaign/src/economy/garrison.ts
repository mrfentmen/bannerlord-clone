/**
 * Task 117: garrison management. Each fief sets a garrison target;
 * auto-recruit tops the garrison up toward the target every tick, spending
 * the per-troop cost, and never overshoots.
 */

export interface Garrison {
  fiefId: string;
  troops: number;
  target: number;
  autoRecruit: boolean;
  /** Cost per troop recruited. */
  troopCost: number;
}

export interface GarrisonTick {
  garrison: Garrison;
  recruited: number;
  spent: number;
}

/** One auto-recruit tick against available funds. */
export function tickGarrison(garrison: Garrison, funds: number): GarrisonTick {
  if (!garrison.autoRecruit || garrison.troops >= garrison.target) {
    return { garrison: { ...garrison }, recruited: 0, spent: 0 };
  }
  const wanted = garrison.target - garrison.troops;
  const affordable = Math.floor(funds / garrison.troopCost);
  const recruited = Math.min(wanted, affordable);
  return {
    garrison: { ...garrison, troops: garrison.troops + recruited },
    recruited,
    spent: recruited * garrison.troopCost,
  };
}

export function setGarrisonTarget(garrison: Garrison, target: number): Garrison {
  return { ...garrison, target: Math.max(0, Math.round(target)) };
}
