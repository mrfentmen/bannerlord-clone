/**
 * Companion recruitment missions (Rowan solo task 54).
 *
 * Named companions are recruited through a short mission chain: each
 * mission has a requirement and a choice; completing all stages recruits
 * the companion. Progress persists in localStorage.
 */

export interface RecruitmentStage {
  id: string;
  title: string;
  description: string;
  /** Skill name and minimum required, e.g. { skill: "charm", min: 30 }. */
  requirement?: { skill: string; min: number };
}

export interface RecruitmentChain {
  companionId: string;
  companionName: string;
  stages: RecruitmentStage[];
}

export interface RecruitmentProgress {
  companionId: string;
  completedStageIds: string[];
  recruited: boolean;
}

const STORE_KEY = "campaign.recruitment.v1";

export const RECRUITMENT_CHAINS: RecruitmentChain[] = [
  {
    companionId: "comp-kael",
    companionName: "Kael Ironhand",
    stages: [
      { id: "find", title: "Find Kael", description: "Track the smith to his forge in the lower wards." },
      {
        id: "earn-trust",
        title: "Earn his trust",
        description: "Kael respects strength. Best him in a sparring bout or pay his debts.",
        requirement: { skill: "prowess", min: 30 },
      },
      { id: "oath", title: "Swear the oath", description: "Kael kneels and offers his hammer to your cause." },
    ],
  },
  {
    companionId: "comp-sera",
    companionName: "Sera Quickfingers",
    stages: [
      { id: "find", title: "Find Sera", description: "She runs with the rooftop crews. Catch her first." },
      {
        id: "earn-trust",
        title: "Earn her trust",
        description: "Sera values coin and cleverness. Impress her.",
        requirement: { skill: "roguery", min: 30 },
      },
      { id: "oath", title: "Swear the oath", description: "Sera laughs, then kneels. The crew is yours." },
    ],
  },
];

function load(): Record<string, RecruitmentProgress> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw);
    return typeof v === "object" && v !== null ? v : {};
  } catch {
    return {};
  }
}

function save(all: Record<string, RecruitmentProgress>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    // Session-only progress.
  }
}

export function recruitmentProgress(companionId: string): RecruitmentProgress {
  const all = load();
  return all[companionId] ?? { companionId, completedStageIds: [], recruited: false };
}

/**
 * Complete a stage. Throws when the stage is unknown, already done, out
 * of order, or its requirement is unmet. Completing the final stage
 * recruits the companion.
 */
export function completeRecruitmentStage(
  companionId: string,
  stageId: string,
  skills: Record<string, number> = {},
): RecruitmentProgress {
  const chain = RECRUITMENT_CHAINS.find((c) => c.companionId === companionId);
  if (!chain) throw new Error(`unknown recruitment chain: ${companionId}`);
  const stageIdx = chain.stages.findIndex((s) => s.id === stageId);
  if (stageIdx < 0) throw new Error(`unknown recruitment stage: ${stageId}`);
  const progress = recruitmentProgress(companionId);
  if (progress.completedStageIds.includes(stageId)) throw new Error("stage already completed");
  // Stages complete in order.
  const expected = chain.stages[progress.completedStageIds.length];
  if (!expected || expected.id !== stageId) {
    throw new Error(`complete "${expected?.id ?? "none"}" first`);
  }
  const stage = chain.stages[stageIdx]!;
  if (stage.requirement) {
    const have = skills[stage.requirement.skill] ?? 0;
    if (have < stage.requirement.min) {
      throw new Error(`needs ${stage.requirement.skill} ${stage.requirement.min} (have ${have})`);
    }
  }
  progress.completedStageIds.push(stageId);
  if (progress.completedStageIds.length === chain.stages.length) progress.recruited = true;
  const all = load();
  all[companionId] = progress;
  save(all);
  return { ...progress, completedStageIds: [...progress.completedStageIds] };
}
