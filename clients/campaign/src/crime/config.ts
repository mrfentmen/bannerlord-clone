/**
 * Crime system tunables. Units: metres, seconds.
 *
 * `wanted` is a direct port of leonida's `WantedConfig` (MIT); `cop` and
 * `driver` are the tunable blocks its `CopBrain`/`PoliceDriver` algorithms
 * need — the pulled tree did not include its `police/config.ts`, so these
 * values were derived from the algorithms' own constants (standoff
 * distances, cadence, pursuit ranges) and playtest-shaped, not copied.
 */
export const CRIME_CONFIG = {
  wanted: {
    witness: {
      /** Civilian witness radius for quiet / loud crimes. */
      civilianRadius: 25,
      civilianLoudRadius: 60,
      /** A cop this close sees the crime directly (no phone call, state goes `active`). */
      copRadius: 40,
      copLoudRadius: 60,
      /** Witness queries are horizontal; keep a vertical sanity bound. */
      maxVerticalGap: 12,
    },
    vision: {
      /** Seconds between line-of-sight sweeps. */
      interval: 0.25,
      /** `playerSeen` is true this long after the last hit. */
      seenWindow: 1.0,
      /** Without a hit for this long, `active` decays to `searching`. */
      loseSightAfter: 3.0,
      footRange: 60,
      vehicleRange: 90,
      helicopterRange: 250,
      eyeHeight: 1.6,
      /** A cruiser this close to the player counts as seeing them without a ray. */
      nearAutoSee: 6,
    },
    search: {
      initialRadius: 40,
      growthPerSecond: 8,
      maxRadiusBase: 220,
      maxRadiusPerLevel: 30,
    },
    evasion: {
      baseSeconds: 20,
      perLevelSeconds: 20,
      /** Hidden inside the circle counts this much slower than being outside it. */
      hiddenInsideMultiplier: 1.5,
    },
    hotScene: {
      radius: 60,
      expirySeconds: 120,
      /** A new crime this close to an existing scene refreshes it instead of adding one. */
      mergeRadius: 30,
      max: 8,
      reraiseLevel: 1,
    },
    heat: {
      perStar: 5,
      decayPerMinute: 1,
      max: 100,
    },
    collision: {
      /** Ramming impulse above which hitting a cruiser is a crime. */
      copVehicleImpulse: 3,
    },
  },
  cop: {
    firstShotDelay: 0.6,
    losInterval: 0.3,
    sightRange: 55,
    /** Inside this range with LOS, the arrest contact timer runs. */
    arrestRange: 2.5,
    /** Seconds of contact before the bust lands. */
    arrestSeconds: 1.0,
    approachWalkDistance: 12,
    chaseDistance: 60,
    standoffMin: 12,
    standoffMax: 20,
    backOffSpeed: 3,
    strafeSpeed: 4,
    strafeSwitchMin: 0.8,
    strafeSwitchMax: 2.0,
    /** Above this speed the suspect counts as fleeing (no walk-up arrest). */
    fleeSpeed: 4,
    vehicleStillSpeed: 2,
    eyeHeight: 1.6,
    accuracyBase: 0.35,
    accuracySwat: 0.55,
    /** heat / heatDivisor is added to accuracy. */
    heatDivisor: 400,
    cadenceJitter: 0.25,
    runSpeed: 6,
    walkSpeed: 1.5,
  },
  driver: {
    /** Cruiser cruise speed m/s. */
    cruiseSpeed: 22,
    losInterval: 0.4,
    losRange: 120,
    /** Player on foot inside this range with LOS: pull over, crew bails. */
    exitRange: 12,
    exitSpeed: 3,
    /** Inside this range with LOS: direct pursuit instead of road routing. */
    pursuitRange: 60,
    /** Non-ramming follow gap behind the player's car. */
    followGap: 8,
    /** Seconds of the player's velocity to lead when ramming. */
    ramLead: 0.5,
    repathInterval: 2,
    nodeReach: 4,
    laneOffset: 2.2,
    steerGain: 2.5,
    turnSlowAngle: 0.6,
    turnSpeed: 8,
    throttleGain: 0.15,
    brakeGain: 0.2,
    /** Below this speed while wanting to move: stuck. */
    stuckSpeed: 1.5,
    stuckAfter: 2.5,
    reverseSeconds: 1.2,
  },
  dispatch: {
    /** Spawn attempts per dispatch tick. */
    spawnTries: 12,
    /** Spawn ring around the player (m). */
    spawnMin: 150,
    spawnMax: 250,
    /** Spawn point must be this clear of other vehicles. */
    spawnClearance: 6,
    /** Seconds between dispatch rebalancing ticks. */
    rebalanceInterval: 3,
  },
} as const;
