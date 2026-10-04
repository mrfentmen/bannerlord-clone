/**
 * Workshop production chains, ported from Bannerlord's workshop economy.
 *
 * Workshops used to print abstract daily income. Now they run real
 * recipes: each type consumes input goods from the town market every day,
 * produces output goods back into the market, pays wages, and keeps the
 * difference. No inputs on the market? The workshop idles and bleeds
 * wages — exactly like Bannerlord's.
 */

export interface WorkshopRecipe {
  workshopType: string;
  /** Goods consumed per production run (one run per day). */
  inputs: { goodId: string; qty: number }[];
  /** Goods produced per run. */
  outputs: { goodId: string; qty: number }[];
  /** Daily wages for the crew. */
  wages: number;
  /** Production runs per day at full staffing. */
  runsPerDay: number;
}

export const WORKSHOP_RECIPES: Record<string, WorkshopRecipe> = {
  smithy: {
    workshopType: "smithy",
    inputs: [
      { goodId: "metal", qty: 2 },
      { goodId: "fuel", qty: 1 },
    ],
    outputs: [{ goodId: "arms", qty: 1 }],
    wages: 25,
    runsPerDay: 3,
  },
  brewery: {
    workshopType: "brewery",
    inputs: [{ goodId: "grain", qty: 3 }],
    outputs: [{ goodId: "beer", qty: 2 }],
    wages: 15,
    runsPerDay: 4,
  },
  weavery: {
    workshopType: "weavery",
    inputs: [{ goodId: "textiles", qty: 2 }],
    outputs: [{ goodId: "cloth", qty: 3 }],
    wages: 15,
    runsPerDay: 4,
  },
  tannery: {
    workshopType: "tannery",
    inputs: [
      { goodId: "lumber", qty: 2 },
      { goodId: "fuel", qty: 1 },
    ],
    outputs: [{ goodId: "leather", qty: 2 }],
    wages: 18,
    runsPerDay: 3,
  },
  press: {
    workshopType: "press",
    inputs: [{ goodId: "metal", qty: 3 }],
    outputs: [{ goodId: "tools", qty: 2 }],
    wages: 20,
    runsPerDay: 3,
  },
};

export interface MarketLine {
  goodId: string;
  price: number;
  stock: number;
}

export interface ProductionResult {
  /** Runs actually completed (0 when starved of inputs). */
  runs: number;
  /** Gold spent buying inputs from the market. */
  inputCost: number;
  /** Gold value of outputs sold into the market. */
  outputValue: number;
  /** Net profit (negative when idle — wages still hurt). */
  profit: number;
  /** Human-readable summary. */
  line: string;
}

/**
 * Run one day of production. Mutates the market lines (buys inputs,
 * sells outputs). Returns the day's economics.
 */
export function runWorkshopDay(
  recipe: WorkshopRecipe,
  market: Map<string, MarketLine>,
  workshopName: string,
): ProductionResult {
  // How many runs can the market's input stock support?
  let runs = recipe.runsPerDay;
  for (const input of recipe.inputs) {
    const line = market.get(input.goodId);
    const available = line ? Math.floor(line.stock / input.qty) : 0;
    runs = Math.min(runs, available);
  }

  if (runs <= 0) {
    const idleLoss = Math.round(recipe.wages / 2);
    return {
      runs: 0,
      inputCost: 0,
      outputValue: 0,
      profit: -idleLoss,
      line: `${workshopName} idles — no inputs on the market. Loses ${idleLoss} gold in wages.`,
    };
  }

  let inputCost = 0;
  for (const input of recipe.inputs) {
    const line = market.get(input.goodId)!;
    const qty = input.qty * runs;
    line.stock = Math.max(0, line.stock - qty);
    inputCost += line.price * qty;
  }
  let outputValue = 0;
  for (const output of recipe.outputs) {
    const line = market.get(output.goodId);
    const qty = output.qty * runs;
    if (line) {
      line.stock += qty;
      outputValue += line.price * qty;
    }
  }
  const profit = Math.round(outputValue - inputCost - recipe.wages);
  return {
    runs,
    inputCost: Math.round(inputCost),
    outputValue: Math.round(outputValue),
    profit,
    line:
      profit >= 0
        ? `${workshopName} runs ${runs}x: +${profit} gold.`
        : `${workshopName} runs ${runs}x but loses ${-profit} gold — inputs cost more than the product.`,
  };
}
