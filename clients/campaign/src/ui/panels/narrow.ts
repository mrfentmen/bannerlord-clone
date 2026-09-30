/**
 * The two narrow-screen treatments the town, market and party panels share.
 *
 * `ART_DIRECTION.md` section 13 is the requirement and `CONSTITUTION.md` section 3.4
 * is the rule that it is checked before UI work is called done. Three things follow
 * from it, and they are the whole of this file:
 *
 *  1. Below 900px the context panel is a sheet over the bottom of the map rather than
 *     a column beside it. The class is added here so the panel carries its own layout
 *     responsibility instead of relying on whichever ancestor happens to hold it.
 *  2. Below 600px a six-column price table cannot be read and must not be scrolled
 *     sideways, so each cell becomes its own line with the column heading beside it.
 *     The heading row is clipped, not removed: a screen reader is the case where a bare
 *     list of numbers is worst.
 *  3. Touch targets are 44px at that width. `.btn` already is, in `ui.css`; nothing
 *     here needs to add a second rule that could drift from the first.
 *
 * The breakpoint numbers are the ones in `breakpoints` in `src/design/tokens.ts`; the
 * media queries that read them live in `ui.css`, which is generated from nothing and
 * therefore has to be edited by hand.
 */

/** Marks a panel as the bottom sheet the narrow layout expects. */
export function asBottomSheet(root: HTMLElement): HTMLElement {
  root.classList.add("panel--sheet");
  return root;
}

/**
 * Give every cell in a table the heading of its column, and flag the table as one the
 * narrow layout may stack.
 *
 * Applied to the market and troop tables, which are the only two in the client wide
 * enough to need it. Doing it in markup rather than in CSS is deliberate: `data-label`
 * is what the stylesheet reads, and a stylesheet cannot know a column's heading.
 */
export function stackable(table: HTMLElement): HTMLElement {
  table.classList.add("table--stack");
  const headings = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th")).map((th) => th.textContent ?? "");
  for (const row of Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))) {
    Array.from(row.children).forEach((cell, i) => {
      cell.setAttribute("data-label", headings[i] ?? "");
    });
  }
  return table;
}
