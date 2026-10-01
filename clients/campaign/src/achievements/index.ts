/**
 * Achievements public surface (MASTER_PLAN task 137).
 */

export type {
  AchievementCategory,
  AchievementDef,
  AchievementEvent,
  AchievementProgress,
} from "./types.js";
export { ACHIEVEMENT_CATEGORIES, ACHIEVEMENT_CATEGORY_LABEL } from "./types.js";
export { ACHIEVEMENT_DEFS, ACHIEVEMENT_COUNT } from "./catalog.js";
export {
  ACHIEVEMENTS_STORAGE_KEY,
  createAchievementStore,
  type AchievementStore,
  type StorageLike,
} from "./store.js";
