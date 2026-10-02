/**
 * Audio-Animation Bridge for bannerlord-clone.
 *
 * Connects AnimationController state changes and animation events
 * to the AudioManager. Plays footsteps during locomotion,
 * weapon sounds on attacks, impacts on hits.
 *
 * Usage:
 *   const bridge = new AudioAnimationBridge(animController, audioManager);
 *   bridge.setSurface('concrete'); // for footstep foley
 *   // Call bridge.update(deltaTime) each frame
 */

import type { AnimationController, AnimationStateName } from './AnimationController';
import type { AudioManager } from '../audio/AudioManager';

export type SurfaceType = 'concrete' | 'dirt' | 'grass';

export class AudioAnimationBridge {
  private animController: AnimationController;
  private audioManager: AudioManager;
  private surface: SurfaceType = 'dirt';

  // Footstep timing: track animation progress to trigger steps
  private stepTimer = 0;
  /** Fallback seconds between steps when the state has no specific rate. */
  static readonly DEFAULT_STEP_INTERVAL = 0.35;

  // Track state changes to trigger one-shot sounds
  private lastState: AnimationStateName | null = null;

  constructor(animController: AnimationController, audioManager: AudioManager) {
    this.animController = animController;
    this.audioManager = audioManager;
  }

  /**
   * Set the ground surface for footstep foley.
   */
  setSurface(surface: SurfaceType): void {
    this.surface = surface;
  }

  /**
   * Update called each frame. Triggers audio events based on animation state.
   */
  update(deltaTime: number): void {
    const current = this.animController.getCurrentState();

    // Detect state transitions
    if (current !== this.lastState) {
      this.onStateChange(this.lastState, current);
      this.lastState = current;
      this.stepTimer = 0;
    }

    // Footsteps during locomotion
    if (current === 'walk' || current === 'run') {
      // Adjust step rate by state
      const interval = current === 'run' ? 0.28 : 0.4;
      this.stepTimer += deltaTime;
      if (this.stepTimer >= interval) {
        this.stepTimer = 0;
        this.audioManager.playFootstep(this.surface);
      }
    }
  }

  /**
   * Called when animation state changes. Triggers one-shot sounds.
   */
  private onStateChange(_from: AnimationStateName | null, to: AnimationStateName | null): void {
    if (!to) return;

    switch (to) {
      case 'attack':
        // Weapon swing/shoot sound at attack start
        this.audioManager.playWeaponSound('shot');
        break;

      case 'hit':
        // Impact sound when character gets hit
        this.audioManager.playSfx('sfx-combat-hit', { volume: 0.7 });
        break;

      case 'death':
        // Death sound
        this.audioManager.playSfx('sfx-combat-death', { volume: 0.8 });
        break;

      case 'block':
        // Shield/block sound
        this.audioManager.playSfx('sfx-combat-block', { volume: 0.6 });
        break;
    }
  }

  /**
   * Manually trigger a weapon reload sound.
   */
  playReload(): void {
    this.audioManager.playWeaponSound('reload');
  }
}
