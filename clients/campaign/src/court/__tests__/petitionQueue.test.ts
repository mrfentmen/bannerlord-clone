/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  daysLeft,
  dequeuePetition,
  expirePetitions,
  filePetition,
  petitionQueue,
} from "../petitionQueue.js";

const petition = {
  id: "pet-1",
  kind: "grain-shortage" as const,
  petitioner: "Miller Odo",
  text: "The granary runs low.",
};

beforeEach(() => localStorage.clear());

describe("petition queue with deadlines (solo task 55)", () => {
  it("files petitions with deadlines", () => {
    filePetition(petition, 10, 5);
    const queue = petitionQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]!.deadlineDay).toBe(15);
    expect(daysLeft(queue[0]!, 12)).toBe(3);
  });

  it("sorts by soonest deadline", () => {
    filePetition({ ...petition, id: "pet-2" }, 10, 9);
    filePetition(petition, 10, 3);
    const queue = petitionQueue();
    expect(queue[0]!.id).toBe("pet-1");
  });

  it("expires overdue petitions with consequences", () => {
    filePetition(petition, 10, 5);
    const expiries = expirePetitions(16);
    expect(expiries).toHaveLength(1);
    expect(expiries[0]!.repDelta).toBe(-6);
    expect(expiries[0]!.line).toContain("expired unanswered");
    expect(petitionQueue()).toHaveLength(0);
  });

  it("does not expire petitions on time", () => {
    filePetition(petition, 10, 5);
    expect(expirePetitions(15)).toHaveLength(0);
    expect(petitionQueue()).toHaveLength(1);
  });

  it("dequeue removes resolved petitions", () => {
    filePetition(petition, 10, 5);
    dequeuePetition("pet-1");
    expect(petitionQueue()).toHaveLength(0);
  });
});
