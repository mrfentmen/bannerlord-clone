/**
 * Animation clip mappings for bannerlord-clone character models.
 *
 * Different GLB files use different clip names for the same actions.
 * This registry maps each model to its available clips so the
 * AnimationController can play the right animation.
 *
 * Usage:
 *   const clips = getClipMap('soldier-animated');
 *   animController.addState('idle', animGroups[clips.idle]);
 */

export interface ClipMap {
  idle: string;
  walk: string;
  run: string;
  attack?: string;
  block?: string;
  hit?: string;
  death?: string;
  cheer?: string;
  salute?: string;
}

/**
 * Clip name mappings per model.
 * Key: model name (without .glb)
 * Value: mapping from state name to clip name in the GLB
 */
export const CLIP_MAPS: Record<string, ClipMap> = {
  // Quaternius Soldier (from three.js examples)
  // Clips: Idle, Walk, Run, TPose
  'soldier-animated': {
    idle: 'Idle',
    walk: 'Walk',
    run: 'Run',
  },

  // Quaternius Soldier (original in anims/)
  'Soldier': {
    idle: 'Idle',
    walk: 'Walk',
    run: 'Run',
  },

  // Xbot (Mixamo character)
  // Clips use lowercase names
  'Xbot': {
    idle: 'idle',
    walk: 'walk',
    run: 'run',
  },

  // KayKit Rogue
  // Check actual clip names with: console.log(animGroups.map(g => g.name))
  'kaykit-rogue': {
    idle: 'idle',
    walk: 'walk',
    run: 'run',
  },

  // Female operator (Quaternius Modular Women)
  // Has 25 animations including combat
  'female-operator': {
    idle: 'Idle',
    walk: 'Walk',
    run: 'Run',
    // Additional clips available - log names to confirm
  },
};

/**
 * Get the clip map for a model. Returns a default map if unknown.
 */
export function getClipMap(modelName: string): ClipMap {
  const map = CLIP_MAPS[modelName];
  if (map) return map;

  // Default: try common naming conventions
  console.warn(`No clip map for "${modelName}", using defaults`);
  return {
    idle: 'Idle',
    walk: 'Walk',
    run: 'Run',
  };
}

/**
 * Log all available clip names from loaded AnimationGroups.
 * Use this to discover clip names for new models.
 */
export function logClipNames(modelName: string, animGroups: any[]): void {
  console.log(`[${modelName}] Available clips:`);
  for (const group of animGroups) {
    console.log(`  - "${group.name}" (${group.targetedAnimations?.length || 0} targets)`);
  }
}
