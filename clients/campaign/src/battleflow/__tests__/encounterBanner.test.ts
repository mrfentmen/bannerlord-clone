/**
 * @vitest-environment jsdom
 *
 * Tests for the encounter banner: "Hostile force encountered!".
 *
 * The banner is the surface between the poller and the battle overlay, so what matters
 * here is what the player is told, what they can do about it, and what is not done on
 * their behalf.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { encounterBanner, MAX_QUEUED_OFFERS, type EncounterBannerHandle } from "../encounterBanner";
import type { Encounter } from "../types";

const yours = { partyId: 1, name: "Player Warband", troops: 100, power: 120 };
const theirs = { partyId: 2, name: "Rival Gang", troops: 80, power: 90 };

function encounter(id: string, over: Partial<Encounter> = {}): Encounter {
  return { id, attacker: yours, defender: theirs, status: "pending", ...over };
}

const open: EncounterBannerHandle[] = [];
afterEach(() => {
  while (open.length > 0) open.pop()!.destroy();
  document.body.innerHTML = "";
});

function offer() {
  const onMeet = vi.fn<(e: Encounter) => void>();
  const banner = encounterBanner({ playerPartyId: 1, onMeet });
  open.push(banner);
  document.body.appendChild(banner.root);
  return { banner, onMeet };
}

function click(banner: EncounterBannerHandle, testId: string): void {
  const el = banner.root.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  expect(el, testId).not.toBeNull();
  el!.click();
}

describe("the encounter banner", () => {
  it("stays hidden until there is something to say", () => {
    const { banner } = offer();
    expect(banner.root.hidden).toBe(true);
    expect(banner.root.textContent).toBe("");
  });

  it("announces the encounter politely, naming the player's own side", () => {
    const { banner } = offer();
    banner.offer(encounter("enc-1"));

    expect(banner.root.hidden).toBe(false);
    expect(banner.root.getAttribute("role")).toBe("status");
    expect(banner.root.getAttribute("aria-live")).toBe("polite");
    expect(banner.root.querySelector("[data-testid='encounter-headline']")!.textContent).toBe(
      "Hostile force encountered!",
    );
    const detail = banner.root.querySelector("[data-testid='encounter-detail']")!.textContent ?? "";
    expect(detail).toContain("Player Warband");
    expect(detail).toContain("Rival Gang");
  });

  it("names the other side as the player's when the player is defending", () => {
    const { banner } = offer();
    banner.offer(
      encounter("enc-2", {
        attacker: theirs,
        defender: yours,
      }),
    );
    const detail = banner.root.querySelector("[data-testid='encounter-detail']")!.textContent ?? "";
    expect(detail).toMatch(/Your Player Warband \(100\) has met Rival Gang \(80\)/);
  });

  it("does not take focus when it appears", () => {
    const { banner } = offer();
    const before = document.activeElement;
    banner.offer(encounter("enc-1"));
    expect(document.activeElement).toBe(before);
  });

  it("opens the battle UI when the player meets the force, and then gets out of the way", () => {
    const { banner, onMeet } = offer();
    banner.offer(encounter("enc-1"));
    expect(banner.current).not.toBeNull();

    click(banner, "encounter-meet");

    expect(onMeet).toHaveBeenCalledTimes(1);
    expect(onMeet.mock.calls[0]![0].id).toBe("enc-1");
    expect(banner.root.hidden).toBe(true);
    expect(banner.current).toBeNull();
  });

  it("leaves the encounter alone when the player walks away, and offers the next one", () => {
    const { banner, onMeet } = offer();
    banner.offer(encounter("enc-1"));
    banner.offer(encounter("enc-2"));
    expect(banner.queued).toBe(1);

    click(banner, "encounter-dismiss");

    expect(onMeet).not.toHaveBeenCalled();
    expect(banner.current!.id).toBe("enc-2");
    expect(banner.queued).toBe(0);
  });

  it("holds a bounded queue and says how many are waiting", () => {
    const { banner } = offer();
    banner.offer(encounter("enc-1"));
    for (let i = 0; i < MAX_QUEUED_OFFERS + 4; i += 1) {
      banner.offer(encounter(`enc-queued-${i}`));
    }
    expect(banner.queued).toBe(MAX_QUEUED_OFFERS);
    const queued = banner.root.querySelector("[data-testid='encounter-queued']")!.textContent ?? "";
    expect(queued).toContain(String(MAX_QUEUED_OFFERS));
  });

  it("shows a polling failure in the same surface, and withdraws it when an offer arrives", () => {
    const { banner } = offer();
    banner.reportProblem("The battle server is not answering.");

    expect(banner.root.hidden).toBe(false);
    expect(banner.root.textContent).toContain("The battle server is not answering.");

    banner.offer(encounter("enc-1"));
    expect(banner.root.querySelector("[data-testid='encounter-problem']")).toBeNull();
  });

  it("reports a battle server that stopped answering without hiding the offer", () => {
    const { banner } = offer();
    banner.offer(encounter("enc-1"));
    banner.reportProblem("Nothing was decided.");

    expect(banner.root.querySelector("[data-testid='encounter-headline']")).not.toBeNull();
    // The problem is not shown over an offer that is still waiting: the encounter is the
    // news, and the encounter is answerable.
    expect(banner.root.querySelector("[data-testid='encounter-problem']")).toBeNull();
  });

  it("clear takes the offer down without offering it again", () => {
    const { banner } = offer();
    banner.offer(encounter("enc-1"));
    banner.clear();
    expect(banner.root.hidden).toBe(true);
    expect(banner.current).toBeNull();
  });

  it("destroy removes the banner from the page", () => {
    const { banner } = offer();
    const root = banner.root;
    banner.destroy();
    open.pop();
    expect(document.body.contains(root)).toBe(false);
  });
});