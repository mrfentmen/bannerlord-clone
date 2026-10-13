/** Task 571: ambient audio that follows the current campaign selection. */

import type { AudioManager } from "./AudioManager.js";
import { TOWN_DAY_BED } from "./ambientBeds.js";

/** The selection state relevant to the ambient bus. */
export interface SelectionAmbientState {
  /** True only when the selected place has a live campaign town. */
  townSelected: boolean;
}

/**
 * Use the real town-day loop while a town is selected; otherwise release the
 * ambient bus. The campaign snapshot has a day number but no hour or weather,
 * so the caller must not pretend it can select night or rain.
 */
export function applySelectionAmbient(
  audio: AudioManager,
  state: SelectionAmbientState,
): void {
  if (state.townSelected) {
    void audio.playAmbient(TOWN_DAY_BED).catch(() => {});
  } else {
    audio.stopAmbient();
  }
}
