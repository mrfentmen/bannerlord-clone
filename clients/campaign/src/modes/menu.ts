/**
 * The battle-modes menu: one mountable component listing every mode with its
 * setup flow. Finished configs go to the provided {@link BattleLauncher};
 * `onExit` returns to whatever mounted this menu (the app shell owns that).
 *
 * Wiring note: main.ts does not mount this yet — the start screen flows
 * straight into the campaign. Mounting the menu (e.g. from the start screen)
 * is a small app-shell follow-up.
 */

import { h } from "../ui/dom.js";
import {
  BIOME_LABEL,
  MODE_LABEL,
  forceSize,
  type BattleConfig,
  type BattleLauncher,
  type BattleMode,
  type BiomeId,
} from "./types.js";
import { PRESET_FORCES } from "./forces.js";
import { generateSkirmish } from "./skirmish.js";
import { quickBattle } from "./quickBattle.js";
import { customBattle } from "./customBattle.js";
import { CHALLENGE_MODIFIERS, applyModifiers } from "./challenge.js";
import { HISTORICAL_SCENARIOS } from "./historical.js";
import { dailyChallenge, dailyLeaderboard, recordDailyScore } from "./daily.js";
import { createArena } from "./arena.js";
import { createTournament, defaultFighters } from "./tournament.js";
import { createBookmaker, decimalOdds } from "./betting.js";
import { TOURNAMENT_PRIZES } from "./prizes.js";
import { submitScore, topScores, tournamentScore } from "../meta/leaderboards.js";

export interface ModesMenuOptions {
  launcher: BattleLauncher;
  onExit: () => void;
}

const MODES: BattleMode[] = ["quick", "skirmish", "arena", "tournament", "historical", "challenge", "daily", "custom"];

