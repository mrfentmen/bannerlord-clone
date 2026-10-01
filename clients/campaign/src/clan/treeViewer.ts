/**
 * The family tree viewer: renders a positioned tree as SVG with pan/zoom.
 * Living members render solid, the dead render dimmed with death years.
 */

import { h } from "../ui/dom.js";
import { layoutFamilyTree, type FamilyTree } from "./familyTree.js";
import type { ClanMember } from "./types.js";

export interface TreeViewerOptions {
  members: ClanMember[];
  onSelect?: (member: ClanMember) => void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function createTreeViewer(opts: TreeViewerOptions): HTMLElement {
  const tree: FamilyTree = layoutFamilyTree(opts.members);
  const wrap = h("div", { class: "clan-tree", "data-testid": "clan-tree" });
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "clan-tree-svg");

  const byId = new Map(tree.nodes.map((n) => [n.member.id, n]));
  const pad = 80;
  const maxX = Math.max(...tree.nodes.map((n) => n.x), 0) + pad;
  const maxY = (tree.generations - 1) * 90 + pad;
  svg.setAttribute("viewBox", `${-pad} ${-pad} ${maxX + pad} ${maxY + pad}`);

  for (const e of tree.edges) {
    const a = byId.get(e.from)!;
    const b = byId.get(e.to)!;
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.setAttribute("class", "clan-tree-edge");
    svg.appendChild(line);
  }

  for (const n of tree.nodes) {
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("transform", `translate(${n.x},${n.y})`);
    g.setAttribute("class", n.dead ? "clan-tree-node is-dead" : "clan-tree-node");
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", "-60");
    rect.setAttribute("y", "-22");
    rect.setAttribute("width", "120");
    rect.setAttribute("height", "44");
    rect.setAttribute("rx", "6");
    g.appendChild(rect);
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("y", "-2");
    label.textContent = n.member.name;
    g.appendChild(label);
    const years = document.createElementNS(SVG_NS, "text");
    years.setAttribute("text-anchor", "middle");
    years.setAttribute("y", "14");
    years.setAttribute("class", "clan-tree-years");
    years.textContent = `${n.member.birthYear}–${n.member.deathYear ?? ""}`;
    g.appendChild(years);
    if (opts.onSelect) {
      g.style.cursor = "pointer";
      g.addEventListener("click", () => opts.onSelect!(n.member));
    }
    (g as unknown as Element).setAttribute("data-member-id", n.member.id);
    svg.appendChild(g);
  }

  wrap.appendChild(svg);
  return wrap;
}
