import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const slug = process.argv[2];
const outDir = process.argv[3] || "/tmp/itch";
if (!slug) { console.error("usage: node tools/itch-download.mjs <slug> <outDir>"); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();

await page.goto(`https://quaternius.itch.io/${slug}`, { waitUntil: "domcontentloaded", timeout: 60000 });

// Two shapes of itch page:
//   1. pack already has a free download -> "Download" button lands straight on the signed page
//   2. "Name your own price" -> buy_btn hrefs to /purchase, which then offers a zero-price path
const buyHref = await page.evaluate(
  () => document.querySelector("a.buy_btn")?.getAttribute("href") || null
);
if (buyHref) {
  await page.goto(new URL(buyHref, page.url()).toString(), { waitUntil: "domcontentloaded", timeout: 60000 });
  console.log("purchase page:", page.url());
}

// The zero-price path is worded differently per pack; take whichever is offered.
const skip = page
  .locator("a, button")
  .filter({
    hasText: /no thanks|just take me to the downloads|without paying|download for free|skip/i,
  })
  .first();
if (await skip.count()) {
  await skip.click({ timeout: 20000 }).catch(() => {});
  await page.waitForLoadState("domcontentloaded");
}
console.log("download page:", page.url());

// The file rows on the signed page fire real downloads.
const rows = page.locator("a.download_btn[data-upload_id], .upload_list_widget li");
const n = await rows.count();
console.log("file rows found:", n);

const saved = [];
for (let i = 0; i < n; i++) {
  const row = rows.nth(i);
  const label = (await page.locator(`strong.name[title]`).nth(i).getAttribute("title").catch(() => "")).slice(0, 80);
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 90000 }).catch(() => null),
    row.click({ timeout: 20000 }).catch((e) => console.log("  click failed:", e.message.split("\n")[0])),
  ]);
  if (!dl) { console.log(`  [${i}] ${label} -> NO DOWNLOAD EVENT`); continue; }
  const name = dl.suggestedFilename();
  const dest = path.join(outDir, name);
  await dl.saveAs(dest);
  const sz = fs.statSync(dest).size;
  saved.push(name);
  console.log(`  [${i}] ${name}  ${(sz / 1048576).toFixed(1)} MB   (label: ${label})`);
}
if (saved.length === 0) {
  fs.writeFileSync(path.join(outDir, `${slug}-page.html`), await page.content());
  console.log("no files downloaded; page saved for inspection");
}
await browser.close();
