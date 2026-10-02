/**
 * Clan & family hub (MASTER_PLAN 3A, tasks 76-84).
 */

export * from "./types.js";
export * from "./familyTree.js";
export * from "./hideout.js";
export { createTreeViewer, type TreeViewerOptions } from "./treeViewer.js";
export * from "./marriage.js";
export * from "./education.js";
export * from "./succession.js";
export * from "./banner.js";
export * from "./bannerPalette.js";
export * from "./companions.js";
export * from "./loyalty.js";
export { lawsPanel, type LawsRoster, type LawsPanelOptions, type LawsPanelHandle } from "./lawsPanel.js";
export * from "./comingOfAge.js";
export * from "./extinctionWarning.js";
export { createClanRoles, CLAN_ROLES, type ClanRole, type OfficeCandidate, type ClanRoleAssignment, type ClanRoles } from "./roles.js";
export { ceremonyLine, NAME_CULTURES, suggestNames, validateName, type CeremonyName, type NameCulture, type NameValidation } from "./namingCeremony.js";
export { completeRecruitmentStage, RECRUITMENT_CHAINS, recruitmentProgress, type RecruitmentChain, type RecruitmentProgress, type RecruitmentStage } from "./recruitment.js";
export { previewLawEffects, type LawEffect, type LawEffectsPreview } from "./lawEffects.js";
export { bannerShieldSvg, shieldPreview, type ShieldPreviewOptions } from "./bannerPreview.js";

export { assignClanRole, clanLoyaltyAlerts, clanRoles, clearClanStore, influenceCompanion, loadClanStore, roleAssignments, saveClanStore, setRuler, unassignClanRole, upsertCompanion, upsertMember, type ClanStore } from "./store.js";
