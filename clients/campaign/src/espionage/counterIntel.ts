/**
 * Tasks 97-98: counter-espionage and the coded-message minigame.
 *
 * Counter-espionage: assign heat to posts; each season, enemy spies at hot
 * posts risk exposure. `sweep` returns the exposed spies.
 *
 * Coded messages: a substitution-cipher minigame. The intercepted message is
 * encoded; the player guesses letter mappings. Solving it yields the intel
 * text. DOM only — no sim involvement.
 */

import type { Spy } from "./types.js";

export interface CounterEspionage {
  heatAt(post: string): number;
  assignHeat(post: string, heat: number): void;
  /** Season sweep: spies whose cover fails against the heat are exposed. */
  sweep(spies: Spy[], roll: (spyId: string) => number): Spy[];
}

export function createCounterEspionage(): CounterEspionage {
  const heat = new Map<string, number>();
  return {
    heatAt: (post) => heat.get(post) ?? 0,
    assignHeat(post, h) {
      if (h < 0 || h > 100) throw new Error("heat must be 0..100");
      heat.set(post, h);
    },
    sweep(spies, roll) {
      return spies.filter((s) => {
        const exposure = Math.max(0, (heat.get(s.post) ?? 0) - s.cover) / 100;
        return roll(s.id) < exposure;
      });
    },
  };
}

// --- Coded-message minigame ---

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export interface CipherGame {
  encoded: string;
  /** Player's current guess: cipher letter -> plain letter. */
  guesses: Record<string, string>;
  guess(cipher: string, plain: string): void;
  /** Current decoded view with unsolved letters as _. */
  view(): string;
  solved(): boolean;
}

export function createCipherGame(plaintext: string, rand: () => number = Math.random): CipherGame {
  const key = shuffle(ALPHABET.split(""), rand);
  const encode = (ch: string): string => {
    const i = ALPHABET.indexOf(ch.toLowerCase());
    if (i < 0) return ch;
    const enc = key[i]!;
    return ch === ch.toUpperCase() ? enc.toUpperCase() : enc;
  };
  const encoded = plaintext.split("").map(encode).join("");
  const guesses: Record<string, string> = {};
  return {
    encoded,
    guesses,
    guess(cipher, plain) {
      guesses[cipher.toLowerCase()] = plain.toLowerCase();
    },
    view() {
      return encoded
        .split("")
        .map((ch) => {
          const lower = ch.toLowerCase();
          if (!(lower >= "a" && lower <= "z")) return ch;
          const g = guesses[lower];
          if (!g) return "_";
          return ch === ch.toUpperCase() ? g.toUpperCase() : g;
        })
        .join("");
    },
    solved() {
      return this.view().toLowerCase() === plaintext.toLowerCase();
    },
  };
}
