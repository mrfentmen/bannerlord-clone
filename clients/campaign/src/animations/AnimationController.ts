/**
 * Animation State Machine for bannerlord-clone.
 *
 * Manages character animation states with smooth blending in Babylon.js.
 * States: idle, walk, run, attack, block, hit, death, etc.
 *
 * Usage:
 *   const anim = new AnimationController(scene, mesh);
 *   anim.addState('idle', idleAnimGroup);
 *   anim.addState('walk', walkAnimGroup);
 *   anim.play('walk'); // blends from current state
 *   anim.update(deltaTime); // call each frame
 */

export type AnimationStateName =
  | 'idle'
  | 'walk'
  | 'run'
  | 'attack'
  | 'block'
  | 'hit'
  | 'death'
  | 'cheer'
  | 'salute';

export interface AnimationStateConfig {
  /** Blend time in seconds when transitioning TO this state */
  blendIn?: number;
  /** Blend time in seconds when transitioning FROM this state */
  blendOut?: number;
  /** Whether this animation loops */
  loop?: boolean;
  /** Playback speed multiplier */
  speed?: number;
  /** Called when a non-looping animation completes */
  onComplete?: () => void;
}

interface ActiveState {
  name: AnimationStateName;
  // Using `any` for Babylon.js types to avoid hard dependency.
  // The client should pass real AnimationGroups.
  animGroup: any;
  weight: number;
  targetWeight: number;
  config: AnimationStateConfig;
}

const DEFAULT_CONFIG: Required<AnimationStateConfig> = {
  blendIn: 0.2,
  blendOut: 0.2,
  loop: true,
  speed: 1.0,
  onComplete: () => {},
};

export class AnimationController {
  private states = new Map<AnimationStateName, ActiveState>();
  private current: AnimationStateName | null = null;
  private previous: AnimationStateName | null = null;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private mesh: any,
  ) {}

  /**
   * Register an animation state.
   * @param name State name
   * @param animGroup Babylon.js AnimationGroup
   * @param config Blend/loop/speed options
   */
  addState(
    name: AnimationStateName,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    animGroup: any,
    config: AnimationStateConfig = {},
  ): void {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    this.states.set(name, {
      name,
      animGroup,
      weight: 0,
      targetWeight: 0,
      config: fullConfig,
    });
    // Ensure the animation group is stopped initially
    if (animGroup.stop) {
      animGroup.stop();
    }
  }

  /**
   * Play a state, blending from the current state.
   * @param name State to play
   * @param force Restart even if already playing
   */
  play(name: AnimationStateName, force = false): void {
    const state = this.states.get(name);
    if (!state) {
      console.warn(`AnimationController: unknown state "${name}"`);
      return;
    }

    if (this.current === name && !force) {
      return; // Already playing
    }

    // Fade out the current state
    if (this.current) {
      const currentState = this.states.get(this.current);
      if (currentState) {
        currentState.targetWeight = 0;
        this.previous = this.current;
      }
    }

    // Fade in the new state
    this.current = name;
    state.targetWeight = 1;
    state.weight = 0; // Start from 0 for blend-in

    // Start the animation group
    if (state.animGroup.start) {
      state.animGroup.start(
        state.config.loop,
        state.config.speed,
      );
    }

    // Handle non-looping completion
    if (!state.config.loop && state.config.onComplete) {
      // Babylon.js AnimationGroup has onAnimationGroupEndObservable
      if (state.animGroup.onAnimationGroupEndObservable) {
        const observer = state.animGroup.onAnimationGroupEndObservable.add(() => {
          state.animGroup.onAnimationGroupEndObservable.remove(observer);
          state.config.onComplete!();
        });
      }
    }
  }

  /**
   * Update blend weights. Call every frame with delta time in seconds.
   */
  update(deltaTime: number): void {
    for (const state of this.states.values()) {
      if (state.weight === state.targetWeight) {
        continue;
      }

      const blendTime =
        state.targetWeight > state.weight
          ? state.config.blendIn
          : state.config.blendOut;

      if (blendTime <= 0) {
        state.weight = state.targetWeight;
      } else {
        const delta = deltaTime / blendTime;
        if (state.targetWeight > state.weight) {
          state.weight = Math.min(state.targetWeight, state.weight + delta);
        } else {
          state.weight = Math.max(state.targetWeight, state.weight - delta);
        }
      }

      // Apply weight to the animation group
      if (state.animGroup.setWeightForAllAnimatables) {
        state.animGroup.setWeightForAllAnimatables(state.weight);
      }

      // Stop fully faded-out animations to save performance
      if (state.weight === 0 && state.targetWeight === 0 && state.name !== this.current) {
        if (state.animGroup.pause) {
          state.animGroup.pause();
        }
      }
    }
  }

  /**
   * Get the currently playing state name.
   */
  getCurrentState(): AnimationStateName | null {
    return this.current;
  }

  /**
   * Check if a state is currently playing (weight > 0.5).
   */
  isPlaying(name: AnimationStateName): boolean {
    if (this.current !== name) return false;
    const state = this.states.get(name);
    return state ? state.weight > 0.5 : false;
  }

  /**
   * Stop all animations.
   */
  stopAll(): void {
    for (const state of this.states.values()) {
      state.targetWeight = 0;
      state.weight = 0;
      if (state.animGroup.stop) {
        state.animGroup.stop();
      }
    }
    this.current = null;
    this.previous = null;
  }

  /**
   * Set playback speed for a specific state.
   */
  setSpeed(name: AnimationStateName, speed: number): void {
    const state = this.states.get(name);
    if (state && state.animGroup.setSpeedRatio) {
      state.animGroup.setSpeedRatio(speed);
      state.config.speed = speed;
    }
  }
}

/**
 * Combat animation helper — sequences attack → hit → recovery.
 */
export class CombatAnimator {
  constructor(private controller: AnimationController) {}

  /**
   * Play an attack animation, then return to idle or combat stance.
   * @param onHit Callback fired at the "impact" moment (for damage + SFX)
   */
  attack(onHit?: () => void): void {
    this.controller.play('attack', true);

    // Fire onHit at ~40% through the attack animation
    // The actual timing should be tuned per animation
    setTimeout(() => {
      if (onHit) onHit();
    }, 400); // TODO: derive from animation duration
  }

  /**
   * Play a hit reaction, then return to previous state.
   */
  takeHit(): void {
    const prev = this.controller.getCurrentState();
    this.controller.play('hit', true);
    // Return to previous state after hit animation
    // (assumes hit is non-looping with onComplete configured)
  }

  /**
   * Play death animation (stays on death, no return).
   */
  die(): void {
    this.controller.play('death', true);
  }

  /**
   * Play block pose (held until released).
   */
  blockStart(): void {
    this.controller.play('block');
  }

  blockEnd(): void {
    this.controller.play('idle');
  }
}
