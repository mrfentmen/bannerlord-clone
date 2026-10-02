/**
 * Diplomacy hub (MASTER_PLAN 3E, tasks 109-115).
 */

export * from "./types.js";
export * from "./envoys.js";
export * from "./negotiation.js";
export * from "./statecraft.js";
export * from "./deals.js";
export * from "./notables.js";
export * from "./weariness.js";
export * from "./herald.js";
export { adjustRelation, relationNotifications, relationWith, type RelationNotification } from "./relationNotifications.js";
export { markTerm, signTreaty, treatyCompliance, type Treaty, type TreatyStatus, type TreatyTerm, type TermStatus } from "./treaties.js";
export { activeWars, declareWarGoal, exhaustedWars, tickWarWeariness, wearinessPerSeason, WAR_GOAL_DESCRIPTIONS, WAR_GOALS, type DeclaredWar, type WarGoal } from "./warGoals.js";
export { acceptanceOdds, EMPTY_PEACE_TERMS, negotiatePeace, type PeaceNegotiation, type PeaceTerms } from "./peaceConcessions.js";
export { ATTACK_AXES, plannedOperations, planJointOperation, setOperationStatus, type AttackAxis, type JointOperation, type OperationPlan, type PlanJointOpInput } from "./jointOperations.js";
export { suggestTribute, type TributeSuggestion } from "./tributeCalculator.js";
export { diplomaticReputation, driftReputation, recordReputationAction, reputationMeterLine, reputationTitle, REPUTATION_ACTIONS, REPUTATION_EFFECTS, REPUTATION_DRIFT, type ReputationAction } from "./reputation.js";
