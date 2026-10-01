/**
 * Gallery tests (MASTER_PLAN task 130).
 */

import { describe, expect, it } from "vitest";
import { GALLERY_CAP, createGalleryStore } from "../gallery.js";

/** A 1x1 red PNG data URL, valid for the store. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("createGalleryStore", () => {
  it("adds image captures with stable ids and newest-first order", () => {
    const g = createGalleryStore();
    const a = g.add(PNG, 1000);
    const b = g.add(PNG, 2000);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.id).not.toBe(b!.id);
    expect(g.captures.map((c) => c.id)).toEqual([b!.id, a!.id]);
    expect(a!.label).toBe("Campaign photo 1");
    expect(b!.capturedAt).toBe(2000);
  });

  it("rejects non-image data URLs", () => {
    const g = createGalleryStore();
    expect(g.add("not-a-url")).toBeNull();
    expect(g.add("data:text/plain;base64,aGk=")).toBeNull();
    expect(g.captures).toHaveLength(0);
  });

  it("evicts the oldest capture past the cap, without reusing ids", () => {
    const g = createGalleryStore();
    const first = g.add(PNG, 1)!;
    for (let i = 0; i < GALLERY_CAP; i++) g.add(PNG, i + 2);
    expect(g.captures).toHaveLength(GALLERY_CAP);
    expect(g.get(first.id)).toBeUndefined();
    const ids = new Set(g.captures.map((c) => c.id));
    expect(ids.size).toBe(GALLERY_CAP);
  });

  it("removes and clears", () => {
    const g = createGalleryStore();
    const a = g.add(PNG, 1)!;
    expect(g.remove("shot-999")).toBe(false);
    expect(g.remove(a.id)).toBe(true);
    expect(g.remove(a.id)).toBe(false);
    g.add(PNG, 2);
    g.add(PNG, 3);
    g.clear();
    expect(g.captures).toHaveLength(0);
  });

  it("builds a share payload with a timestamped filename and a real blob", () => {
    const g = createGalleryStore();
    const c = g.add(PNG, 1727745600000)!;
    const payload = g.sharePayload(c.id);
    expect(payload).not.toBeNull();
    expect(payload!.filename).toMatch(/^campaign-photo-.*\.png$/);
    expect(payload!.blob.type).toBe("image/png");
    expect(payload!.blob.size).toBeGreaterThan(0);
  });

  it("returns null share payloads for unknown ids", () => {
    const g = createGalleryStore();
    expect(g.sharePayload("shot-999")).toBeNull();
  });

  it("hands back a snapshot, not the live list", () => {
    const g = createGalleryStore();
    g.add(PNG, 1);
    const snap = g.captures;
    g.add(PNG, 2);
    expect(snap).toHaveLength(1);
    expect(g.captures).toHaveLength(2);
  });
});
