import { describe, expect, it } from "vitest";
import {
  applyPhotoFilter,
  photoFilterCss,
  PHOTO_FILTERS,
  PHOTO_FILTER_LABELS,
} from "../photoFilters.js";

const CAPTURE = "data:image/png;base64,AAA";

describe("photo mode filters (solo task 95)", () => {
  it("offers six filters", () => {
    expect(PHOTO_FILTERS).toHaveLength(6);
    for (const f of PHOTO_FILTERS) {
      expect(PHOTO_FILTER_LABELS[f].length).toBeGreaterThan(0);
    }
  });

  it("each filter has a CSS chain", () => {
    expect(photoFilterCss("none")).toBe("none");
    for (const f of PHOTO_FILTERS) {
      if (f === "none") continue;
      expect(photoFilterCss(f)).not.toBe("none");
      expect(photoFilterCss(f)).toContain("(");
    }
  });

  it("applies a filter to a capture", () => {
    const c = applyPhotoFilter(CAPTURE, "noir");
    expect(c.dataUrl).toBe(CAPTURE);
    expect(c.css).toContain("grayscale");
    expect(c.line).toContain("Noir");
  });

  it("filters are distinct", () => {
    const css = new Set(PHOTO_FILTERS.map(photoFilterCss));
    expect(css.size).toBe(6);
  });

  it("rejects bad filters and captures", () => {
    expect(() => applyPhotoFilter(CAPTURE, "nope" as never)).toThrow("unknown photo filter");
    expect(() => applyPhotoFilter("not-a-data-url", "noir")).toThrow("data URL");
  });
});
