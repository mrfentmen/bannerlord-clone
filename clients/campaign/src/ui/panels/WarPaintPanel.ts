/**
 * War paint panel: the eight presets, one click to apply to the persisted
 * wardrobe. The current design is shown so the player can see what changed.
 */
import { button, h, sectionHeader } from "../dom.js";
import { dataTable, emptyState, panel, type Column } from "../kit.js";
import { applyWarPaintPreset, WAR_PAINT_PRESETS } from "../../expression/warPaintPresets.js";
import { createWardrobe } from "../../expression/wardrobe.js";

export interface WarPaintPanelOptions {
  onClose?: () => void;
  testId?: string;
}

export function warPaintPanel(options: WarPaintPanelOptions = {}): HTMLElement {
  const { root, body } = panel({
    title: "War paint",
    testId: options.testId ?? "war-paint-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
  const wardrobe = createWardrobe();

  const rerender = () => {
    root.replaceWith(warPaintPanel(options));
  };

  body.appendChild(sectionHeader("Presets"));
  const columns: Column<(typeof WAR_PAINT_PRESETS)[number]>[] = [
    { header: "Preset", render: (p) => p.name },
    { header: "Look", render: (p) => p.description },
    {
      header: "",
      render: (p) =>
        button("Apply", () => {
          wardrobe.setWarPaint(applyWarPaintPreset(p.id));
          rerender();
        }, { testId: `warpaint-apply-${p.id}` }),
    },
  ];
  body.appendChild(dataTable("War paint presets", columns, WAR_PAINT_PRESETS, "warpaint-presets"));

  body.appendChild(sectionHeader("Wearing now"));
  const current = wardrobe.warPaint();
  const layers = (Object.entries(current.layers) as [string, string | null][])
    .map(([layer, pattern]) => `${layer}: ${pattern ?? "bare"}`)
    .join(" · ");
  if (Object.values(current.layers).every((v) => v == null)) {
    body.appendChild(emptyState("Bare skin", "No war paint applied. Pick a preset above."));
  } else {
    body.appendChild(
      h("p", { class: "caption", "data-testid": "warpaint-current" }, layers),
    );
  }

  return root;
}
