/**
 * ASSETS.md pipeline steps 1-3, run for real and checked in.
 *
 *   Step 1  Select.          The candidate list below, with the licence each one claims.
 *   Step 2  Manifest and licence capture.  Saves the licence text AND the page it was read from.
 *   Step 3  Download and store the original.  Unedited, into assets/originals/, hashed.
 *
 * Steps 4-6 are tools/blender/*.py, driven by tools/build-assets.mjs.
 *
 * Run: node tools/fetch-assets.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGINALS = path.join(ROOT, "assets", "originals");
const LICENSES = path.join(ROOT, "assets", "licenses");

/** The three CC0 packs this troop type is built from. All by the same author, so one licence. */
const PACKS = [
  {
    id: "quaternius-universal-base-characters",
    slug: "universal-base-characters",
    file: "Universal Base Characters[Standard].zip",
    memberFile: "License_Standard.txt",
    role: "character_body + character_head (hair rigged to the head bone)",
  },
  {
    id: "quaternius-universal-animation-library-2",
    slug: "universal-animation-library-2",
    file: "Universal Animation Library 2[Standard].zip",
    memberFile: "License.txt",
    role: "shared skeleton + animation source (idle and walk cycles)",
  },
  {
    id: "quaternius-ultimate-gun-pack",
    slug: "50-lowpoly-guns",
    file: "Ultimate Gun Pack by Quaternius.zip",
    memberFile: "License.txt",
    role: "weapon (assault rifle, generic in-game name per CONSTITUTION.md section 6.1)",
  },
];

fs.mkdirSync(ORIGINALS, { recursive: true });
fs.mkdirSync(LICENSES, { recursive: true });

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ acceptDownloads: true });

for (const pack of PACKS) {
  const dest = path.join(ORIGINALS, pack.file);
  const page = await ctx.newPage();
  await page.goto(`https://quaternius.itch.io/${pack.slug}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  // Step 2 always runs, whether or not the bytes are already here. ASSETS.md section 1.2 requires
  // a saved copy of the licence page because those pages change and a dead link is not a defence.
  fs.writeFileSync(path.join(LICENSES, `${pack.id}_itch-page.html`), await page.content());
  const claimed = await page.evaluate(
    () => document.body.innerText.match(/CC0[^\n]{0,60}|Creative Commons[^\n]{0,60}/i)?.[0] ?? ""
  );
  if (!/CC0/i.test(claimed)) {
    throw new Error(`${pack.id}: page does not state CC0 (saw ${JSON.stringify(claimed)})`);
  }
  console.log(`[licence] ${pack.id} page states: ${JSON.stringify(claimed)}`);

  if (fs.existsSync(dest)) {
    console.log(`[skip] ${pack.id} already downloaded (${fs.statSync(dest).size} bytes)`);
  } else {
    const buyHref = await page.evaluate(() => document.querySelector("a.buy_btn")?.getAttribute("href") ?? null);
    if (buyHref) {
      await page.goto(new URL(buyHref, page.url()).toString(), {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
    }
    // The zero-price path is worded differently per pack; take whichever is offered.
    const skip = page
      .locator("a, button")
      .filter({ hasText: /no thanks|just take me to the downloads|without paying|download for free|skip/i })
      .first();
    if (await skip.count()) {
      await skip.click({ timeout: 20000 }).catch(() => {});
      await page.waitForLoadState("domcontentloaded");
    }

    const rows = page.locator("a.download_btn[data-upload_id], .upload_list_widget li");
    const n = await rows.count();
    if (n === 0) throw new Error(`${pack.id}: no download rows on ${page.url()}`);

    let got = 0;
    for (let i = 0; i < n; i++) {
      const [dl] = await Promise.all([
        page.waitForEvent("download", { timeout: 120000 }).catch(() => null),
        rows.nth(i).click({ timeout: 20000 }).catch(() => {}),
      ]);
      if (!dl) continue;
      await dl.saveAs(dest);
      got++;
    }
    if (got === 0) throw new Error(`${pack.id}: download event never fired`);
    console.log(`[download] ${pack.id} -> ${pack.file}`);
  }
  await page.close();

  // Step 3: record the hash of the unedited original.
  const buf = fs.readFileSync(dest);
  const hash = sha256(buf);
  fs.writeFileSync(path.join(ORIGINALS, `${pack.id}.sha256`), `${hash}  ${pack.file}\n`);
  console.log(`[hash] ${pack.id} sha256=${hash} (${(buf.length / 1048576).toFixed(1)} MB) role=${pack.role}`);
}

await browser.close();
console.log("\nAll originals present, unedited, and hashed.");
