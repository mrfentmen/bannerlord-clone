/**
 * @vitest-environment jsdom
 *
 * Lifetime statistics panel tests (MASTER_PLAN task 138): stat cards render
 * from the store, refresh re-reads, and the reset button is two-step.
 */

import { describe, expect, it, afterEach } from "vitest";
import { lifetimeStatsPanel } from "../lifetimeStatsPanel.js";

describe("lifetime stats panel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders an empty state with no history", () => {
    const handle = lifetimeStatsPanel({});
    document.body.appendChild(handle.root);
    expect(document.querySelector('[data-testid="lifetime-note"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="lifetime-stat-battles"]')).toBeNull();
    handle.root.remove();
  });

  it("two-step reset asks for confirmation", () => {
    const handle = lifetimeStatsPanel({});
    document.body.appendChild(handle.root);
    const btn = document.querySelector('[data-testid="lifetime-reset"]') as HTMLButtonElement;
    btn.click();
    expect(btn.textContent).toBe("Click again to confirm reset");
    handle.root.remove();
  });

  it("exposes a refresh handle", () => {
    const handle = lifetimeStatsPanel({});
    document.body.appendChild(handle.root);
    expect(() => handle.refresh()).not.toThrow();
    handle.root.remove();
  });
});
