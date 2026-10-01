/**
 * Screenshot gallery store (MASTER_PLAN task 130).
 *
 * Photo mode captures are big PNG data URLs, so the gallery is deliberately
 * in-session only: captures live in memory, listed newest-first, capped so
 * one long photo session cannot eat the tab's memory. Nothing here invents
 * storage — sharing is a download (or navigator.share when the platform
 * supports files), and "delete" just drops the entry from the session list.
 *
 * Read-only consumers (the panel) get snapshots; the store never touches
 * the DOM, so it is unit-testable without a browser.
 */

export interface GalleryCapture {
  /** Stable per-session id, e.g. "shot-3". Never reused within a session. */
  id: string;
  /** PNG data URL as produced by the renderer's captureFrame. */
  dataUrl: string;
  /** When the shot was taken (ms epoch). */
  capturedAt: number;
  /** Short human label, e.g. "Campaign photo 2". */
  label: string;
}

/** How many captures the gallery holds before evicting the oldest. */
export const GALLERY_CAP = 50;

export interface GallerySharePayload {
  filename: string;
  blob: Blob;
  /** True when the browser can hand the file to navigator.share. */
  canNativeShare: boolean;
}

export interface GalleryStore {
  readonly captures: readonly GalleryCapture[];
  /** Add a data URL; returns the capture or null when the URL is not an image. */
  add(dataUrl: string, capturedAt?: number): GalleryCapture | null;
  remove(id: string): boolean;
  clear(): void;
  get(id: string): GalleryCapture | undefined;
  /** Build a share/download payload for a capture. Returns null for unknown ids. */
  sharePayload(id: string): GallerySharePayload | null;
}

function parseDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  if (!dataUrl.startsWith("data:image/")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const header = dataUrl.slice(5, comma);
  const [mime, encoding] = header.split(";");
  if (encoding !== "base64" || !mime) return null;
  try {
    const bin = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { mime, bytes };
  } catch {
    return null;
  }
}

function shareFilename(capturedAt: number): string {
  return `campaign-photo-${new Date(capturedAt).toISOString().replace(/[:.]/g, "-")}.png`;
}

export function createGalleryStore(): GalleryStore {
  let seq = 0;
  const captures: GalleryCapture[] = [];

  return {
    get captures(): readonly GalleryCapture[] {
      return [...captures];
    },

    add(dataUrl: string, capturedAt: number = Date.now()): GalleryCapture | null {
      if (!dataUrl.startsWith("data:image/")) return null;
      seq += 1;
      const capture: GalleryCapture = {
        id: `shot-${seq}`,
        dataUrl,
        capturedAt,
        label: `Campaign photo ${seq}`,
      };
      captures.unshift(capture);
      while (captures.length > GALLERY_CAP) captures.pop();
      return capture;
    },

    remove(id: string): boolean {
      const idx = captures.findIndex((c) => c.id === id);
      if (idx < 0) return false;
      captures.splice(idx, 1);
      return true;
    },

    clear(): void {
      captures.length = 0;
    },

    get(id: string): GalleryCapture | undefined {
      return captures.find((c) => c.id === id);
    },

    sharePayload(id: string): GallerySharePayload | null {
      const capture = captures.find((c) => c.id === id);
      if (!capture) return null;
      const parsed = parseDataUrl(capture.dataUrl);
      if (!parsed) return null;
      const blob = new Blob([parsed.bytes.buffer as ArrayBuffer], { type: parsed.mime });
      const file = new File([blob], shareFilename(capture.capturedAt), { type: parsed.mime });
      const nav = globalThis.navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean;
      };
      const canNativeShare =
        typeof nav.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files: [file] });
      return { filename: file.name, blob, canNativeShare };
    },
  };
}
