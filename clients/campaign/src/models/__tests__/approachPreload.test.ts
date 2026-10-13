/**
 * Task 621: a town's models are fetched before the town comes into view, and
 * dropped only when the party has genuinely gone away.
 *
 * The two radii are the point: loading starts three visible radii out, and a
 * loaded site is released only past one and a half times that, so a party that
 * turns back does not pay for the download twice. Also pinned: no id is fetched
 * twice while it stays in range, a failed fetch does not become a per-frame
 * retry storm, and a broken party position decides nothing rather than
 * unloading the whole map.
 */

import { describe, expect, it, vi } from "vitest";
import { ApproachPreloader, type ApproachSite } from "../ApproachPreload.js";

const TOWN: ApproachSite = {
  ids: ['farmhouse', 'watchtower'],
  position: { x: 100, y: 0, z: 0 },
  visibleRadiusM: 100,
};

/** A loader stub that records the ids it was asked for. */
function stubLoader() {
  const calls: string[][] = [];
  return {
    calls,
    preload: vi.fn(async (ids: string[]) => {
      calls.push([...ids]);
    }),
  };
}

describe("ApproachPreloader (task 621)", () => {
  it("does not fetch anything from far away", async () => {
    const loader = stubLoader();
    const preloader = new ApproachPreloader([TOWN], { preload: loader.preload });
    const report = await preloader.update({ x: -900, y: 0, z: 0 });
    expect(report).toEqual({ started: [], released: [], inRange: 0, tracked: 1 });
    expect(loader.calls).toEqual([]);
    expect(preloader.loadedCount()).toBe(0);
  });

  it("fetches a site's whole id list once it comes into range", async () => {
    const loader = stubLoader();
    const preloader = new ApproachPreloader([TOWN], { preload: loader.preload });
    // The load radius is three visible radii, so 300 m is the edge.
    const report = await preloader.update({ x: 0, y: 0, z: 0 });
    expect(report.started).toEqual(['farmhouse', 'watchtower']);
    expect(report.inRange).toBe(1);
    expect(loader.calls).toEqual([['farmhouse', 'watchtower']]);
  });

  it("never fetches the same id twice while the site stays in range", async () => {
    const loader = stubLoader();
    const preloader = new ApproachPreloader([TOWN], { preload: loader.preload });
    await preloader.update({ x: 100, y: 0, z: 0 });
    for (const x of [120, 140, 101]) {
      const report = await preloader.update({ x, y: 0, z: 0 });
      expect(report.started).toEqual([]);
    }
    expect(loader.calls).toHaveLength(1);
    expect(preloader.loadedCount()).toBe(1);
  });

  it("keeps a loaded site loaded between the load and release radii", async () => {
    const loader = stubLoader();
    const release = vi.fn();
    const preloader = new ApproachPreloader([TOWN], { preload: loader.preload, release });
    await preloader.update({ x: 100, y: 0, z: 0 }); // loaded, distance 0
    // 400 m away is outside the 300 m load radius but inside the 450 m release
    // radius, so the models stay resident.
    const report = await preloader.update({ x: -300, y: 0, z: 0 });
    expect(preloader.snapshot()[0]?.distanceM).toBeCloseTo(400);
    expect(report.released).toEqual([]);
    expect(release).not.toHaveBeenCalled();
    expect(preloader.loadedCount()).toBe(1);
  });

  it("releases a site the party has left, and refetches on the way back", async () => {
    const loader = stubLoader();
    const release = vi.fn();
    const onReleased = vi.fn();
    const preloader = new ApproachPreloader([TOWN], {
      preload: loader.preload,
      release,
      onReleased,
    });
    await preloader.update({ x: 100, y: 0, z: 0 });
    const away = await preloader.update({ x: -1000, y: 0, z: 0 });
    expect(away.released).toEqual(['farmhouse', 'watchtower']);
    expect(release).toHaveBeenCalledWith(['farmhouse', 'watchtower']);
    expect(onReleased).toHaveBeenCalledTimes(1);
    expect(preloader.loadedCount()).toBe(0);

    const back = await preloader.update({ x: 100, y: 0, z: 0 });
    expect(back.started).toEqual(['farmhouse', 'watchtower']);
    expect(loader.calls).toHaveLength(2);
  });

  it("fetches several sites concurrently", async () => {
    const order: string[] = [];
    const preloader = new ApproachPreloader(
      [
        { ids: ['a'], position: { x: 0, y: 0, z: 0 }, visibleRadiusM: 100 },
        { ids: ['b'], position: { x: 100, y: 0, z: 0 }, visibleRadiusM: 100 },
      ],
      {
        preload: async (ids) => {
          order.push(`start:${ids[0]}`);
          await Promise.resolve();
          order.push(`end:${ids[0]}`);
        },
      },
    );
    const report = await preloader.update({ x: 50, y: 0, z: 0 });
    expect(report.started).toEqual(['a', 'b']);
    // Both start before either finishes: a valley crossing waits once, not twice.
    expect(order.indexOf('start:b')).toBeLessThan(order.indexOf('end:a'));
  });

  it("reports a failed fetch instead of retrying it every frame", async () => {
    const onError = vi.fn();
    const preloader = new ApproachPreloader([TOWN], {
      preload: async () => {
        throw new Error('offline');
      },
    });
    await preloader.update({ x: 100, y: 0, z: 0 }, onError);
    expect(onError).toHaveBeenCalledTimes(1);
    const again = await preloader.update({ x: 100, y: 0, z: 0 }, onError);
    expect(again.started).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("survives one site's failure while another loads", async () => {
    const onError = vi.fn();
    const good = stubLoader();
    const preloader = new ApproachPreloader(
      [
        { ids: ['broken'], position: { x: 0, y: 0, z: 0 }, visibleRadiusM: 100 },
        { ids: ['fine'], position: { x: 50, y: 0, z: 0 }, visibleRadiusM: 100 },
      ],
      {
        preload: async (ids) => {
          if (ids.includes('broken')) throw new Error('404');
          await good.preload(ids);
        },
      },
    );
    const report = await preloader.update({ x: 25, y: 0, z: 0 }, onError);
    expect(report.started).toEqual(['broken', 'fine']);
    expect(good.calls).toEqual([['fine']]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("decides nothing at all for a broken party position", async () => {
    const loader = stubLoader();
    const release = vi.fn();
    const preloader = new ApproachPreloader([TOWN], { preload: loader.preload, release });
    await preloader.update({ x: 100, y: 0, z: 0 });
    const report = await preloader.update({ x: Number.NaN, y: 0, z: 0 });
    expect(report.released).toEqual([]);
    expect(release).not.toHaveBeenCalled();
    expect(preloader.loadedCount()).toBe(1);
    // The last good distance is kept, not overwritten with NaN.
    expect(preloader.snapshot()[0]?.distanceM).toBeCloseTo(0);
  });

  it("honours an explicit load radius and ignores a broken one", async () => {
    const loader = stubLoader();
    const fixed = new ApproachPreloader([TOWN], { preload: loader.preload, loadRadiusM: 50 });
    expect((await fixed.update({ x: 0, y: 0, z: 0 })).started).toEqual([]);
    const wide = new ApproachPreloader([TOWN], { preload: loader.preload, loadRadiusM: 200 });
    expect((await wide.update({ x: 0, y: 0, z: 0 })).started).toHaveLength(2);
    const broken = new ApproachPreloader([TOWN], {
      preload: loader.preload,
      loadRadiusM: Number.NaN,
    });
    expect((await broken.update({ x: 0, y: 0, z: 0 })).started).toHaveLength(2);
  });

  it("deduplicates two sites that use the same models", async () => {
    const loader = stubLoader();
    const preloader = new ApproachPreloader(
      [
        { ids: ['tower', 'wall'], position: { x: 0, y: 0, z: 0 }, visibleRadiusM: 10 },
        { ids: ['wall', 'tower'], position: { x: 5, y: 0, z: 0 }, visibleRadiusM: 10 },
      ],
      { preload: loader.preload },
    );
    const report = await preloader.update({ x: 0, y: 0, z: 0 });
    expect(report.tracked).toBe(1);
    expect(loader.calls).toHaveLength(1);
  });

  it("ignores an empty site", () => {
    const preloader = new ApproachPreloader(
      [{ ids: [], position: { x: 0, y: 0, z: 0 }, visibleRadiusM: 10 }],
      { preload: async () => {} },
    );
    expect(preloader.snapshot()).toEqual([]);
  });

  it("says so when it was given no way to fetch", async () => {
    const onError = vi.fn();
    const preloader = new ApproachPreloader([TOWN]);
    await preloader.update({ x: 100, y: 0, z: 0 }, onError);
    expect(onError.mock.calls[0]?.[1]).toBeInstanceOf(Error);
  });
});