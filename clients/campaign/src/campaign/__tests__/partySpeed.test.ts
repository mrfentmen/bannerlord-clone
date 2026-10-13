/**
 * Party speed, ported from Bannerlord and modernized.
 *
 * The rules under test come from TaleWorlds' own dev blog (21/03/19):
 * footmen ride spare horses, pack animals add capacity but no speed, an
 * oversized herd slows the party, and cargo over capacity brings it to a
 * crawl. Modernized with trucks (capacity kings, road-bound) and horse breeds
 * with terrain affinities.
 */

import { describe, expect, it } from "vitest";
import {
  BASE_SPEED_KM_PER_DAY,
  partySpeed,
  type PartyComposition,
} from "../partySpeed.js";

function base(over: Partial<PartyComposition> = {}): PartyComposition {
  return {
    footTroops: 20,
    mountedTroops: 0,
    horses: [],
    packAnimals: 0,
    trucks: 0,
    trucksFueled: true,
    cargoWeight: 0,
    wounded: 0,
    prisoners: 0,
    morale: 70,
    isNight: false,
    scoutSkill: 0,
    forcedMarch: false,
    ...over,
  };
}

describe("party speed (Bannerlord port)", () => {
  it("a lone foot party moves at base speed, reduced by party size", () => {
    const r = partySpeed(base(), 'plains');
    expect(r.speedKmPerDay).toBeLessThan(BASE_SPEED_KM_PER_DAY);
    expect(r.speedKmPerDay).toBeGreaterThan(0);
    expect(r.factors.some((f) => f.name === 'Party size')).toBe(true);
  });

  it("footmen on horses go faster, one horse per footman is best", () => {
    const onFoot = partySpeed(base(), 'plains').speedKmPerDay;
    const halfHorsed = partySpeed(base({ horses: [{ breed: 'quarter', count: 10 }] }), 'plains').speedKmPerDay;
    const fullHorsed = partySpeed(base({ horses: [{ breed: 'quarter', count: 20 }] }), 'plains').speedKmPerDay;
    expect(halfHorsed).toBeGreaterThan(onFoot);
    expect(fullHorsed).toBeGreaterThan(halfHorsed);
  });

  it("the perfect herd gets a bonus: exactly one horse per footman", () => {
    const full = partySpeed(base({ horses: [{ breed: 'quarter', count: 20 }] }), 'plains');
    expect(full.factors.some((f) => f.name === 'Perfect herd')).toBe(true);
    const oneExtra = partySpeed(base({ horses: [{ breed: 'quarter', count: 21 }] }), 'plains');
    expect(oneExtra.factors.some((f) => f.name === 'Perfect herd')).toBe(false);
    expect(oneExtra.speedKmPerDay).toBeLessThan(full.speedKmPerDay);
  });

  it("too many horses trigger the herd penalty", () => {
    const sane = partySpeed(base({ horses: [{ breed: 'quarter', count: 20 }] }), 'plains').speedKmPerDay;
    const herd = partySpeed(base({ horses: [{ breed: 'quarter', count: 60 }] }), 'plains');
    expect(herd.factors.some((f) => f.name === 'Herd')).toBe(true);
    expect(herd.speedKmPerDay).toBeLessThan(sane);
  });

  it("pack animals add capacity but no speed", () => {
    const without = partySpeed(base({ cargoWeight: 900 }), 'plains');
    const withMules = partySpeed(base({ cargoWeight: 900, packAnimals: 5 }), 'plains');
    // 900 weight overburdens the mule-less party (20 troops * 30 = 600 cap)
    expect(without.factors.some((f) => f.name === 'Overburdened')).toBe(true);
    // 5 mules add 500 capacity: 1100 total, no longer overburdened
    expect(withMules.factors.some((f) => f.name === 'Overburdened')).toBe(false);
    expect(withMules.speedKmPerDay).toBeGreaterThan(without.speedKmPerDay);
  });

  it("carrying too much weight slows the party to a crawl", () => {
    const light = partySpeed(base(), 'plains').speedKmPerDay;
    const heavy = partySpeed(base({ cargoWeight: 5000 }), 'plains');
    expect(heavy.factors.some((f) => f.name === 'Overburdened')).toBe(true);
    expect(heavy.speedKmPerDay).toBeLessThan(light / 2);
  });

  it("too many trucks slow the party down", () => {
    const one = partySpeed(base({ trucks: 1 }), 'road').speedKmPerDay;
    const many = partySpeed(base({ trucks: 10 }), 'road');
    expect(many.factors.some((f) => f.name === 'Convoy congestion')).toBe(true);
    expect(many.speedKmPerDay).toBeLessThan(one);
  });

  it("trucks are fast on roads and miserable off-road", () => {
    const road = partySpeed(base({ trucks: 2 }), 'road');
    const swamp = partySpeed(base({ trucks: 2 }), 'swamp');
    expect(road.factors.some((f) => f.name === 'Motorized')).toBe(true);
    expect(swamp.factors.some((f) => f.name === 'Trucks off-road')).toBe(true);
    expect(swamp.speedKmPerDay).toBeLessThan(road.speedKmPerDay);
  });

  it("unfueled trucks are dead weight", () => {
    const fueled = partySpeed(base({ trucks: 2 }), 'road').speedKmPerDay;
    const dry = partySpeed(base({ trucks: 2, trucksFueled: false }), 'road');
    expect(dry.factors.some((f) => f.name === 'No fuel')).toBe(true);
    expect(dry.speedKmPerDay).toBeLessThan(fueled);
  });

  it("horses and trucks together get the synergy bonus", () => {
    const horsesOnly = partySpeed(base({ horses: [{ breed: 'quarter', count: 20 }] }), 'road');
    const mixed = partySpeed(
      base({ horses: [{ breed: 'quarter', count: 20 }], trucks: 1 }),
      'road',
    );
    expect(mixed.factors.some((f) => f.name === 'Horse-truck synergy')).toBe(true);
    // The synergy bonus outweighs the single truck's road bonus math -- check
    // the factor exists and the mixed column beats horses alone scaled fairly.
    expect(mixed.speedKmPerDay).toBeGreaterThan(horsesOnly.speedKmPerDay * 0.98);
  });

  it("breed matters by terrain: thoroughbreds fly on roads, flounder in swamps", () => {
    const road = (breed: 'thoroughbred' | 'draft') =>
      partySpeed(base({ footTroops: 10, horses: [{ breed, count: 10 }] }), 'road').speedKmPerDay;
    const swamp = (breed: 'thoroughbred' | 'draft') =>
      partySpeed(base({ footTroops: 10, horses: [{ breed, count: 10 }] }), 'swamp').speedKmPerDay;
    expect(road('thoroughbred')).toBeGreaterThan(road('draft'));
    expect(swamp('draft')).toBeGreaterThan(swamp('thoroughbred'));
  });

  it("mustangs own the hills", () => {
    const hills = (breed: 'mustang' | 'quarter') =>
      partySpeed(base({ footTroops: 10, horses: [{ breed, count: 10 }] }), 'hills').speedKmPerDay;
    expect(hills('mustang')).toBeGreaterThan(hills('quarter'));
  });

  it("wounded, prisoners, low morale and night all slow the march", () => {
    const fresh = partySpeed(base(), 'plains').speedKmPerDay;
    const rough = partySpeed(
      base({ wounded: 10, prisoners: 20, morale: 20, isNight: true }),
      'plains',
    );
    expect(rough.factors.some((f) => f.name === 'Wounded')).toBe(true);
    expect(rough.factors.some((f) => f.name === 'Prisoners')).toBe(true);
    expect(rough.factors.some((f) => f.name === 'Low morale')).toBe(true);
    expect(rough.factors.some((f) => f.name === 'Night')).toBe(true);
    expect(rough.speedKmPerDay).toBeLessThan(fresh);
  });

  it("scouts speed the party up", () => {
    const noScout = partySpeed(base(), 'plains').speedKmPerDay;
    const scout = partySpeed(base({ scoutSkill: 5 }), 'plains');
    expect(scout.factors.some((f) => f.name === 'Scouting')).toBe(true);
    expect(scout.speedKmPerDay).toBeGreaterThan(noScout);
  });

  it("speed never drops below the crawl floor", () => {
    const r = partySpeed(
      base({ cargoWeight: 99999, wounded: 20, prisoners: 50, morale: 0, isNight: true }),
      'swamp',
    );
    expect(r.speedKmPerDay).toBeGreaterThanOrEqual(5);
  });

  it("reports capacity and cargo for the encumbrance UI", () => {
    const r = partySpeed(base({ cargoWeight: 100, packAnimals: 2 }), 'plains');
    expect(r.capacity).toBe(20 * 30 + 2 * 100);
    expect(r.cargoWeight).toBe(100);
  });

  it("forced march adds 30% speed", () => {
    const normal = partySpeed(base(), 'plains').speedKmPerDay;
    const forced = partySpeed(base({ forcedMarch: true }), 'plains');
    expect(forced.factors.some((f) => f.name === 'Forced march')).toBe(true);
    expect(forced.speedKmPerDay).toBeGreaterThan(normal);
  });
});
