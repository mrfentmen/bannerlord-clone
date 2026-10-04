/**
 * Sound hooks for the Bannerlord systems (Pax's lane).
 *
 * Hana built the sound bus and all the SFX/voice assets; this module is
 * the call site — one semantic function per game event, so the panels
 * say what happened and the bus decides what it sounds like.
 *
 * Every function is safe to call when audio is unavailable: the bus
 * no-ops on unknown events or when muted.
 */

import { getSoundBus } from "./soundEvents.js";
import { greetNpc, farewellNpc, npcSmallTalk, voiceForNpc } from "./greetDialogue.js";

// -- Party ---------------------------------------------------------------

/** Forced march toggled on or off. */
export function soundForcedMarch(on: boolean): void {
  getSoundBus().play("ui.toggle");
  if (on) getSoundBus().play("combat.drum-roll");
}

/** Arms smelted into metal. */
export function soundSmelt(): void {
  getSoundBus().play("workshop.craft");
}

/** A weapon forged at the bench. Masterworks get the achievement sting. */
export function soundForge(quality: string): void {
  getSoundBus().play("workshop.craft");
  if (quality === "masterwork") getSoundBus().play("achievement");
}

/** A crafting order delivered: coins and a happy patron. */
export function soundOrderFulfilled(): void {
  getSoundBus().play("ui.gold-gain");
  getSoundBus().play("objective.complete");
}

/** Prison break resolved. */
export function soundPrisonBreak(success: boolean): void {
  getSoundBus().play(success ? "objective.complete" : "objective.failed");
  if (!success) getSoundBus().play("prison.lock");
}

/** Troops freed and rejoining. */
export function soundTroopsFreed(): void {
  getSoundBus().play("morale-up");
}

// -- Battle --------------------------------------------------------------

/** An NPC-vs-NPC battle resolved on the campaign map. */
export function soundNpcBattle(winnerIsPlayerFaction: boolean): void {
  getSoundBus().play("combat.horn");
  if (winnerIsPlayerFaction) getSoundBus().play("combat.drum-roll");
}

/** Cavalry charge with couched lances. */
export function soundCavalryCharge(): void {
  getSoundBus().play("combat.gallop");
  getSoundBus().play("combat.charge");
}

/** A duel exchange resolved. */
export function soundDuelExchange(outcome: string): void {
  const bus = getSoundBus();
  if (outcome.includes("Feint")) bus.play("combat.swing");
  else if (outcome.includes("Chambered")) bus.play("combat.parry");
  else if (outcome.includes("Blocked")) bus.play("combat.shield-block");
  else if (outcome.includes("kick") || outcome.includes("Bash") || outcome.includes("pommel")) {
    bus.play("combat.hit");
  } else bus.play("combat.swing");
}

/** A duel ends. */
export function soundDuelEnd(playerWon: boolean): void {
  getSoundBus().play(playerWon ? "objective.complete" : "objective.failed");
  getSoundBus().play("combat.body-fall");
}

// -- Contracts & politics ------------------------------------------------

/** Mercenary contract signed. */
export function soundContractSigned(): void {
  getSoundBus().play("ui.confirm");
  getSoundBus().play("trade.coin");
}

/** Mercenary victory pay lands. */
export function soundMercenaryPay(): void {
  getSoundBus().play("ui.gold-gain");
}

/** Contract broken or expired. */
export function soundContractEnded(broken: boolean): void {
  getSoundBus().play(broken ? "ui.error" : "notification.alert");
}

/** A governor takes office. */
export function soundGovernorAssigned(): void {
  getSoundBus().play("ui.confirm");
}

/** A barter deal closes — or falls apart. */
export function soundBarter(accepted: boolean): void {
  getSoundBus().play(accepted ? "trade.accepted" : "ui.error");
}

/** A clan defects. */
export function soundDefection(): void {
  getSoundBus().play("notification.alert");
  getSoundBus().play("combat.drum-roll");
}

/** Persuasion attempted. */
export function soundPersuasion(success: boolean): void {
  getSoundBus().play(success ? "objective.complete" : "objective.failed");
}

// -- Life & death ----------------------------------------------------------

/** A child is born. */
export function soundBirth(): void {
  getSoundBus().play("morale-up");
}

/** A companion falls in battle. */
export function soundCompanionDeath(): void {
  getSoundBus().play("objective.failed");
  getSoundBus().play("combat.body-fall");
}

// -- Voice -----------------------------------------------------------------

/** Greet an NPC by id (stable voice per NPC). */
export function voiceGreet(npcId: string): void {
  greetNpc(voiceForNpc(npcId));
}

/** Farewell an NPC by id. */
export function voiceFarewell(npcId: string): void {
  farewellNpc(voiceForNpc(npcId));
}

/** Small talk for a dialogue beat. */
export function voiceSmallTalk(
  topic: "yourname" | "wherefrom" | "wherelive" | "whatbrings" | "laugh" | "joking",
  npcId: string,
): void {
  npcSmallTalk(topic, voiceForNpc(npcId));
}
