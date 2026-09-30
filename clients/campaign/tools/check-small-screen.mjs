/**
 * Small-screen layout measurement.
 *
 * ART_DIRECTION.md section 13 names the two widths that have to hold — 390 x 844 and
 * 768 x 1024 — and lists what "hold" means: no horizontal page scroll, no clipped
 * text, nothing under 44 x 44 on touch, tap targets at least 8px apart, and the Why
 * panel chain readable at full width without horizontal scrolling.
 *
 * Those are properties of a laid-out document, so they are measured in a real browser
 * rather than reasoned about. jsdom has no layout engine and `getComputedStyle` there
 * ignores media queries, so a jsdom test would happily pass a stylesheet that overflows
 * on a phone. This script is therefore a measurement tool and not a unit test: it
 * prints what it found and exits non-zero when a rule is broken.
 *
 * Run it against a served build:
 *   node tools/check-small-screen.mjs http://127.0.0.1:4178
 */

import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:4178";

/** ART_DIRECTION.md section 13, verbatim requirements. */
const VIEWPORTS = [
  { name: "iPhone-class 390x844", width: 390, height: 844, coarse: true },
  { name: "tablet portrait 768x1024", width: 768, height: 1024, coarse: true },
  { name: "narrow edge 320x568", width: 320, height: 568, coarse: true },
  { name: "desktop 1440x900", width: 1440, height: 900, coarse: false },
];

/** 1px of slack for sub-pixel rounding, which is not a layout bug. */
const EPSILON = 1;

const failures = [];
const notes = [];

