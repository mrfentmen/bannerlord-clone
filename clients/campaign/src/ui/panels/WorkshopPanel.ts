/**
 * Workshop panel — displays player-owned workshops and their production.
 */

export interface Workshop {
  id: number;
  townId: number;
  townName: string;
  type: number;
  level: number;
  output: number;
  workers: number;
}

const WORKSHOP_NAMES: Record<number, string> = {
  0: "Machine Shop",
  1: "Tannery",
  2: "Textile Mill",
  3: "Brewery",
  4: "Ceramics",
  5: "Lumber Mill",
  6: "Oil Press",
  7: "Jeweler",
  8: "Meat Packing",
  9: "Bakery",
  10: "Candle Works",
};

export interface WorkshopPanelProps {
  workshops: Workshop[];
  onClose: () => void;
}

export function workshopPanel(props: WorkshopPanelProps): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "panel workshop-panel";

  const header = document.createElement("div");
  header.className = "panel__header";
  const title = document.createElement("h2");
  title.textContent = "Workshops";
  header.appendChild(title);
  const close = document.createElement("button");
  close.className = "btn btn--ghost";
  close.textContent = "×";
  close.setAttribute("aria-label", "Close workshops");
  close.addEventListener("click", props.onClose);
  header.appendChild(close);
  panel.appendChild(header);

  if (props.workshops.length === 0) {
    const empty = document.createElement("p");
    empty.className = "workshop-panel__empty";
    empty.textContent = "You own no workshops. Buy one in a town to start producing goods.";
    panel.appendChild(empty);
    return panel;
  }

  const list = document.createElement("ul");
  list.className = "workshop-panel__list";

  for (const w of props.workshops) {
    const item = document.createElement("li");
    item.className = "workshop-panel__item";

    const name = document.createElement("span");
    name.className = "workshop-panel__name";
    name.textContent = WORKSHOP_NAMES[w.type] ?? `Workshop ${w.type}`;
    item.appendChild(name);

    const town = document.createElement("span");
    town.className = "workshop-panel__town";
    town.textContent = w.townName;
    item.appendChild(town);

    const level = document.createElement("span");
    level.className = "workshop-panel__level";
    level.textContent = `Lv ${w.level}`;
    item.appendChild(level);

    const output = document.createElement("span");
    output.className = "workshop-panel__output";
    output.textContent = `${Math.round(w.output)} units stored`;
    item.appendChild(output);

    const workers = document.createElement("span");
    workers.className = "workshop-panel__workers";
    workers.textContent = `${Math.round(w.workers)} workers`;
    item.appendChild(workers);

    list.appendChild(item);
  }

  panel.appendChild(list);

  const total = document.createElement("p");
  total.className = "workshop-panel__total";
  total.textContent = `${props.workshops.length} workshop${props.workshops.length === 1 ? "" : "s"} owned`;
  panel.appendChild(total);

  return panel;
}
