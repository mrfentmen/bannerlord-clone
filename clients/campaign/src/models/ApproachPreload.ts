/**
 * Preloading models as the party approaches.
 *
 * Task 621: a town is invisible from three valleys away and has to be fully
 * there when it comes over the ridge, so its models are fetched *before* it is
 * in view. This module is the trigger: given where the party is and where the
 * settlements are, it says which ids need fetching now, which loaded ones have
 * fallen out of range, and it never asks for the same id twice.
 *
 * Two radii, not one. The load radius is generous -- a town starts streaming
 * early -- while the release radius is larger still, because unloading a model
 * the party is approaching means the second approach has to pay for it again.
 *
 * The actual fetching is a seam ({@link ApproachPreloaderOptions.preload}) so
 * the policy can be tested without a loader, a scene or a network. The default
 * calls `ModelLoader.preload`, which is what the campaign scene wants.
 */

import type { ModelLoader } from './ModelLoader.js';

/** A settlement (or any fixed model cluster) that can be approached. */
export interface ApproachSite {
  /** Model ids that make up the site. */
  ids: string[];
  /** World position of the site. */
  position: { x: number; y: number; z: number };
  /** Radius within which the site's models are drawn, metres. */
  visibleRadiusM: number;
}

/** Where a site stands relative to the party right now. */
export interface SiteState {
  id: string;
  /** True once the site's models are in the loader. */
  loaded: boolean;
  /** True while the site was inside the load radius on the last update. */
  inRange: boolean;
  /** Distance at the last update, metres. */
  distanceM: number;
}

/** What one {@link ApproachPreloader.update} did. */
export interface ApproachReport {
  /** Ids fetched this update. */
  started: string[];
  /** Ids dropped this update because the site left range. */
  released: string[];
  /** Sites currently inside the load radius. */
  inRange: number;
  /** Sites being tracked. */
  tracked: number;
}

/** Tuning for the trigger. */
export interface ApproachPreloaderOptions {
  /**
   * Metres from a site at which its models are fetched. Defaults to three
   * times the site's own visible radius, so anything the player can see has
   * long since finished loading.
   */
  loadRadiusM?: number;
  /**
   * Multiplier on the load radius at which loaded sites are dropped again.
   * Defaults to 1.5.
   */
  releaseMultiplier?: number;
  /** Fetches ids; takes precedence over `loader`. */
  preload?: (ids: string[]) => Promise<void>;
  /** A loader whose `preload` is used when no `preload` function is given. */
  loader?: ModelLoader;
  /** Drops ids; defaults to nothing (the loader owns its cache). */
  release?: (ids: string[]) => void;
  /** Called after a release, for a scene that disposes the nodes itself. */
  onReleased?: (ids: string[]) => void;
}

/** Distance between two points, or NaN if either is unusable. */
function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) return Number.NaN;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Decides what to fetch as the party moves.
 *
 * Sites are keyed by their id list joined, so two sites with the same models
 * are one site -- which is what the staged manifest looks like, where several
 * structures share a model.
 */
export class ApproachPreloader {
  private readonly sites = new Map<string, { ids: string[]; position: { x: number; y: number; z: number }; radius: number }>();
  private readonly state = new Map<string, SiteState>();

  constructor(
    sites: readonly ApproachSite[],
    private readonly options: ApproachPreloaderOptions = {},
  ) {
    for (const site of sites) {
      const key = [...site.ids].sort().join('|');
      if (site.ids.length === 0) continue;
      this.sites.set(key, {
        ids: [...site.ids],
        position: site.position,
        radius: Number.isFinite(site.visibleRadiusM) && site.visibleRadiusM > 0 ? site.visibleRadiusM : 1,
      });
      this.state.set(key, { id: key, loaded: false, inRange: false, distanceM: Number.NaN });
    }
  }

  /** The load radius for a site, honouring the global override. */
  private loadRadius(radius: number): number {
    const configured = this.options.loadRadiusM;
    return Number.isFinite(configured) && (configured as number) > 0
      ? (configured as number)
      : radius * 3;
  }

  /** The radius outside which a loaded site is dropped. */
  private releaseRadius(radius: number): number {
    const multiplier = this.options.releaseMultiplier ?? 1.5;
    return this.loadRadius(radius) * (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1.5);
  }

  /**
   * Re-evaluates every site from the party's position and fetches whatever has
   * come into range. Never rejects: a failed fetch leaves the site marked
   * loaded so a preload failure cannot become a per-frame retry storm, and the
   * error is reported through `onError` for a log.
   */
  async update(
    position: { x: number; y: number; z: number },
    onError?: (siteId: string, err: unknown) => void,
  ): Promise<ApproachReport> {
    const started: string[] = [];
    const released: string[] = [];
    const pending: Array<{ siteId: string; work: Promise<void> }> = [];
    let inRange = 0;

    for (const [key, site] of this.sites) {
      const siteState = this.state.get(key) as SiteState;
      const distanceM = distance(position, site.position);
      if (!Number.isFinite(distanceM)) {
        // A broken position (an untransformed party node) must not be treated
        // as "far away": hold whatever was already loaded and decide nothing.
        if (siteState.inRange) inRange++;
        continue;
      }
      siteState.distanceM = distanceM;
      const within = distanceM <= this.loadRadius(site.radius);
      siteState.inRange = within;
      if (within) inRange++;

      if (within && !siteState.loaded) {
        siteState.loaded = true;
        started.push(...site.ids);
        pending.push({ siteId: key, work: this.preload(site.ids) });
        continue;
      }

      if (!within && siteState.loaded && distanceM > this.releaseRadius(site.radius)) {
        siteState.loaded = false;
        released.push(...site.ids);
        this.options.release?.(site.ids);
        this.options.onReleased?.(site.ids);
      }
    }

    // All sites are fetched concurrently: a party crossing a valley should not
    // wait for the town behind it to load before the one in front starts.
    const settled = await Promise.allSettled(pending.map((p) => p.work));
    settled.forEach((outcome, index) => {
      const siteId = pending[index]?.siteId ?? 'unknown';
      if (outcome.status === 'rejected') onError?.(siteId, outcome.reason);
    });

    return { started, released, inRange, tracked: this.sites.size };
  }

  /** Fetches ids through whichever loader was supplied. */
  private preload(ids: string[]): Promise<void> {
    const fetchIds = this.options.preload;
    if (fetchIds) return fetchIds(ids);
    if (this.options.loader) return this.options.loader.preload(ids);
    return Promise.reject(new Error('ApproachPreloader: no preload function or loader supplied'));
  }

  /** State of every tracked site, for a debug overlay. */
  snapshot(): SiteState[] {
    return [...this.state.values()].map((s) => ({ ...s }));
  }

  /** How many sites are marked loaded. */
  loadedCount(): number {
    return [...this.state.values()].filter((s) => s.loaded).length;
  }
}