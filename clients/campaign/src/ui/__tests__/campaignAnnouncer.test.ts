/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  _resetCampaignAnnouncerForTests,
  announceCampaign,
  campaignAnnouncerRegion,
  mountCampaignAnnouncer,
} from "../campaignAnnouncer.js";

describe("screen-reader campaign announcements (solo task 19)", () => {
  it("mounts a polite live region", () => {
    _resetCampaignAnnouncerForTests();
    const region = mountCampaignAnnouncer();
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("data-testid")).toBe("campaign-announcer");
  });

  it("mounting twice returns the same region", () => {
    _resetCampaignAnnouncerForTests();
    const a = mountCampaignAnnouncer();
    const b = mountCampaignAnnouncer();
    expect(a).toBe(b);
    expect(document.querySelectorAll('[data-testid="campaign-announcer"]').length).toBe(1);
  });

  it("announces town and dilemma events", () => {
    _resetCampaignAnnouncerForTests();
    mountCampaignAnnouncer();
    announceCampaign("Entered New York. The market is open.");
    expect(campaignAnnouncerRegion()?.textContent).toBe("Entered New York. The market is open.");
    announceCampaign("Dilemma: a caravan asks for escort.");
    expect(campaignAnnouncerRegion()?.textContent).toBe("Dilemma: a caravan asks for escort.");
  });

  it("is a silent no-op before mounting", () => {
    _resetCampaignAnnouncerForTests();
    expect(() => announceCampaign("nobody hears this")).not.toThrow();
    expect(campaignAnnouncerRegion()).toBeNull();
  });
});
