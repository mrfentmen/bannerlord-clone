/**
 * Intro story (Rowan solo task 5).
 *
 * Every campaign opens with the story: the setting, the power vacuum, and
 * the player's clan arriving on the coast. Beaten as a sequence of beats the
 * player advances through — or skips entirely. The host decides when to show
 * it (new campaign start) and persists the skip.
 */

export interface StoryBeat {
  heading: string;
  body: string;
}

export const INTRO_BEATS: StoryBeat[] = [
  {
    heading: "The Coast",
    body: "The old order collapsed a decade ago. Four cities — New York, Los Angeles, Houston, Miami — hold what remains of the grid, and between them the highways belong to whoever can hold them.",
  },
  {
    heading: "The Vacuum",
    body: "Mayors became warlords. Trucking companies became armies. Every warehouse is a fortress, every convoy a campaign. Nobody remembers who fired the first shot — only who fired the last.",
  },
  {
    heading: "Your Clan",
    body: "Your family ran freight before the fall. You kept the trucks rolling when the lights went out, and the drivers who stayed became your first soldiers. The coast doesn't know your name yet. It will.",
  },
  {
    heading: "The Goal",
    body: "Take towns. Win battles. Make treaties — or break them. Hold four towns and the coast is yours. Lose your last fighter and the line ends with you.",
  },
];

export interface IntroStory {
  beats(): StoryBeat[];
  /** Advance one beat; returns the new index. */
  next(): number;
  back(): number;
  index(): number;
  atEnd(): boolean;
  skip(): void;
  skipped(): boolean;
  reset(): void;
}

export function createIntroStory(beats: StoryBeat[] = INTRO_BEATS): IntroStory {
  let index = 0;
  let wasSkipped = false;
  return {
    beats: () => beats,
    next: () => {
      if (index < beats.length - 1) index += 1;
      return index;
    },
    back: () => {
      if (index > 0) index -= 1;
      return index;
    },
    index: () => index,
    atEnd: () => index >= beats.length - 1,
    skip: () => {
      wasSkipped = true;
    },
    skipped: () => wasSkipped,
    reset: () => {
      index = 0;
      wasSkipped = false;
    },
  };
}
