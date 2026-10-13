import { describe, expect, it } from "vitest";
import { CAMPAIGN_STORAGE_KEYS, resetCampaign } from "../resetCampaign.js";

function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe("full campaign reset (solo task 9)", () => {
  it("wipes every known campaign key and reports them", () => {
    const s = memStorage();
    for (const key of CAMPAIGN_STORAGE_KEYS) s.setItem(key, "x");
    // Unrelated keys (settings, other apps) must survive.
    s.setItem("campaign.settings", "prefs");
    s.setItem("some.other.app", "data");

    const removed = resetCampaign(s);
    expect(removed).toEqual([...CAMPAIGN_STORAGE_KEYS]);
    for (const key of CAMPAIGN_STORAGE_KEYS) {
      expect(s.getItem(key)).toBeNull();
    }
    expect(s.getItem("campaign.settings")).toBe("prefs");
    expect(s.getItem("some.other.app")).toBe("data");
  });

  it("only reports keys that were present", () => {
    const s = memStorage();
    s.setItem("campaign.memorial.v1", "x");
    expect(resetCampaign(s)).toEqual(["campaign.memorial.v1"]);
    expect(resetCampaign(s)).toEqual([]);
  });

  it("covers the major campaign systems", () => {
    const joined = CAMPAIGN_STORAGE_KEYS.join("\n");
    for (const key of [
      "fentmen.newgameplus.v1",
      "fentmen.ironman.v1",
      "fentmen.chronicle.v1",
      "campaign.guidedStart.v1",
      "campaign.memorial.v1",
      "campaign.tradeRoutes.v1",
    ]) {
      expect(joined).toContain(key);
    }
  });
});
