/**
 * Family feast event chain (Rowan solo task 52).
 *
 * A feast unfolds in five stages; each stage offers the player a choice
 * and resolves it into relation/prestige/gold outcomes. Choices are
 * deterministic from the feast seed so replays agree.
 */

export type FeastStage = "arrival" | "toast" | "entertainment" | "incident" | "farewell";

export const FEAST_STAGES: FeastStage[] = ["arrival", "toast", "entertainment", "incident", "farewell"];

export interface FeastChoice {
  id: string;
  text: string;
  /** Short hint shown before choosing. */
  hint: string;
}

export interface FeastOutcome {
  stage: FeastStage;
  choiceId: string;
  text: string;
  /** guestId -> relation delta. */
  relationDeltas: Record<string, number>;
  prestige: number;
  gold: number;
}

export interface FeastGuestRef {
  id: string;
  name: string;
}

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function draw(seed: number): number {
  let s = seed >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x21f0aaad);
  s = Math.imul(s ^ (s >>> 15), 0x735a2d97);
  return ((s ^ (s >>> 15)) >>> 0) / 4294967296;
}

/** The choices offered at each stage. */
export function feastChoices(stage: FeastStage): FeastChoice[] {
  switch (stage) {
    case "arrival":
      return [
        { id: "greet-personally", text: "Greet each guest personally", hint: "Warm, but takes all evening." },
        { id: "grand-entrance", text: "Make a grand entrance", hint: "Prestigious, but distant." },
      ];
    case "toast":
      return [
        { id: "toast-fallen", text: "Toast the fallen", hint: "Moves the old warriors." },
        { id: "toast-future", text: "Toast the clan's future", hint: "Pleases the young and ambitious." },
      ];
    case "entertainment":
      return [
        { id: "pay-minstrels", text: "Hire the famous minstrels (−150 gold)", hint: "Everyone loves a good song." },
        { id: "wrestling", text: "Hold a wrestling bout", hint: "Rowdy; someone may get hurt." },
      ];
    case "incident":
      return [
        { id: "smooth-over", text: "Smooth over the insult with wine", hint: "Costs gold, saves face." },
        { id: "take-side", text: "Take your guest's side", hint: "One friend gained, one enemy made." },
      ];
    case "farewell":
      return [
        { id: "gifts", text: "Send guests home with gifts (−100 gold)", hint: "They'll remember this feast." },
        { id: "early-night", text: "End the night early", hint: "Frugal, but forgettable." },
      ];
  }
}

/**
 * Resolve a stage choice into an outcome. Deterministic from feast seed +
 * stage + choice.
 */
export function resolveFeastStage(
  feastSeed: number,
  stage: FeastStage,
  choiceId: string,
  guests: FeastGuestRef[],
): FeastOutcome {
  const valid = feastChoices(stage).some((c) => c.id === choiceId);
  if (!valid) throw new Error(`unknown feast choice: ${choiceId} for stage ${stage}`);
  const roll = draw(hash(`${feastSeed}:${stage}:${choiceId}`));
  const relationDeltas: Record<string, number> = {};
  for (const g of guests) relationDeltas[g.id] = 0;

  let text = "";
  let prestige = 0;
  let gold = 0;
  const boost = (amount: number): void => {
    for (const g of guests) relationDeltas[g.id] = (relationDeltas[g.id] ?? 0) + amount;
  };

  switch (choiceId) {
    case "greet-personally":
      text = "You clasp every hand at the door. The hall warms to you.";
      boost(4); prestige = 2; break;
    case "grand-entrance":
      text = "Trumpets. Silence. Every eye follows you to the high seat.";
      boost(2); prestige = 6; break;
    case "toast-fallen":
      text = "Old warriors weep into their cups and swear by your name.";
      boost(3); prestige = 3; break;
    case "toast-future":
      text = "The young pound the tables; the old exchange glances.";
      boost(roll < 0.5 ? 4 : 1); prestige = 3; break;
    case "pay-minstrels":
      text = "The minstrels sing until dawn. None will forget this night.";
      boost(5); prestige = 4; gold = -150; break;
    case "wrestling":
      text = roll < 0.7
        ? "The bout ends in laughter and bruised ribs."
        : "The bout ends with a broken nose and a grudge.";
      boost(roll < 0.7 ? 3 : -2); prestige = 2; break;
    case "smooth-over":
      text = "Wine flows; the insult drowns in it.";
      boost(2); gold = -50; break;
    case "take-side":
      text = "You back your guest. One friendship deepens; another cools.";
      if (guests[0]) relationDeltas[guests[0].id] = 6;
      if (guests[1]) relationDeltas[guests[1].id] = -4;
      prestige = 1; break;
    case "gifts":
      text = "Guests ride home laden with gifts, singing your praises.";
      boost(4); prestige = 3; gold = -100; break;
    case "early-night":
      text = "The hall empties early. Sensible — and forgettable.";
      boost(0); prestige = -1; break;
    default:
      text = "The feast continues.";
  }
  return { stage, choiceId, text, relationDeltas, prestige, gold };
}
