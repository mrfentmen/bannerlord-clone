/**
 * Rumour feed panel — trade tips from the simulation.
 *
 * Shows profitable buy-low/sell-high opportunities generated from
 * live market prices. Each rumour names the good, where to buy,
 * where to sell, and the margin per unit.
 */

export interface Rumour {
  good: string;
  buyTown: string;
  buyTownID: number;
  buyPrice: number;
  sellTown: string;
  sellTownID: number;
  sellPrice: number;
  margin: number;
  text: string;
}

export interface RumourFeedProps {
  rumours: Rumour[];
  onClose: () => void;
}

export function rumourFeed(props: RumourFeedProps): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "panel rumour-feed";

  const header = document.createElement("div");
  header.className = "panel__header";
  const title = document.createElement("h2");
  title.textContent = "Trade Rumours";
  header.appendChild(title);
  const close = document.createElement("button");
  close.className = "btn btn--ghost";
  close.textContent = "×";
  close.setAttribute("aria-label", "Close rumours");
  close.addEventListener("click", props.onClose);
  header.appendChild(close);
  panel.appendChild(header);

  if (props.rumours.length === 0) {
    const empty = document.createElement("p");
    empty.className = "rumour-feed__empty";
    empty.textContent = "No profitable trade routes right now. Check back later.";
    panel.appendChild(empty);
    return panel;
  }

  const list = document.createElement("ul");
  list.className = "rumour-feed__list";

  for (const r of props.rumours) {
    const item = document.createElement("li");
    item.className = "rumour-feed__item";

    const good = document.createElement("span");
    good.className = "rumour-feed__good";
    good.textContent = capitalize(r.good);
    item.appendChild(good);

    const route = document.createElement("span");
    route.className = "rumour-feed__route";
    route.textContent = `${r.buyTown} → ${r.sellTown}`;
    item.appendChild(route);

    const margin = document.createElement("span");
    margin.className = "rumour-feed__margin";
    margin.textContent = `+${r.margin.toFixed(1)}/unit`;
    item.appendChild(margin);

    const text = document.createElement("p");
    text.className = "rumour-feed__text";
    text.textContent = r.text;
    item.appendChild(text);

    const prices = document.createElement("div");
    prices.className = "rumour-feed__prices";
    prices.textContent = `Buy at ${r.buyPrice.toFixed(1)} · Sell at ${r.sellPrice.toFixed(1)}`;
    item.appendChild(prices);

    list.appendChild(item);
  }

  panel.appendChild(list);
  return panel;
}

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
