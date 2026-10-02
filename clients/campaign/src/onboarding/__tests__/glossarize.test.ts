/** Task 124: glossary terms link from text. */

import { describe, expect, it } from "vitest";
import { glossarize, searchGlossary } from "../guides.js";

describe("glossarize (task 124)", () => {
  it("wraps known terms in links", () => {
    const terms = searchGlossary("");
    expect(terms.length).toBeGreaterThan(0);
    const term = terms[0]!.term;
    const out = glossarize(`Watch your ${term} carefully.`);
    expect(out).toContain(`<a class="glossary-link" data-term="${term}">${term}</a>`);
  });

  it("leaves unknown text alone", () => {
    expect(glossarize("plain words here")).toBe("plain words here");
  });
});
