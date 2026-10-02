/**
 * Per-campaign store isolation tests (Rowan). The pure decision logic:
 * fingerprinting, the reset predicate, and best-effort storage clearing.
 * The main.ts wiring (in-memory store resets) is covered by the store
 * modules' own clear() tests.
 */

import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_FINGERPRINT_KEY,
  campaignFingerprint,
  clearStorageKeys,
  readStoredFingerprint,
  shouldResetCampaignStores,
  writeStoredFingerprint,
  type CampaignIdentity,
} from "../campaignReset.js";

function identity(overrides: Partial<CampaignIdentity> = {}): CampaignIdentity {
  return {
    characterName: "John",
    factionId: "nyc",
    ethnicityId: "eth-1",
    age: 30,
    day: 0,
    ...overrides,
  };
}

function memStore(initial: Record<string, string> = {}): Storage {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  } as Storage;
}

describe("campaignFingerprint", () => {
  it("is deterministic for the same campaign", () => {
    expect(campaignFingerprint(identity())).toBe(campaignFingerprint(identity()));
  });

  it("changes when any identity field changes", () => {
    const base = campaignFingerprint(identity());
    expect(campaignFingerprint(identity({ characterName: "Jane" }))).not.toBe(base);
    expect(campaignFingerprint(identity({ factionId: "la" }))).not.toBe(base);
    expect(campaignFingerprint(identity({ ethnicityId: "eth-2" }))).not.toBe(base);
    expect(campaignFingerprint(identity({ age: 31 }))).not.toBe(base);
    // A resumed campaign keeps advancing its clock; a new one restarts it.
    expect(campaignFingerprint(identity({ day: 50 }))).not.toBe(base);
  });

  it("is unambiguous when names contain separators or quotes", () => {
    const tricky = campaignFingerprint(identity({ characterName: 'a|b","c' }));
    const plain = campaignFingerprint(identity({ characterName: "abc" }));
    expect(tricky).not.toBe(plain);
    expect(campaignFingerprint(identity({ characterName: 'a|b","c' }))).toBe(tricky);
  });
});

describe("shouldResetCampaignStores", () => {
  it("resets when no fingerprint was ever recorded", () => {
    expect(shouldResetCampaignStores(null, campaignFingerprint(identity()))).toBe(true);
  });

  it("keeps the stores when the fingerprint matches (resumed campaign)", () => {
    const fp = campaignFingerprint(identity({ day: 50 }));
    expect(shouldResetCampaignStores(fp, fp)).toBe(false);
  });

  it("resets when the fingerprint differs (new campaign)", () => {
    const oldFp = campaignFingerprint(identity({ day: 50 }));
    const newFp = campaignFingerprint(identity({ characterName: "Jane", day: 0 }));
    expect(shouldResetCampaignStores(oldFp, newFp)).toBe(true);
  });
});

describe("fingerprint storage", () => {
  it("round-trips through the fingerprint key", () => {
    const storage = memStore();
    const fp = campaignFingerprint(identity());
    writeStoredFingerprint(storage, fp);
    expect(storage.getItem(CAMPAIGN_FINGERPRINT_KEY)).toBe(fp);
    expect(readStoredFingerprint(storage)).toBe(fp);
  });

  it("reads null when nothing was recorded", () => {
    expect(readStoredFingerprint(memStore())).toBeNull();
  });

  it("never throws on hostile storage", () => {
    const hostile = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(readStoredFingerprint(hostile)).toBeNull();
    expect(() => writeStoredFingerprint(hostile, "fp")).not.toThrow();
  });
});

describe("clearStorageKeys", () => {
  it("removes every listed key and reports them", () => {
    const storage = memStore({ a: "1", b: "2", c: "3" });
    const removed = clearStorageKeys(storage, ["a", "b"]);
    expect(removed).toEqual(["a", "b"]);
    expect(storage.getItem("a")).toBeNull();
    expect(storage.getItem("b")).toBeNull();
    expect(storage.getItem("c")).toBe("3");
  });

  it("treats missing keys as removed without error", () => {
    const storage = memStore();
    expect(clearStorageKeys(storage, ["ghost"])).toEqual(["ghost"]);
  });

  it("keeps going past a throwing key and reports only the successes", () => {
    const backing = memStore({ ok: "1", bad: "2" });
    const flaky: Pick<Storage, "removeItem"> = {
      removeItem: (k: string) => {
        if (k === "bad") throw new Error("denied");
        backing.removeItem(k);
      },
    };
    const removed = clearStorageKeys(flaky, ["ok", "bad"]);
    expect(removed).toEqual(["ok"]);
    expect(backing.getItem("ok")).toBeNull();
    expect(backing.getItem("bad")).toBe("2");
  });
});
