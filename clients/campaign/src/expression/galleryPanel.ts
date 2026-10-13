/**
 * Screenshot gallery panel (MASTER_PLAN task 130).
 *
 * In-game browser of the session's captures: a thumbnail grid, click to
 * view a shot full-size, per-shot Share and Delete. Share prefers
 * navigator.share with a real File when the platform allows it, and falls
 * back to a plain PNG download. The panel is read-write on the store (it
 * deletes) but never captures itself — captures come from photo mode.
 */

import "./gallery.css";
import { announce, button, clear, h, liveRegion } from "../ui/dom.js";
import { emptyState, panel } from "../ui/kit.js";
import type { GalleryStore } from "./gallery.js";
import { PHOTO_FILTERS, PHOTO_FILTER_LABELS, photoFilterCss, type PhotoFilter } from "./photoFilters.js";

export interface GalleryPanelOptions {
  store: GalleryStore;
  onClose?: () => void;
  testId?: string;
}

export function galleryPanel(options: GalleryPanelOptions): HTMLElement {
  const { root, body } =
    options.onClose !== undefined
      ? panel({ title: "Screenshot gallery", onClose: options.onClose, testId: options.testId ?? "gallery" })
      : panel({ title: "Screenshot gallery", testId: options.testId ?? "gallery" });
  body.classList.add("gallery");
  root.setAttribute("aria-label", "Screenshot gallery: this session's captures");

  const announcer = liveRegion("Screenshot gallery");
  const grid = h("div", { class: "gallery__grid", role: "list", "aria-label": "Captures" }) as HTMLElement;
  const viewer = h("div", { class: "gallery__viewer", hidden: true, "data-testid": "gallery-viewer" }) as HTMLElement;
  body.append(announcer, grid, viewer);

  function shareCapture(id: string): void {
    const payload = options.store.sharePayload(id);
    if (!payload) {
      announce(announcer, "That shot is gone; it cannot be shared.");
      render();
      return;
    }
    if (payload.canNativeShare) {
      const file = new File([payload.blob], payload.filename, { type: payload.blob.type });
      void (navigator as Navigator).share({ files: [file], title: "Campaign photo" }).then(
        () => announce(announcer, "Shot shared."),
        () => announce(announcer, "Share was cancelled."),
      );
      return;
    }
    const url = URL.createObjectURL(payload.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = payload.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    announce(announcer, "Shot downloaded as a PNG.");
  }

  function openViewer(id: string): void {
    const capture = options.store.get(id);
    if (!capture) {
      render();
      return;
    }
    clear(viewer);
    const img = h("img", {
      class: "gallery__full",
      src: capture.dataUrl,
      alt: capture.label,
      "data-testid": "gallery-full-image",
    }) as HTMLImageElement;
    const close = button("Back to gallery", () => {
      viewer.hidden = true;
      clear(viewer);
      grid.hidden = false;
    }, { testId: "gallery-viewer-close" });
    // Photo filters (solo task 95): CSS chains the capture view applies.
    const filterSelect = h(
      "select",
      { "aria-label": "Photo filter", "data-testid": "gallery-filter" },
      ...PHOTO_FILTERS.map((f) => h("option", { value: f }, PHOTO_FILTER_LABELS[f])),
    ) as HTMLSelectElement;
    filterSelect.addEventListener("change", () => {
      img.style.filter = photoFilterCss(filterSelect.value as PhotoFilter);
    });
    viewer.append(
      img,
      h("p", { class: "caption" }, `${capture.label} · ${new Date(capture.capturedAt).toLocaleString()}`),
      h("div", { class: "gallery__viewer-actions" }, filterSelect),
      h("div", { class: "gallery__viewer-actions" }, button("Share", () => shareCapture(id), { testId: `gallery-share-${id}` }), close),
    );
    grid.hidden = true;
    viewer.hidden = false;
    img.focus?.();
  }

  function render(): void {
    clear(grid);
    const captures = options.store.captures;
    if (captures.length === 0) {
      grid.append(
        emptyState(
          "No captures yet.",
          "Open photo mode from the HUD and take a shot — it lands here for this session.",
        ),
      );
      return;
    }
    for (const capture of captures) {
      const thumb = h("img", {
        class: "gallery__thumb",
        src: capture.dataUrl,
        alt: capture.label,
        loading: "lazy",
      }) as HTMLImageElement;
      const open = button("View", () => openViewer(capture.id), { variant: "quiet", testId: `gallery-view-${capture.id}` });
      const share = button("Share", () => shareCapture(capture.id), { variant: "quiet", testId: `gallery-share-${capture.id}` });
      const del = button("Delete", () => {
        const ok = options.store.remove(capture.id);
        announce(announcer, ok ? "Shot deleted." : "That shot was already gone.");
        render();
      }, { variant: "quiet", testId: `gallery-delete-${capture.id}` });
      const card = h(
        "div",
        { class: "gallery__card", role: "listitem", "data-testid": `gallery-card-${capture.id}` },
        thumb,
        h("p", { class: "gallery__label caption" }, capture.label),
        h("div", { class: "gallery__actions" }, open, share, del),
      );
      grid.appendChild(card);
    }
    announce(announcer, `${captures.length} capture${captures.length === 1 ? "" : "s"} in the gallery.`);
  }

  render();
  return root;
}
