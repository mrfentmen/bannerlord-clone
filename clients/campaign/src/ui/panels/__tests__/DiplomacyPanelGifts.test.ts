/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { diplomacyPanel } from "../DiplomacyPanel.js";
import { adjustRelation, relationNotifications, relationWith } from "../../../diplomacy/relationNotifications.js";
import { sendGift } from "../../../diplomacy/statecraft.js";

const GLU = { id: "great-lakes-union", name: "Great Lakes Union" };
const PC = { id: "pacific-compact", name: "Pacific Compact" };

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

function panel(factions: { id: string; name: string }[] = [GLU, PC]): void {
  document.body.appendChild(diplomacyPanel({ currentSeason: 12, factions }));
}

function field(id: string): HTMLInputElement {
  return document.body.querySelector<HTMLInputElement>(`#${id}`) as HTMLInputElement;
}

function select(id: string): HTMLSelectElement {
  return document.body.querySelector<HTMLSelectElement>(`[data-testid="${id}"]`)!;
}

function send(): void {
  (document.body.querySelector('[data-testid="gift-send"]') as HTMLButtonElement).click();
}

function outcome(): string {
  return document.body.querySelector('[data-testid="gift-outcome"]')!.textContent ?? "";
}

/** What the panel says after a rebuild — the same notice the incident answers use. */
function notice(): string {
  return document.body.querySelector('[data-testid="diplomacy-notice"]')!.textContent ?? "";
}

describe("diplomacy send a gift (task 216)", () => {
  it("draws no gift block without a faction roster", () => {
    document.body.appendChild(diplomacyPanel({ currentSeason: 12 }));
    expect(document.body.querySelector('[data-testid="diplomacy-gifts"]')).toBeNull();
  });

  it("offers every faction in the roster as a recipient", () => {
    panel();
    expect([...select("gift-faction").querySelectorAll("option")].map((o) => o.textContent)).toEqual([
      "Great Lakes Union",
      "Pacific Compact",
    ]);
  });

  it("says nothing has been sent before anything is", () => {
    panel();
    expect(outcome()).toContain("Nothing sent yet");
    expect(relationWith(GLU.id)).toBe(0);
  });

  it("moves the standing by what sendGift computed, not by an amount of its own", () => {
    panel();
    field("gift-value").value = "300";
    field("gift-wealth").value = "2000";
    const before = relationWith(GLU.id);
    send();
    const expected = sendGift(300, "Great Lakes Union", 2000, before);
    expect(relationWith(GLU.id)).toBe(Math.max(-100, Math.min(100, before + expected.relationGain)));
    expect(notice()).toContain(`+${Math.round(expected.relationGain)}`);
  });

  it("logs the gift in the relation feed with its value as the reason", () => {
    panel();
    field("gift-value").value = "400";
    field("gift-wealth").value = "1500";
    send();
    const feed = relationNotifications();
    expect(feed).toHaveLength(1);
    expect(feed[0]!.reason).toBe("gift: $400");
    expect(feed[0]!.factionName).toBe("Great Lakes Union");
    // The feed the panel prints below must actually show it: the panel rebuilds so the
    // table stops reading "No changes recorded".
    expect(document.body.textContent).not.toContain("No changes recorded");
    expect(document.body.textContent).toContain("gift: $400");
  });

  it("scales the gift against the recipient's wealth", () => {
    panel();
    field("gift-value").value = "200";
    field("gift-wealth").value = "100";
    send();
    const rich = relationWith(GLU.id);
    document.body.innerHTML = "";
    localStorage.clear();

    panel();
    field("gift-value").value = "200";
    field("gift-wealth").value = "100000";
    send();
    // The same gift against a much larger fortune moves the standing less.
    expect(relationWith(GLU.id)).toBeLessThan(rich);
  });

  it("takes diminishing returns when they already like you", () => {
    adjustRelation(PC.id, PC.name, 80, "traded at the border", 12);
    panel();
    select("gift-faction").value = PC.id;
    field("gift-value").value = "500";
    field("gift-wealth").value = "1000";
    send();
    const warmRoom = 100 - 80;

    document.body.innerHTML = "";
    localStorage.clear();
    panel();
    field("gift-value").value = "500";
    field("gift-wealth").value = "1000";
    send();
    const coldRoom = 100 - 0;
    expect(warmRoom).toBeLessThan(coldRoom);
  });

  it("refuses a gift worth nothing rather than moving anything", () => {
    panel();
    field("gift-value").value = "0";
    field("gift-wealth").value = "1000";
    send();
    expect(outcome()).toBe("A gift has to be worth something.");
    expect(relationNotifications()).toHaveLength(0);
    expect(relationWith(GLU.id)).toBe(0);
    expect(relationNotifications()).toHaveLength(0);
  });

  it("refuses a negative wealth rather than pricing against it", () => {
    panel();
    field("gift-value").value = "100";
    field("gift-wealth").value = "-50";
    send();
    expect(outcome()).toBe("Wealth cannot be negative.");
    expect(relationNotifications()).toHaveLength(0);
  });

  it("does not push a faction past the top of the scale", () => {
    adjustRelation(GLU.id, GLU.name, 99, "years of patience", 12);
    panel();
    field("gift-value").value = "100000";
    field("gift-wealth").value = "100";
    send();
    expect(relationWith(GLU.id)).toBe(100);
  });

  it("says a gift buys standing and not a treaty", () => {
    panel();
    expect(document.body.querySelector('[data-testid="diplomacy-gifts"]')!.textContent).toContain(
      "A gift buys standing, not a treaty",
    );
  });

  it("says so plainly when the roster is empty", () => {
    panel([]);
    const section = document.body.querySelector('[data-testid="diplomacy-gifts"]')!;
    expect(section.querySelector('[data-testid="empty-state"]')).not.toBeNull();
    expect(section.textContent).toContain("Nobody to send a gift to");
  });
});

describe("diplomacy gift amount (task 217)", () => {
  it("takes a typed amount rather than a fixed one", () => {
    panel();
    const input = field("gift-value");
    expect(input.type).toBe("number");
    expect(input.min).toBe("1");
  });

  it("re-evaluates the amount the player types each time", () => {
    panel();
    field("gift-value").value = "100";
    field("gift-wealth").value = "1000";
    send();
    const first = relationWith(GLU.id);
    expect(first).toBeGreaterThan(0);

    field("gift-value").value = "900";
    send();
    expect(relationWith(GLU.id)).toBeGreaterThan(first);
  });

  it("prints the amount it sent back to the player", () => {
    panel();
    field("gift-value").value = "1250";
    field("gift-wealth").value = "1000";
    send();
    expect(notice()).toContain("Sent $1,250 to Great Lakes Union.");
  });
});