/**
 * Daily seed display (Rowan solo task 40).
 *
 * Shows today's daily-challenge seed with a copy button. The seed is the
 * same one dailyChallenge() uses, so players can share it or enter it as a
 * skirmish seed to replay the exact setup.
 */

import { h } from "../ui/dom.js";
import { dailySeed } from "./rng.js";

/** Today's seed as a short base-36 string (matches skirmish labels). */
export function dailySeedString(date: Date = new Date()): string {
  return dailySeed(date).toString(36);
}

export function dailySeedPanel(date: Date = new Date()): HTMLElement {
  const seed = dailySeed(date);
  const code = dailySeedString(date);
  const root = h(
    "div",
    { class: "daily-seed", "data-testid": "daily-seed-panel" },
    h("span", { class: "caption" }, "Today's seed: "),
    h("code", { "data-testid": "daily-seed-value" }, `${seed} (${code})`),
    h("span", { class: "caption" }, " — enter it as a skirmish seed to replay this setup."),
  );
  const copyBtn = h(
    "button",
    { type: "button", class: "btn btn--quiet", "data-testid": "daily-seed-copy" },
    "Copy",
  );
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(String(seed));
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
    } catch {
      copyBtn.textContent = "Copy failed";
    }
  });
  root.appendChild(copyBtn);
  return root;
}
