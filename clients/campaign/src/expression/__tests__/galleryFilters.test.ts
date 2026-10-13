/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGalleryStore } from "../gallery.js";
import { galleryPanel } from "../galleryPanel.js";
import { photoFilterCss } from "../photoFilters.js";

const DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("gallery photo filters (integration)", () => {
  it("applies the chosen filter to the viewed capture", () => {
    const store = createGalleryStore();
    const capture = store.add(DATA_URL)!;
    const root = galleryPanel({ store });
    document.body.appendChild(root);

    (root.querySelector(`[data-testid="gallery-view-${capture.id}"]`) as HTMLButtonElement).click();
    const img = root.querySelector('[data-testid="gallery-full-image"]') as HTMLImageElement;
    expect(img).not.toBeNull();
    const select = root.querySelector('[data-testid="gallery-filter"]') as HTMLSelectElement;
    expect(select).not.toBeNull();

    select.value = "noir";
    select.dispatchEvent(new Event("change"));
    expect(img.style.filter).toBe(photoFilterCss("noir"));
    expect(img.style.filter).toContain("grayscale");

    select.value = "none";
    select.dispatchEvent(new Event("change"));
    expect(img.style.filter).toBe("none");
  });
});
