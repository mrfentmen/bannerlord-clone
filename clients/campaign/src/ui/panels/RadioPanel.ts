/**
 * Radio tuner panel: pick an era-styled station bed, read live bulletins.
 *
 * The music beds are original synthesized tracks (audio/radio/). The news is
 * generated from the current snapshot by src/audio/radio.ts, so it always
 * describes the world as it is right now.
 */
import { h, sectionHeader } from "../dom.js";
import { panel } from "../kit.js";
import { gameAudio } from "../../audio/audio.js";
import {
  generateBulletins,
  radioBedUrl,
  RADIO_BEDS,
  stationIntro,
  stationOutro,
  type RadioBedId,
} from "../../audio/radio.js";
import type { TownState } from "../../data/types.js";

export interface RadioPanelOptions {
  towns: TownState[];
  testId?: string;
  onClose?: () => void;
}

export function radioPanel(options: RadioPanelOptions): HTMLElement {
  const { root, body } = panel({
    title: "Radio — KHRD Heartland",
    testId: options.testId ?? "radio-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });

  const audio = gameAudio();
  let currentBed: RadioBedId = "heartland-rock";
  let bedEl: HTMLAudioElement | null = null;

  function stopBed(): void {
    if (bedEl) {
      bedEl.pause();
      bedEl.remove();
      bedEl = null;
    }
  }

  function playBed(bed: RadioBedId): void {
    currentBed = bed;
    stopBed();
    audio.unlock();
    bedEl = new Audio(radioBedUrl(bed));
    bedEl.loop = true;
    bedEl.volume = audio.isMuted ? 0 : 0.7;
    void bedEl.play().catch(() => {
      /* autoplay blocked; starts on next gesture */
    });
    render();
  }

  // -- station picker ------------------------------------------------------
  body.appendChild(sectionHeader("Stations"));
  const stationRow = h("div", { class: "radio__stations", "data-testid": "radio-stations" });
  for (const bed of RADIO_BEDS) {
    const btn = h(
      "button",
      {
        type: "button",
        class: "btn radio__station" + (bed.id === currentBed ? " radio__station--active" : ""),
        "data-testid": `radio-station-${bed.id}`,
        "aria-pressed": String(bed.id === currentBed),
      },
      bed.label,
    );
    btn.addEventListener("click", () => playBed(bed.id));
    stationRow.appendChild(btn);
  }
  body.appendChild(stationRow);

  const stopBtn = h(
    "button",
    { type: "button", class: "btn radio__stop", "data-testid": "radio-stop" },
    "Stop radio",
  );
  stopBtn.addEventListener("click", () => {
    stopBed();
    render();
  });
  body.appendChild(stopBtn);

  // -- bulletins ------------------------------------------------------------
  body.appendChild(sectionHeader("News bulletins"));
  const intro = h("p", { class: "radio__intro", "data-testid": "radio-intro" }, stationIntro());
  body.appendChild(intro);

  const bulletins = generateBulletins(options.towns, 5);
  const list = h("ol", { class: "radio__bulletins", "data-testid": "radio-bulletins" });
  for (const b of bulletins) {
    list.appendChild(
      h("li", { class: "radio__bulletin" }, [
        h("div", { class: "radio__headline" }, b.headline),
        h("div", { class: "radio__text" }, b.text),
      ]),
    );
  }
  body.appendChild(list);
  body.appendChild(h("p", { class: "radio__outro" }, stationOutro()));

  function render(): void {
    for (const btn of stationRow.querySelectorAll("button")) {
      const id = btn.getAttribute("data-testid")?.replace("radio-station-", "");
      const active = id === currentBed && bedEl !== null;
      btn.classList.toggle("radio__station--active", active);
      btn.setAttribute("aria-pressed", String(active));
    }
  }

  // Stop the bed when the panel closes.
  const observer = new MutationObserver(() => {
    if (!root.isConnected) {
      stopBed();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return root;
}