export function createModesMenu(opts: ModesMenuOptions): HTMLElement {
  const root = h("div", { class: "modes-menu", "data-testid": "modes-menu" });
  const body = h("div", { class: "modes-body" });
  const back = h("button", { type: "button", class: "modes-back" });
  back.textContent = "← Back";
  back.addEventListener("click", () => showMenu());

  function showMenu(): void {
    body.replaceChildren();
    const list = h("div", { class: "modes-list" });
    for (const mode of MODES) {
      const btn = h("button", { type: "button", class: "modes-card", "data-mode": mode });
      btn.textContent = MODE_LABEL[mode];
      btn.addEventListener("click", () => showMode(mode));
      list.appendChild(btn);
    }
    body.appendChild(list);
  }

  function header(title: string): HTMLElement {
    const el = h("h2", { class: "modes-title" });
    el.textContent = title;
    return el;
  }

  function forceSelect(id: string, initial: string): HTMLSelectElement {
    const sel = h("select", { id }) as HTMLSelectElement;
    for (const f of PRESET_FORCES) {
      const opt = h("option", { value: f.id }) as HTMLOptionElement;
      opt.textContent = `${f.name} (${forceSize(f)})`;
      if (f.id === initial) opt.selected = true;
      sel.appendChild(opt);
    }
    return sel;
  }

  function launchBtn(config: () => BattleConfig, label = "Fight"): HTMLButtonElement {
    const btn = h("button", { type: "button", class: "modes-fight" }) as HTMLButtonElement;
    btn.textContent = label;
    btn.addEventListener("click", () => opts.launcher.launch(config()));
    return btn;
  }

  function showMode(mode: BattleMode): void {
    body.replaceChildren();
    body.appendChild(header(MODE_LABEL[mode]));
    if (mode === "quick") showQuick();
    else if (mode === "skirmish") showSkirmish();
    else if (mode === "arena") showArena();
    else if (mode === "tournament") showTournament();
    else if (mode === "historical") showHistorical();
    else if (mode === "challenge") showChallenge();
    else if (mode === "daily") showDaily();
    else showCustom();
  }

  function showQuick(): void {
    const player = forceSelect("qb-player", "militia");
    const enemy = forceSelect("qb-enemy", "raiders");
    const biome = h("select", { id: "qb-biome" }) as HTMLSelectElement;
    (Object.keys(BIOME_LABEL) as BiomeId[]).forEach((b) => {
      const opt = h("option", { value: b }) as HTMLOptionElement;
      opt.textContent = BIOME_LABEL[b];
      biome.appendChild(opt);
    });
    body.append("Your force: ", player, "Enemy: ", enemy, "Field: ", biome);
    body.appendChild(
      launchBtn(() => quickBattle({ playerForceId: player.value, enemyForceId: enemy.value, biome: biome.value as BiomeId })),
    );
  }

  function showSkirmish(): void {
    const summary = h("p", { class: "modes-summary" });
    let config = generateSkirmish();
    const render = (): void => {
      summary.textContent = `${config.label}: ${config.player.name} vs ${config.enemy.name} on ${BIOME_LABEL[config.biome]}.`;
    };
    render();
    const regen = h("button", { type: "button" }) as HTMLButtonElement;
    regen.textContent = "Generate another";
    regen.addEventListener("click", () => {
      config = generateSkirmish();
      render();
    });
    body.append(summary, regen, launchBtn(() => config));
  }

  function showArena(): void {
    const arena = createArena();
    const rec = arena.record();
    const info = h("p", { class: "modes-summary" });
    info.textContent = `Record ${rec.wins}W–${rec.losses}L, best streak ${rec.bestStreak}. Crowd: ${Math.round(arena.crowdLevel() * 100)}%.`;
    const meter = h("div", { class: "modes-crowd" });
    meter.style.setProperty("--crowd", String(arena.crowdLevel()));
    body.append(info, meter);
    body.appendChild(
      launchBtn(() => ({
        ...generateSkirmish(),
        mode: "arena" as const,
        label: `Arena bout #${rec.bouts + 1}`,
      })),
    );
  }

  function showTournament(): void {
    const t = createTournament(defaultFighters());
    const book = createBookmaker();
    const info = h("p", { class: "modes-summary" });
    /** Record the champion on the local leaderboard (MASTER_PLAN task 141),
     * idempotently — re-renders must not double-submit. */
    const maybeSubmitChampion = (): void => {
      if (!t.isComplete()) return;
      const champ = t.champion();
      if (!champ) return;
      const score = tournamentScore(4, champ.rating);
      const detail = `Tournament champion · rating ${champ.rating}`;
      const already = topScores("tournament").some(
        (e) => e.name === champ.name && e.score === score && e.detail === detail,
      );
      if (!already) submitScore("tournament", { name: champ.name, score, detail });
    };
    const renderBracket = (): void => {
      maybeSubmitChampion();
      info.textContent = t.isComplete()
        ? `Champion: ${t.champion()!.name}. Purse: ${book.purse()} coin.`
        : `Purse: ${book.purse()} coin. Tap a bout winner to advance the bracket.`;
    };
    renderBracket();
    body.appendChild(info);
    for (const round of t.rounds()) {
      const roundEl = h("div", { class: "modes-round" });
      const title = h("h3", {});
      title.textContent = `Round ${round[0]!.round + 1}`;
      roundEl.appendChild(title);
      for (const m of round) {
        const bout = h("div", { class: "modes-bout" });
        for (const side of [m.a, m.b] as const) {
          const btn = h("button", { type: "button", disabled: m.winnerId !== null || !side }) as HTMLButtonElement;
          btn.textContent = side ? side.name : "TBD";
          if (side && !m.winnerId && m.a && m.b) {
            const other = side === m.a ? m.b : m.a;
            btn.textContent = `${side.name} (${decimalOdds(side, other!)}×)`;
            btn.addEventListener("click", () => {
              if (book.purse() >= 10) {
                book.placeBet(side.id, 10, decimalOdds(side, other!));
              }
              const bets = [{ fighterId: side.id, stake: 10, odds: decimalOdds(side, other!) }];
              t.reportWinner(m.id, side.id);
              book.settle(bets, side.id);
              showTournament();
            });
          } else if (side && !m.winnerId) {
            btn.addEventListener("click", () => {
              t.reportWinner(m.id, side.id);
              showTournament();
            });
          }
          if (m.winnerId === side?.id) btn.classList.add("is-winner");
          bout.appendChild(btn);
        }
        roundEl.appendChild(bout);
      }
      body.appendChild(roundEl);
    }
    const prizes = h("div", { class: "modes-prizes" });
    const ptitle = h("h3", {});
    ptitle.textContent = "Prizes";
    prizes.appendChild(ptitle);
    for (const p of TOURNAMENT_PRIZES) {
      const card = h("div", { class: "modes-prize" });
      const name = h("strong", {});
      name.textContent = p.name;
      const stats = h("span", {});
      stats.textContent = Object.entries(p.stats).map(([k, v]) => `${k} ${v}`).join(" · ");
      const blurb = h("p", {});
      blurb.textContent = p.blurb;
      card.append(name, stats, blurb);
      prizes.appendChild(card);
    }
    body.appendChild(prizes);
  }

  function showHistorical(): void {
    for (const s of HISTORICAL_SCENARIOS) {
      const card = h("div", { class: "modes-scenario" });
      const title = h("h3", {});
      title.textContent = s.title;
      card.appendChild(title);
      for (const para of s.briefing) {
        const p = h("p", {});
        p.textContent = para;
        card.appendChild(p);
      }
      card.appendChild(launchBtn(() => ({ ...s.config }), "Deploy"));
      body.appendChild(card);
    }
  }

  function showChallenge(): void {
    const checks = new Map<string, HTMLInputElement>();
    for (const m of CHALLENGE_MODIFIERS) {
      const label = h("label", { class: "modes-check" }) as HTMLLabelElement;
      const box = h("input", { type: "checkbox", value: m.id }) as HTMLInputElement;
      checks.set(m.id, box);
      const text = h("span", {});
      text.textContent = `${m.name} — ${m.blurb}`;
      label.append(box, text);
      body.appendChild(label);
    }
    body.appendChild(
      launchBtn(() => {
        const ids = [...checks.entries()].filter(([, box]) => box.checked).map(([id]) => id);
        const config = generateSkirmish();
        config.mode = "challenge";
        config.label = `Challenge (${ids.join(", ") || "none"})`;
        return applyModifiers(config, ids);
      }),
    );
  }

  function showDaily(): void {
    const config = dailyChallenge();
    const info = h("p", { class: "modes-summary" });
    info.textContent = `${config.label}: ${config.player.name} vs ${config.enemy.name} on ${BIOME_LABEL[config.biome]}. Seed ${config.seed}.`;
    body.appendChild(info);
    const board = h("ol", { class: "modes-board" });
    for (const s of dailyLeaderboard().slice(0, 10)) {
      const li = h("li", {});
      li.textContent = `${s.name}: ${s.score}${s.won ? " (win)" : ""}`;
      board.appendChild(li);
    }
    body.appendChild(board);
    const nameInput = h("input", { type: "text", placeholder: "Your name", value: "Commander" }) as HTMLInputElement;
    const saveBtn = h("button", { type: "button" }) as HTMLButtonElement;
    saveBtn.textContent = "Record practice score";
    saveBtn.addEventListener("click", () => {
      recordDailyScore({ date: config.seed, name: nameInput.value || "Commander", score: 1000, won: true });
      showDaily();
    });
    body.append(nameInput, saveBtn, launchBtn(() => config, "Play daily"));
  }

  function showCustom(): void {
    const player = forceSelect("cb-player", "militia");
    const enemy = forceSelect("cb-enemy", "legion");
    const biome = h("select", { id: "cb-biome" }) as HTMLSelectElement;
    (Object.keys(BIOME_LABEL) as BiomeId[]).forEach((b) => {
      const opt = h("option", { value: b }) as HTMLOptionElement;
      opt.textContent = BIOME_LABEL[b];
      biome.appendChild(opt);
    });
    const checks = new Map<string, HTMLInputElement>();
    for (const m of CHALLENGE_MODIFIERS) {
      const label = h("label", { class: "modes-check" }) as HTMLLabelElement;
      const box = h("input", { type: "checkbox", value: m.id }) as HTMLInputElement;
      checks.set(m.id, box);
      const text = h("span", {});
      text.textContent = m.name;
      label.append(box, text);
      body.appendChild(label);
    }
    body.append("Your force: ", player, "Enemy: ", enemy, "Field: ", biome);
    body.appendChild(
      launchBtn(() =>
        customBattle({
          playerForceId: player.value,
          enemyForceId: enemy.value,
          biome: biome.value as BiomeId,
          modifierIds: [...checks.entries()].filter(([, box]) => box.checked).map(([id]) => id),
        }),
      "Launch"),
    );
  }

  root.append(back, body);
  showMenu();
  return root;
}
