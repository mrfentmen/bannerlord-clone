/**
 * NPC greeting & small-talk dialogue triggers.
 *
 * 48 voiced lines (4 voices × 12 lines) in `public/audio/vox/greet/`,
 * generated 2026-10-04 for quest/NPC dialogue. The lines cover the beats of
 * meeting someone in the world: greeting, asking how they are, asking their
 * name, where they're from, where they live, what brings them here, laughing
 * at a joke, and farewells.
 *
 * Two call shapes, mirroring barkTriggers.ts:
 * - `greetNpc(voice?)` — plays a greeting when the player approaches/talks to
 *   an NPC. Picks a random voice and a random greeting line.
 * - `npcSmallTalk(topic, voice?)` — plays a specific small-talk line.
 *
 * Voices: ronan (friendly male), aria (warm female), vincent (gruff male),
 * paloma (lilting female). A voice can be pinned per NPC so the blacksmith
 * doesn't change voices between visits; omit it for a random voice.
 *
 * Anti-overlap: reuses the bark cooldown discipline — one dialogue line at a
 * time globally, short cooldown between lines. A trigger inside the cooldown
 * is dropped, not queued.
 */

import { getAudioManager } from "./AudioManager.js";

/** The four greeting-pack voices. */
export type GreetVoice = "ronan" | "aria" | "vincent" | "paloma";

/** Small-talk topics with a voiced line each. */
export type SmallTalkTopic =
  | "hello"
  | "howareyou"
  | "goodtosee"
  | "yourname"
  | "wherefrom"
  | "wherelive"
  | "whatbrings"
  | "laugh"
  | "joking"
  | "takecare"
  | "seeyou"
  | "safetravels";

/** Greeting openers — the first thing an NPC says. */
const GREETINGS: SmallTalkTopic[] = ["hello", "howareyou", "goodtosee"];

/** Farewells — the last thing an NPC says. */
const FAREWELLS: SmallTalkTopic[] = ["takecare", "seeyou", "safetravels"];

/** Manifest id for a voice + topic. */
function greetId(voice: GreetVoice, topic: SmallTalkTopic): string {
  return `vox-greet-${voice}-${topic}`;
}

const VOICES: GreetVoice[] = ["ronan", "aria", "vincent", "paloma"];

function randomVoice(): GreetVoice {
  return VOICES[Math.floor(Math.random() * VOICES.length)]!;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Cooldown state — one dialogue line at a time. */
let lastPlayAt = 0;
const COOLDOWN_MS = 1500;

function cooledDown(): boolean {
  const now = Date.now();
  if (now - lastPlayAt < COOLDOWN_MS) return false;
  lastPlayAt = now;
  return true;
}

/**
 * Play a greeting when the player talks to an NPC.
 * Pin `voice` per NPC for a consistent voice; omit for random.
 */
export function greetNpc(voice?: GreetVoice): void {
  if (!cooledDown()) return;
  const v = voice ?? randomVoice();
  const topic = pick(GREETINGS);
  void getAudioManager().playSfx(greetId(v, topic)).catch(() => {});
}

/**
 * Play a farewell when the player leaves an NPC conversation.
 */
export function farewellNpc(voice?: GreetVoice): void {
  if (!cooledDown()) return;
  const v = voice ?? randomVoice();
  const topic = pick(FAREWELLS);
  void getAudioManager().playSfx(greetId(v, topic)).catch(() => {});
}

/**
 * Play a specific small-talk line. Use for quest dialogue beats:
 * - "yourname" when the NPC introduces themselves or asks the player's name
 * - "wherefrom"/"wherelive" for background questions
 * - "whatbrings" when asking why the player is here
 * - "laugh"/"joking" for humor beats
 */
export function npcSmallTalk(topic: SmallTalkTopic, voice?: GreetVoice): void {
  if (!cooledDown()) return;
  const v = voice ?? randomVoice();
  void getAudioManager().playSfx(greetId(v, topic)).catch(() => {});
}

/**
 * Assign a stable voice to an NPC by id (e.g. notable id or name hash).
 * Same NPC always gets the same voice.
 */
export function voiceForNpc(npcId: string): GreetVoice {
  let hash = 0;
  for (let i = 0; i < npcId.length; i++) {
    hash = (hash * 31 + npcId.charCodeAt(i)) | 0;
  }
  return VOICES[Math.abs(hash) % VOICES.length]!;
}
