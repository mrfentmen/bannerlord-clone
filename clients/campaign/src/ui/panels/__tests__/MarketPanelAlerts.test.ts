/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { marketPanel } from "../MarketPanel.js";
import { setPriceAlert } from "../../../economy/priceAlerts.js";
import type { MarketState, PartyState } from "../../../data/types.js";

const market = {
  townId: "t1",
  goods: [
    { goodId: "grain", name: "Grain", price: 12, previousPrice: 10, stock: 50, history: [{ price: 10 }, { price: 12 }] },
  ],
} as MarketState;

const party = { goods: [], members: 10 } as unknown as PartyState;

function options() {
  return {
    townId: "t1",
    townName: "Brooklyn",
    market,
    party,
    money: 500,
    day: 100,
    provider: { getSnapshot: vi.fn() } as never,
  };
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("market panel price alerts (integration)", () => {
  it("sets an alert from the panel", () => {
    const { root } = marketPanel(options());
    document.body.appendChild(root);
    expect(root.textContent).toContain("No price alerts");

    (root.querySelector('#price-alert-target') as HTMLInputElement).value = "9";
    (root.querySelector('[data-testid="price-alert-set"]') as HTMLButtonElement).click();

    expect(document.body.textContent).toContain("fell to 9");
    const alerts = document.body.querySelectorAll('[data-testid^="price-alert-alert-"]');
    expect(alerts.length).toBe(1);
  });

  it("fires an alert when the price crosses", () => {
    setPriceAlert("grain", "t1", "Brooklyn", 15, "below");
    const { root } = marketPanel(options());
    document.body.appendChild(root);
    // Grain is 12, below the 15 target → fires on render.
    const fired = document.body.querySelector('[data-testid^="price-alert-fired-"]');
    expect(fired).not.toBeNull();
    expect(fired!.textContent).toContain("grain");
  });

  it("cancels a pending alert", () => {
    setPriceAlert("grain", "t1", "Brooklyn", 5, "below");
    const { root } = marketPanel(options());
    document.body.appendChild(root);
    const cancel = document.body.querySelector('[data-testid^="price-alert-cancel-"]') as HTMLButtonElement;
    expect(cancel).not.toBeNull();
    cancel.click();
    expect(document.body.querySelectorAll('[data-testid^="price-alert-alert-"]').length).toBe(0);
  });
});
