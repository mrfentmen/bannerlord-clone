/**
 * Turf system tunables — data, not code.
 *
 * Zone rules follow `jaydendavisnc/inkwave`'s `ZONES-config.js` (MIT)
 * ("ink coverage" adapted to crew presence / tag coverage); border
 * growth follows Civ 5's culture curve via OpenCiv's `BorderGrowth.ts`
 * (MIT).
 */
export const TURF_CONFIG = {
  zones: {
    /** Share of a zone a crew must hold to take it. */
    takeShare: 0.8,
    /** Rival share that neutralizes a held zone. */
    neutralizeShare: 0.4,
    /** Rival share that sounds the "about to flip" contest warning. */
    warnShare: 0.3,
    /** Seconds between contest warnings for one zone. */
    warnGap: 4,
    /** Points per second holding the operational objective (countdown from 100). */
    holdRate: 1,
    /** Countdown start for each crew. */
    startCount: 100,
    /** Penalty multiplier on losing the objective to a rival. */
    penaltyK: 0.75,
    /** Coverage checks per second. */
    sampleHz: 5,
    /** Objective rotates between centre and side zones this often (s). */
    rotateMin: 30,
    rotateMax: 60,
    /** Per-block income per second while held. */
    incomePerSecond: 2,
    /** Coverage painted per crew-member-second of presence. */
    presenceRate: 0.02,
    /** Coverage painted by one fresh tag. */
    tagAmount: 0.15,
    /** Coverage decay per second (tags fade, presence is fleeting). */
    decayPerSecond: 0.005,
  },
  growth: {
    firstTileCost: 20,
    laterTileMultiplier: 10,
    laterTileExponent: 1.1,
    maxAcquireDistance: 5,
    distanceCost: 100,
    /** Negative costs pull the tile forward (Civ 5 priority order). */
    luxuryCost: -250,
    strategicCost: -200,
    bonusCost: -150,
    nextToResourceCost: -75,
    riverCost: -50,
  },
  business: {
    maxTier: 3,
    /** Income multiplier per tier above 1. */
    tierMult: 0.6,
    /** Fronts (illegal) earn this multiple of a legit business but carry raid risk. */
    frontMult: 1.8,
    /** Base daily police-raid probability for a front at 0 heat, scaled by heat/100. */
    raidBase: 0.02,
  },
} as const;
