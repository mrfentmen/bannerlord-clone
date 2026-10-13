/**
 * Market price alerts (Rowan solo task 73).
 *
 * Set a target price for a good at a settlement — above (sell target) or
 * below (buy target). Each market tick checks the alerts; when the price
 * hits, the alert fires and is consumed. Persists in localStorage.
 */

export interface PriceAlert {
  id: string;
  /** Goods id — matches the live market's GoodId or the standalone Good list. */
  good: string;
  settlementId: string;
  settlementName: string;
  /** Fire when the price crosses this target. */
  target: number;
  direction: "above" | "below";
  fired: boolean;
}

const STORE_KEY = "campaign.price-alerts.v1";

function load(): PriceAlert[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(alerts: PriceAlert[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(alerts));
  } catch {
    // Session-only alerts.
  }
}

/** Set an alert: notified when price crosses `target` in `direction`. */
export function setPriceAlert(
  good: string,
  settlementId: string,
  settlementName: string,
  target: number,
  direction: "above" | "below",
): PriceAlert {
  if (target <= 0) throw new Error("target price must be positive");
  if (direction !== "above" && direction !== "below") throw new Error(`unknown direction: ${direction}`);
  const alert: PriceAlert = {
    id: `alert-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    good,
    settlementId,
    settlementName,
    target,
    direction,
    fired: false,
  };
  const alerts = load();
  alerts.push(alert);
  save(alerts);
  return alert;
}

/**
 * Check live prices against alerts. Returns the newly fired alerts (each
 * marked fired and consumed). `priceAt` is the current market price.
 */
export function checkPriceAlerts(priceAt: (good: string, settlementId: string) => number | null): PriceAlert[] {
  const alerts = load();
  const fired: PriceAlert[] = [];
  for (const alert of alerts) {
    if (alert.fired) continue;
    const price = priceAt(alert.good, alert.settlementId);
    if (price == null) continue;
    const hit = alert.direction === "above" ? price >= alert.target : price <= alert.target;
    if (hit) {
      alert.fired = true;
      fired.push({ ...alert });
    }
  }
  save(alerts);
  return fired;
}

/** Pending (unfired) alerts. */
export function pendingPriceAlerts(): PriceAlert[] {
  return load().filter((a) => !a.fired);
}

/** Remove an alert. Returns true when found. */
export function cancelPriceAlert(id: string): boolean {
  const alerts = load();
  const i = alerts.findIndex((a) => a.id === id);
  if (i === -1) return false;
  alerts.splice(i, 1);
  save(alerts);
  return true;
}

export function priceAlertLine(alert: PriceAlert): string {
  const verb = alert.direction === "above" ? "reached" : "fell to";
  return `${alert.good} at ${alert.settlementName} ${verb} ${alert.target}.`;
}