/** Everything the page is showing, measured inside the browser. */
const PROBE = () => {
  // These run in the page, not in Node, so the thresholds are declared here too.
  const EPSILON = 1;
  const MIN = 44;
  const GAP = 8;
  const problems = [];

  /**
   * Whether the element sits inside a deliberate horizontal scroller.
   *
   * The rail at narrow widths and the single-line notification ticker both scroll
   * sideways on purpose (ART_DIRECTION.md section 13 asks for exactly that). A chip
   * wider than the viewport inside one of those is the design working, not the layout
   * breaking — the page itself is what must not scroll, and that is checked separately.
   */
  const inScroller = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
    }
    return false;
  };

  // -- 1. no horizontal page scroll.
  const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  if (overflow > 1) {
    problems.push({ kind: "h-scroll", detail: `document overflows by ${overflow}px` });
  }

  // The widest offender, so a failure names a culprit rather than just a number.
  let widest = null;
  for (const el of document.querySelectorAll("body *")) {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > document.documentElement.clientWidth + 1 && !inScroller(el)) {
      const over = Math.round(r.right - document.documentElement.clientWidth);
      if (!widest || over > widest.over) {
        widest = {
          over,
          selector:
            el.tagName.toLowerCase() +
            (el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).join(".")}` : ""),
        };
      }
    }
  }
  if (widest) {
    problems.push({ kind: "h-overflow", detail: `${widest.selector} extends ${widest.over}px past the viewport` });
  }

  // -- 2. no clipped text: scrollWidth beyond clientWidth on a text-bearing element.
  for (const el of document.querySelectorAll(".res__key, .res__figure, .dial__label, .notice__text, .label, .caption, .panel__title, .rail__name, .res__note")) {
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && !inScroller(el)) {
      problems.push({
        kind: "clipped-text",
        detail: `${el.className || el.tagName} text is cut: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`,
      });
    }
  }

  // -- 3 and 4. touch target size and separation.
  const coarse = matchMedia("(pointer: coarse)").matches;
  const controls = Array.from(document.querySelectorAll("button, input, select, a[href], [role='radio']")).filter((el) => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (r.width === 0 || r.height === 0) return false;
    if (style.visibility === "hidden" || style.display === "none") return false;
    // The announcer is off-screen by design and holds no controls.
    if (el.classList.contains("visually-hidden")) return false;
    return true;
  });

  const named = (el) =>
    el.getAttribute("aria-label") || (el.textContent ?? "").trim() || el.getAttribute("title") || "unnamed";
  const idOf = (el) =>
    el.getAttribute("data-testid") ||
    (el.className && typeof el.className === "string" ? el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase());

  for (const el of controls) {
    if (el.getAttribute("aria-hidden") === "true") continue;
    const r = el.getBoundingClientRect();
    if (coarse && (r.width < MIN - EPSILON || r.height < MIN - EPSILON)) {
      problems.push({
        kind: "small-target",
        detail: `${idOf(el)} ("${named(el)}") is ${Math.round(r.width)}x${Math.round(r.height)}, under ${MIN} on touch`,
      });
    }
    if (named(el) === "unnamed") {
      problems.push({ kind: "no-name", detail: `${idOf(el)} has no accessible name` });
    }
  }

  // Adjacent tap targets need a real gap, not a shared 1px border. Two boxes that
  // overlap at all are a mis-tap waiting to happen, which is worse than being close.
  for (let i = 0; i < controls.length; i += 1) {
    for (let j = i + 1; j < controls.length; j += 1) {
      const a = controls[i];
      const b = controls[j];
      if (!a || !b) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (overlapX > 0 && overlapY > 0) {
        problems.push({
          kind: "overlap",
          detail: `${idOf(a)} ("${named(a)}") and ${idOf(b)} ("${named(b)}") overlap by ${Math.round(Math.min(overlapX, overlapY))}px`,
        });
        continue;
      }
      // Boxes that touch but do not overlap still need GAP between them, measured only
      // along the axis where they are side by side.
      const apartX = Math.max(ra.left, rb.left) - Math.min(ra.right, rb.right);
      const apartY = Math.max(ra.top, rb.top) - Math.min(ra.bottom, rb.bottom);
      const apart = Math.max(apartX, apartY);
      const sameRow = overlapX > 0;
      const sameColumn = overlapY > 0;
      if ((sameRow || sameColumn) && apart > 0 && apart < GAP - EPSILON) {
        problems.push({
          kind: "tight-targets",
          detail: `${idOf(a)} and ${idOf(b)} are ${Math.round(apart)}px apart, under the ${GAP}px tap spacing`,
        });
      }
    }
  }

  return { problems, controlCount: controls.length, overflow };
};

/**
 * Walk the start screen so the HUD is actually mounted.
 *
 * This is the same path `tests/e2e/campaign.spec.ts` drives: side, then state, then
 * role, then start. Measuring the start screen instead would be a vacuous pass, so the
 * HUD's presence is asserted rather than assumed.
 */
async function mountHud(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid='side-grid']", { timeout: 120_000 });
  await page.click("[data-testid='side-mountain-alliance']");
  await page.click("[data-testid='step-1']");
  await page.waitForSelector("[data-testid='state-grid']", { timeout: 30_000 });
  await page.click("[data-testid='state-CO']");
  await page.click("[data-testid='step-2']");
  await page.waitForSelector("[data-testid='role-grid']", { timeout: 30_000 });
  await page.click("[data-testid='role-ruler-in-waiting']");
  await page.click("[data-testid='step-3']");
  await page.waitForSelector("[data-testid='start-next']", { timeout: 30_000 });
  await page.click("[data-testid='start-next']");
  await page.waitForSelector("[data-testid='top-bar']", { timeout: 60_000 });
  // Let the first paint settle so nothing is measured mid-transition.
  await page.waitForTimeout(1200);

  const mounted = await page.evaluate(() => {
    const bar = document.querySelector("[data-testid='top-bar']");
    const dial = document.querySelector("[data-testid='time-dial']");
    const tray = document.querySelector("[data-testid='notifications']");
    const rail = document.querySelector("[data-testid='party-rail']");
    return {
      bar: Boolean(bar),
      dial: Boolean(dial),
      tray: Boolean(tray),
      rail: Boolean(rail),
      radios: document.querySelectorAll("[role='radio']").length,
      resCells: document.querySelectorAll(".res").length,
    };
  });
  if (!mounted.bar || !mounted.dial || !mounted.tray || !mounted.rail) {
    throw new Error(
      `the HUD did not mount, so this would be a meaningless measurement: ${JSON.stringify(mounted)}`,
    );
  }
  if (mounted.radios !== 3) {
    throw new Error(`the time dial has ${mounted.radios} detents, expected 3`);
  }
  if (mounted.resCells !== 5) {
    throw new Error(`the top bar has ${mounted.resCells} resources, expected 5`);
  }
  return mounted;
}

async function main() {
  const browser = await chromium.launch({
    // This machine has no Playwright-managed browser, and the image's /tmp is too
    // small to install one into, so the binary can be pointed at directly.
    executablePath: process.env.CHROME_PATH || undefined,
  });
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        hasTouch: vp.coarse,
        isMobile: false,
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      const mounted = await mountHud(page);

      const result = await page.evaluate(PROBE);
      const heading = `--- ${vp.name} (${result.controlCount} interactive controls) ---`;
      console.log(heading);
      if (result.controlCount < 8) {
        // A HUD with fewer than this many controls did not really mount, and a pass
        // over a near-empty page means nothing.
        failures.push(`${vp.name}: only ${result.controlCount} controls found, HUD may not have mounted`);
        console.log(`    [too-few-controls] ${result.controlCount} interactive controls`);
      }
      if (result.problems.length === 0) {
        console.log("    no problems found");
      }
      for (const p of result.problems) {
        console.log(`    [${p.kind}] ${p.detail}`);
        failures.push(`${vp.name}: [${p.kind}] ${p.detail}`);
      }
      notes.push(`${vp.name}: page overflow ${result.overflow}px, dial detents ${mounted.radios}, resources ${mounted.resCells}`);

      // Optional: keep a picture of each width, for a human to look at. A measurement
      // proves the numbers; a screenshot shows the thing still reads as a document.
      if (process.env.SHOT_DIR) {
        const rect = await page.evaluate(() => {
          const r = document.querySelector("[data-testid='top-bar']").getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        });
        const name = `${vp.width}x${vp.height}`;
        await page.screenshot({ path: `${process.env.SHOT_DIR}/topbar-${name}.png`, clip: rect });
        console.log(`    wrote topbar-${name}.png (${Math.round(rect.width)}x${Math.round(rect.height)})`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log("");
  for (const n of notes) console.log(n);
  if (failures.length > 0) {
    console.log(`\nFAILED: ${failures.length} small-screen problem(s).`);
    process.exitCode = 1;
    return;
  }
  console.log("\nSmall-screen layout holds at every checked width.");
}

main().catch((err) => {
  console.error(`CHECK FAILED TO RUN: ${err.message}`);
  process.exitCode = 1;
});
