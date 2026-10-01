/**
 * Task 78: child education. Assign a tutor to a child for a skill; each
 * season tick grows the skill toward the tutor's level. Growth is faster for
 * young children and slows near the tutor's own skill (diminishing returns).
 */

import type { ClanMember, TutorAssignment } from "./types.js";

export interface EducationState {
  members: Map<string, ClanMember>;
  assignments: TutorAssignment[];
}

export function createEducation(members: ClanMember[]): EducationState {
  return { members: new Map(members.map((m) => [m.id, m])), assignments: [] };
}

export function assignTutor(state: EducationState, assignment: TutorAssignment): void {
  const child = state.members.get(assignment.childId);
  const tutor = state.members.get(assignment.tutorId);
  if (!child) throw new Error(`unknown child: ${assignment.childId}`);
  if (!tutor) throw new Error(`unknown tutor: ${assignment.tutorId}`);
  if (assignment.childId === assignment.tutorId) throw new Error("a tutor cannot teach themselves");
  state.assignments = state.assignments.filter((a) => a.childId !== assignment.childId);
  state.assignments.push(assignment);
}

/**
 * Advance one season. Returns per-child growth for the report UI.
 * Skill grows by up to (tutorSkill - childSkill) * rate, rate 0.06-0.12.
 */
export function tickSeason(state: EducationState, currentYear: number): { childId: string; skill: string; gained: number }[] {
  const report: { childId: string; skill: string; gained: number }[] = [];
  for (const a of state.assignments) {
    const child = state.members.get(a.childId);
    const tutor = state.members.get(a.tutorId);
    if (!child || !tutor) continue;
    const age = currentYear - child.birthYear;
    if (age < 4 || age > 18) continue; // outside schooling years
    const tutorSkill = tutor.skills[a.skill] ?? 0;
    const childSkill = child.skills[a.skill] ?? 0;
    if (tutorSkill <= childSkill) continue;
    const youthBonus = age < 10 ? 1.4 : 1;
    const gained = Math.min(tutorSkill - childSkill, (tutorSkill - childSkill) * 0.09 * youthBonus + 0.5);
    child.skills[a.skill] = Math.min(100, childSkill + gained);
    report.push({ childId: a.childId, skill: a.skill, gained });
  }
  return report;
}
