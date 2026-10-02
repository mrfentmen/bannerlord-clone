/**
 * Codex public surface (MASTER_PLAN task 123).
 */

export type { CodexCategory, CodexEntry } from "./types.js";
export { CODEX_CATEGORIES, CODEX_CATEGORY_LABEL } from "./types.js";
export { searchCodex, getEntry } from "./search.js";
export { ALL_CODEX_ENTRIES, CODEX_ENTRY_COUNT } from "./corpus.js";
export { auditCodexCoverage, GAME_SYSTEMS, type CodexAuditResult } from "./audit.js";
