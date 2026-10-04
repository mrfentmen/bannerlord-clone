/**
 * Diplomacy panel (integration for diplomacy tasks 81-90).
 *
 * The working surface for foreign affairs: the diplomatic reputation
 * meter, the reason-required relation-change feed, treaty compliance,
 * and the border-incident inbox with responses. The host supplies the
 * current season (relation changes are season-stamped).
 */

import { button, h, numberField, row, sectionHeader } from "../dom.js";
import { dataTable, emptyState, panel, type Column } from "../kit.js";
import { soundContractSigned, soundContractEnded } from "../../audio/gameSounds.js";
import { INFLUENCE_COSTS, type InfluenceSpendAction } from "../../court/influence.js";
import {
  adjustRelation,
  relationNotifications,
  relationWith,
  type RelationNotification,
} from "../../diplomacy/relationNotifications.js";
import {
  diplomaticReputation,
  reputationMeterLine,
  reputationTitle,
  REPUTATION_ACTIONS,
  REPUTATION_DRIFT,
  REPUTATION_EFFECTS,
  type ReputationAction,
} from "../../diplomacy/reputation.js";
import {
  treatyCompliance,
  type TreatyStatus,
} from "../../diplomacy/treaties.js";
import {
  answerBorderIncident,
  INCIDENT_RESPONSES,
  pendingBorderIncidents,
  type BorderIncident,
  type IncidentResponse,
} from "../../diplomacy/borderIncidents.js";
import {
  activeWars,
  declareWarGoal,
  endWar,
  tickWarWeariness,
  WAR_GOALS,
  WAR_GOAL_DESCRIPTIONS,
  type WarGoal,
} from "../../diplomacy/warGoals.js";
import { EMPTY_PEACE_TERMS, negotiatePeace } from "../../diplomacy/peaceConcessions.js";
import { suggestTribute } from "../../diplomacy/tributeCalculator.js";
import { rankGreatPowers, type ClanPower, type PowerRank } from "../../diplomacy/greatPowers.js";
import type { TreatyTerm } from "../../diplomacy/treaties.js";
import { relationBand } from "../../diplomacy/notables.js";
import { allianceAcceptOdds, negotiateRound } from "../../diplomacy/negotiation.js";
import type { AllianceOffer } from "../../diplomacy/types.js";
import { sendGift, type GiftResult } from "../../diplomacy/statecraft.js";
import { markHintShown, shouldShowHint } from "../../onboarding/hintCooldown.js";
import "./diplomacyPanel.css";

/**
 * Each reputation action, in a sentence rather than a slug. The ids in
 * `REPUTATION_EFFECTS` are for the code; a player reading "broke-treaty" learns
 * nothing about what they just did.
 */
const REPUTATION_ACTION_LABEL: Record<ReputationAction, string> = {
  "kept-treaty": "Kept a treaty",
  "honored-deal": "Honoured a deal",
  "paid-tribute": "Paid tribute on time",
  "freed-prisoners": "Freed prisoners",
  "broke-treaty": "Broke a treaty",
  "betrayed-ally": "Betrayed an ally",
  "sacked-town": "Sacked a town",
  "executed-envoy": "Executed an envoy",
};

export interface DiplomacyPanelOptions {
  /** Campaign season; relation changes are stamped with it. */
  currentSeason: number;
  /**
   * The powers the player wants compared, as the caller holds them. Task 221.
   *
   * There is no faction roster in the diplomacy layer's own state, so the power
   * board is drawn only when the caller supplies one — a table of invented
   * strengths would be a map made of guesses. Omitted, the section is absent.
   */
  powers?: ClanPower[];
  /**
   * The factions to list, as the caller holds them. Tasks 202 and 203.
   *
   * The diplomacy layer tracks relations keyed by faction id but keeps no roster of
   * factions itself, so the list is drawn only when the caller supplies one. Omitted,
   * the section is absent — a list of invented neighbours would be a map made of
   * guesses.
   */
  factions?: DiplomacyFaction[];
  onClose?: () => void;
  testId?: string;
  /**
   * Mercenary contract: sign on with a faction, or break the active deal.
   * Only drawn when the caller can send these orders.
   */
  mercenaryContract?: { factionId: string; factionName: string; daysLeft: number; payPerVictory: number; dailyPay: number } | null;
  onSignMercenary?: (factionId: string, factionName: string) => Promise<void>;
  onBreakMercenary?: () => Promise<void>;
  /** Factions available for mercenary work. */
  mercenaryFactions?: { id: string; name: string }[];
  /**
   * The simulation's own wars (attacker/defender factions, scores, exhaustion),
   * as the caller holds them from the snapshot. Omitted, the section is absent.
   */
  simWars?: { id: string; attackerFactionId: string; defenderFactionId: string; startDay: number; exhaustion: number; attackerScore: number; defenderScore: number }[];
  /** Declare war on a faction through the simulation. */
  onDeclareWar?: (targetFactionId: string) => Promise<{ warId: string }>;
  /** Make peace through the simulation, ending a war. */
  onMakePeace?: (warId: string) => Promise<void>;
  /** Defect: leave your clan for another faction. */
  onDefectClan?: (joinFactionId?: string) => Promise<{ line: string }>;
  /** The player's current faction id, so the wars list can name who is who. */
  playerFactionId?: string;
  /**
   * The player's influence balance and the realm actions it can buy. Both must
   * be supplied: a spend button without a balance cannot say whether the
   * player can afford it, and a balance without a caller cannot send orders.
   * Omitted, the section is absent.
   */
  influenceBalance?: number;
  onSpendInfluence?: (action: "muster-army" | "call-vote" | "bribe-lord" | "recruit-vassal" | "force-policy") => Promise<{ line: string }>;
  /** Called after a sim order changed the world, so the caller repaints. */
  onWorldChanged?: () => void;
}

export function diplomacyPanel(options: DiplomacyPanelOptions): HTMLElement {
  return buildDiplomacyPanel(options, null);
}

function buildDiplomacyPanel(options: DiplomacyPanelOptions, notice: string | null): HTMLElement {
  const { root, body } = panel({
    title: "Diplomacy",
    testId: options.testId ?? "diplomacy-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });

  if (notice) {
    body.appendChild(
      h("p", { class: "caption", "data-testid": "diplomacy-notice" }, notice),
    );
  }

  // Contextual hint, at most once per 10 minutes (solo task 92).
  if (shouldShowHint("diplomacy.intro")) {
    markHintShown("diplomacy.intro");
    body.appendChild(
      h("p", { class: "caption", "data-testid": "hint-diplomacy-intro" },
        "Answer border incidents before they fester. Every relation change is logged with its reason."),
    );
  }

  const rerender = (nextNotice: string | null = null) => {
    root.replaceWith(buildDiplomacyPanel(options, nextNotice));
  };

  body.appendChild(sectionHeader("Standing"));
  const rep = diplomaticReputation();
  body.appendChild(row("Reputation", `${rep} — ${reputationTitle(rep)}`, { mono: true }));
  body.appendChild(
    h("p", { class: "caption", "data-testid": "diplomacy-reputation" }, reputationMeterLine()),
  );
  body.appendChild(reputationEffectsLegend());

  const powers = powerBoard(options.powers);
  if (powers) body.appendChild(powers);

  const factions = factionList(options.factions);
  if (factions) body.appendChild(factions);

  body.appendChild(sectionHeader("War goals"));
  const wars = activeWars();
  if (wars.length === 0) {
    body.appendChild(emptyState("No declared wars", "Declare a war goal against an enemy faction to fight with purpose."));
  } else {
    const columns: Column<(typeof wars)[number]>[] = [
      { header: "Enemy", render: (w) => w.enemyName },
      { header: "Goal", render: (w) => w.goal ? `${w.goal} — ${WAR_GOAL_DESCRIPTIONS[w.goal]}` : "None declared" },
      { header: "Weariness", numeric: true, render: (w) => `${Math.round(w.weariness)}` },
      {
        header: "Orders",
        render: (w) =>
          button("End war", () => { endWar(w.id); rerender(); }, { variant: "quiet", testId: `war-end-${w.id}` }),
      },
    ];
    body.appendChild(dataTable("War goals", columns, wars, "diplomacy-wars"));
  }
  const enemyInput = h("input", {
    type: "text",
    placeholder: "Enemy faction",
    "aria-label": "Enemy faction",
    "data-testid": "war-enemy-input",
  }) as HTMLInputElement;
  const goalSelect = h(
    "select",
    { "aria-label": "War goal", "data-testid": "war-goal-select" },
    ...WAR_GOALS.map((g) => h("option", { value: g }, g)),
  ) as HTMLSelectElement;
  body.appendChild(
    h("div", { class: "form-row" }, enemyInput, goalSelect,
      button("Declare goal", () => {
        const enemy = enemyInput.value.trim();
        if (!enemy) return;
        declareWarGoal(enemy.toLowerCase().replace(/\s+/g, "-"), enemy, goalSelect.value as WarGoal, options.currentSeason);
        rerender();
      }, { testId: "war-declare" }),
      button("Season passes", () => { tickWarWeariness(); rerender(); }, { variant: "quiet", testId: "war-tick" }),
    ),
  );

  // -- peace negotiation (solo task 84): terms against a live war ---------
  if (wars.length > 0) {
    body.appendChild(sectionHeader("Negotiate peace"));
    const peaceWar = h(
      "select",
      { "aria-label": "War to negotiate", "data-testid": "peace-war-select" },
      ...wars.map((w) => h("option", { value: w.id }, w.enemyName)),
    ) as HTMLSelectElement;
    const { field: scoreField, input: scoreInput } = numberField("peace-score", "War score (-100 to 100)", 0, { min: -100, max: 100 });
    const { field: coinField, input: coinInput } = numberField("peace-coin", "Coin offered", 0, { min: 0 });
    const peaceLine = h("p", { class: "caption", "data-testid": "peace-result", role: "status" },
      "Set terms; the odds read comes from their weariness and your war score.");
    body.appendChild(
      h("div", { class: "form-row" }, peaceWar, scoreField, coinField,
        button("Read the odds", () => {
          const war = wars.find((w) => w.id === peaceWar.value);
          if (!war) return;
          const score = Number(scoreInput.value);
          const coin = Number(coinInput.value);
          if (!Number.isFinite(score) || !Number.isFinite(coin) || coin < 0) return;
          const view = negotiatePeace(war.enemyName, score, war.weariness, { ...EMPTY_PEACE_TERMS, coinOffered: coin });
          peaceLine.textContent = view.line;
        }, { testId: "peace-read" }),
      ),
    );
    body.appendChild(peaceLine);
  }

  body.appendChild(sectionHeader("Border incidents"));
  const incidents = pendingBorderIncidents();
  if (incidents.length === 0) {
    body.appendChild(emptyState("Quiet borders", "No incidents await a response."));
  } else {
    for (const incident of incidents) {
      body.appendChild(incidentCard(incident, options.currentSeason, (line) => rerender(line)));
    }
  }

  body.appendChild(sectionHeader("Treaties"));
  const treaties = treatyCompliance();
  if (treaties.length === 0) {
    body.appendChild(emptyState("No treaties", "Signed treaties and their compliance appear here."));
  } else {
    const columns: Column<TreatyStatus>[] = [
      { header: "Treaty", render: (t) => t.treaty.name },
      { header: "With", render: (t) => t.treaty.factionName },
      {
        header: "Status",
        render: (t) => (t.underStrain ? `▲ Under strain (${t.brokenTerms} broken)` : "◆ Holding"),
      },
    ];
    body.appendChild(dataTable("Treaties", columns, treaties, "diplomacy-treaties"));
    // Task 228. The table gives a count of broken terms; this is the list of terms
    // themselves, because "2 broken" is a number a player cannot act on and "you
    // broke the border clause" is a decision they can. Every value is read off the
    // treaty record: who owes it, whether it is kept, and how many seasons it has
    // stood. Nothing is inferred from the treaty's name.
    for (const status of treaties) {
      body.appendChild(treatyTerms(status));
    }
  }

  // -- alliance (tasks 210 and 211) -------------------------------------------
  const alliance = allianceBlock(options);
  if (alliance) body.appendChild(alliance);

  // -- gifts (tasks 216 and 217) ----------------------------------------------
  const gifts = giftBlock(options, rerender);
  if (gifts) body.appendChild(gifts);

  // -- tribute (task 214) -----------------------------------------------------
  // `suggestTribute` reads the power differential and says who should pay and how
  // much; it was written for this and wired to nothing. The panel supplies the
  // three numbers it needs — the two power scores and the income the coin scales
  // against — and prints its line. The panel does not decide who pays and does not
  // do the arithmetic a second time.
  body.appendChild(sectionHeader("Tribute"));
  const { field: yourPowerField, input: yourPowerInput } = numberField("tribute-your-power", "Your power", 1000, { min: 0 });
  const { field: theirPowerField, input: theirPowerInput } = numberField("tribute-their-power", "Their power", 1000, { min: 0 });
  const { field: incomeField, input: incomeInput } = numberField("tribute-income", "Your income a season", 1000, { min: 1 });
  const tributeLine = h("p", {
    class: "caption",
    "data-testid": "tribute-suggestion",
    role: "status",
  }, "Read the odds: the calculator says who pays and how much.");
  const tributeAmount = numberField("tribute-amount", "Amount to send", 0, { min: 0 });
  const tributePay = h(
    "p",
    { class: "caption", "data-testid": "tribute-payable", role: "status" },
    "Nothing is payable until the calculator names an amount.",
  );
  body.appendChild(
    h("div", { class: "form-row" }, yourPowerField, theirPowerField, incomeField),
  );
  body.appendChild(
    button("Read the tribute", () => {
      const yourPower = Number(yourPowerInput.value);
      const theirPower = Number(theirPowerInput.value);
      const income = Number(incomeInput.value);
      if (!Number.isFinite(yourPower) || !Number.isFinite(theirPower) || yourPower < 0 || theirPower < 0) {
        tributeLine.textContent = "Power scores cannot be negative.";
        tributePay.textContent = "Nothing is payable until the calculator names an amount.";
        return;
      }
      if (!Number.isFinite(income) || income <= 0) {
        tributeLine.textContent = "Income has to be positive for the coin to scale against.";
        tributePay.textContent = "Nothing is payable until the calculator names an amount.";
        return;
      }
      try {
        const suggestion = suggestTribute(yourPower, theirPower, income);
        tributeLine.textContent = suggestion.line;
        // The slider (task 215) opens on the suggested figure and stays editable:
        // the calculator prices the demand, the player decides what to send.
        tributeAmount.input.value = String(suggestion.amount);
        tributePay.textContent =
          suggestion.amount === 0
            ? suggestion.payer === "you"
              ? "Nothing is owed to them."
              : "They owe nothing you can collect."
            : `You would send $${suggestion.amount.toLocaleString("en-US")} a season, and they would be expected to refuse.`;
      } catch (e) {
        tributeLine.textContent = e instanceof Error ? e.message : "The tribute could not be priced.";
        tributePay.textContent = "Nothing is payable until the calculator names an amount.";
      }
    }, { testId: "tribute-read" }),
  );
  body.appendChild(tributeLine);
  body.appendChild(h("div", { class: "form-row" }, tributeAmount.field));
  body.appendChild(tributePay);
  body.appendChild(
    h(
      "p",
      { class: "annotation", style: "font-size:var(--type-caption-size)" },
      "The panel prices the demand; the answer is theirs. Nothing here records a payment.",
    ),
  );

  body.appendChild(sectionHeader("Relation changes"));
  const feed = relationNotifications().slice(0, 20);
  if (feed.length === 0) {
    body.appendChild(emptyState("No changes recorded", "Every relation change is logged here with its reason."));
  } else {
    const columns: Column<RelationNotification>[] = [
      { header: "Faction", render: (n) => n.factionName },
      { header: "Change", numeric: true, render: (n) => `${n.delta >= 0 ? "▲+" : "▼"}${n.delta}` },
      { header: "Now", numeric: true, render: (n) => `${n.newValue}` },
      { header: "Reason", render: (n) => n.reason },
    ];
    body.appendChild(dataTable("Relation changes", columns, feed, "diplomacy-relations"));
  }

  // -- mercenary work ----------------------------------------------------------
  // Bannerlord's sellsword life: fight for a faction without swearing fealty.
  // -- the simulation's wars (bucket 6): what the world is actually fighting --
  if (options.simWars !== undefined) {
    body.appendChild(sectionHeader("Wars of the realm"));
    if (options.simWars.length === 0) {
      body.appendChild(
        emptyState("No wars", "The realm is at peace. Declaring war is below, if you mean to end that."),
      );
    } else {
      for (const w of options.simWars) {
        const mine = options.playerFactionId !== undefined && (w.attackerFactionId === options.playerFactionId || w.defenderFactionId === options.playerFactionId);
        const card = h("div", { class: "field-row", "data-testid": `simwar-${w.id}`, style: "margin-bottom:var(--space-3)" });
        card.append(
          h("div", {},
            h("strong", { class: "label" }, `${w.attackerFactionId} vs ${w.defenderFactionId}${mine ? " (yours)" : ""}`),
            h("p", { class: "caption", style: "margin:0" },
              `Day ${w.startDay} · score ${w.attackerScore}–${w.defenderScore} · exhaustion ${Math.round(w.exhaustion)}%`),
          ),
        );
        if (mine && options.onMakePeace) {
          const peaceBtn = h("button", { type: "button", class: "btn", "data-testid": `simwar-peace-${w.id}` }, "Sue for peace");
          peaceBtn.addEventListener("click", () => {
            peaceBtn.disabled = true;
            void options.onMakePeace!(w.id).then(
              () => {
                peaceBtn.disabled = false;
                rerender("The war is ended. The treaty is signed.");
                options.onWorldChanged?.();
              },
              (err: unknown) => {
                peaceBtn.disabled = false;
                rerender(err instanceof Error && err.message ? err.message : "The peace did not land.");
              },
            );
          });
          card.append(peaceBtn);
        }
        body.appendChild(card);
      }
    }
    if (options.onDeclareWar) {
      const enemyInput = h("input", { class: "field__input", "data-testid": "simwar-enemy-input", placeholder: "faction id to attack", "aria-label": "Faction id to declare war on" });
      const declareBtn = h("button", { type: "button", class: "btn", "data-testid": "simwar-declare" }, "Declare war");
      declareBtn.addEventListener("click", () => {
        const enemy = enemyInput.value.trim();
        if (!enemy) return;
        declareBtn.disabled = true;
        void options.onDeclareWar!(enemy).then(
          () => {
            declareBtn.disabled = false;
            enemyInput.value = "";
            rerender("War is declared. There is no undoing it.");
            options.onWorldChanged?.();
          },
          (err: unknown) => {
            declareBtn.disabled = false;
            rerender(err instanceof Error && err.message ? err.message : "The declaration did not land.");
          },
        );
      });
      body.appendChild(h("div", { class: "form-row" }, enemyInput, declareBtn));
    }
  }

  // -- defection (bucket 6) -------------------------------------------------
  if (options.onDefectClan) {
    body.appendChild(sectionHeader("Defection"));
    const defectInput = h("input", { class: "field__input", "data-testid": "defect-faction-input", placeholder: "faction to defect to (optional)", "aria-label": "Faction id to defect to" });
    const defectBtn = h("button", { type: "button", class: "btn", "data-testid": "defect-clan" }, "Leave your clan");
    defectBtn.addEventListener("click", () => {
      defectBtn.disabled = true;
      void options.onDefectClan!(defectInput.value.trim() || undefined).then(
        (r) => {
          defectBtn.disabled = false;
          rerender(r.line);
          options.onWorldChanged?.();
        },
        (err: unknown) => {
          defectBtn.disabled = false;
          rerender(err instanceof Error && err.message ? err.message : "The defection did not land.");
        },
      );
    });
    body.appendChild(h("div", { class: "form-row" }, defectInput, defectBtn));
  }

  // -- realm influence (bucket: influence spend loop) -------------------------
  if (options.onSpendInfluence && options.influenceBalance !== undefined) {
    body.appendChild(sectionHeader("Realm influence"));
    const balance = options.influenceBalance;
    body.appendChild(
      h("p", { class: "caption", "data-testid": "influence-balance", style: "margin:0 0 var(--space-2)" },
        `You hold ${Math.round(balance)} influence.`),
    );
    const ACTIONS: { id: InfluenceSpendAction; label: string }[] = [
      { id: "muster-army", label: "Muster an army" },
      { id: "call-vote", label: "Call a council vote" },
      { id: "bribe-lord", label: "Bribe a lord" },
      { id: "recruit-vassal", label: "Recruit a vassal" },
      { id: "force-policy", label: "Force a policy" },
    ];
    for (const a of ACTIONS) {
      const cost = INFLUENCE_COSTS[a.id];
      const btn = h(
        "button",
        { type: "button", class: "btn", "data-testid": `influence-${a.id}`, ...(balance < cost ? { disabled: "" } : {}) },
        `${a.label} (${cost} influence)`,
      );
      btn.addEventListener("click", () => {
        btn.disabled = true;
        void options.onSpendInfluence!(a.id).then(
          (r) => {
            btn.disabled = false;
            rerender(r.line);
            options.onWorldChanged?.();
          },
          (err: unknown) => {
            btn.disabled = false;
            rerender(err instanceof Error && err.message ? err.message : "The realm did not answer.");
          },
        );
      });
      body.appendChild(h("div", { class: "form-row" }, btn));
    }
  }

  if (options.onSignMercenary || options.mercenaryContract !== undefined) {
    body.appendChild(sectionHeader("Mercenary work"));
    const contract = options.mercenaryContract;
    if (contract) {
      body.appendChild(
        row(
          "Under contract",
          `${contract.factionName} — ${contract.daysLeft}d left, ${contract.dailyPay}g/day + ${contract.payPerVictory}g per victory`,
          { testId: "mercenary-active" },
        ),
      );
      if (options.onBreakMercenary) {
        body.appendChild(
          h(
            "div",
            { class: "row" },
            h("span", { class: "row__label label" }, "Contract"),
            h(
              "span",
              { class: "row__value" },
              h(
                "button",
                {
                  class: "btn",
                  "data-testid": "mercenary-break",
                  onclick: async () => {
                    try {
                      await options.onBreakMercenary?.();
                      soundContractEnded(true);
                      rerender("Contract broken. The faction will remember.");
                      options.onWorldChanged?.();
                    } catch (err) {
                      rerender(err instanceof Error && err.message ? err.message : "The contract held. It did not break.");
                    }
                  },
                },
                "Break contract",
              ),
            ),
          ),
        );
      }
    } else {
      for (const faction of options.mercenaryFactions ?? []) {
        body.appendChild(
          h(
            "div",
            { class: "row" },
            h("span", { class: "row__label label" }, faction.name),
            h(
              "span",
              { class: "row__value" },
              options.onSignMercenary
                ? h(
                    "button",
                    {
                      class: "btn",
                      "data-testid": `mercenary-sign-${faction.id}`,
                      onclick: async () => {
                        try {
                          await options.onSignMercenary?.(faction.id, faction.name);
                          soundContractSigned();
                          rerender(`Signed with ${faction.name}.`);
                          options.onWorldChanged?.();
                        } catch (err) {
                          rerender(err instanceof Error && err.message ? err.message : "They did not take the contract.");
                        }
                      },
                    },
                    "Sign on",
                  )
                : h("span", { class: "caption" }, "30 days, daily pay + victory bonuses."),
            ),
          ),
        );
      }
    }
  }

  return root;
}

/**
 * The power board. Task 221.
 *
 * A composite strength estimate per faction, ranked, with the gap to the leader and
 * a one-line verdict. The scoring is `rankGreatPowers` from
 * `src/diplomacy/greatPowers.ts` — troops, towns, treasury and reputation weighted
 * into one number by that module and not re-derived here, because a second opinion
 * about who is stronger is exactly the thing that makes a war-starting panel
 * untrustworthy. The panel draws the ranking it is given.
 *
 * Absent a roster, nothing is drawn: there is no faction list in the diplomacy
 * layer's own state, and a table of strengths nobody supplied would be a map made
 * of guesses. An empty roster is a different thing and says so.
 */
function powerBoard(powers: ClanPower[] | undefined): HTMLElement | null {
  if (powers === undefined) return null;
  const wrap = h("section", { "data-testid": "diplomacy-powers" });
  wrap.appendChild(sectionHeader("Strength of the powers"));

  if (powers.length === 0) {
    wrap.appendChild(
      emptyState("No powers to compare", "Nobody has been measured yet. Powers appear once the campaign reports them."),
    );
    return wrap;
  }

  const ranked = rankGreatPowers(powers);
  const columns: Column<PowerRank>[] = [
    { header: "#", numeric: true, render: (p) => String(p.rank) },
    { header: "Power", render: (p) => h("span", { class: "label" }, p.clanName) },
    { header: "Strength", numeric: true, testId: "power-score", render: (p) => p.score.toLocaleString("en-US") },
    { header: "Behind the leader", numeric: true, render: (p) => (p.gapToLeader === 0 ? "—" : p.gapToLeader.toLocaleString("en-US")) },
    { header: "Reading", render: (p) => p.verdict },
  ];
  wrap.appendChild(dataTable("Power ranking", columns, ranked, "diplomacy-power-table"));
  wrap.appendChild(
    h(
      "p",
      { class: "caption", style: "margin:var(--space-2) 0 0" },
      "Strength is troops, towns held, treasury and standing, weighted together by the campaign. It is an estimate, not a count.",
    ),
  );
  return wrap;
}

/**
 * What moves the reputation meter. Task 225.
 *
 * A meter with no explanation is a number the player can only watch, so the list
 * of actions and their weights is printed under it. The weights are
 * `REPUTATION_EFFECTS` from `src/diplomacy/reputation.ts`, which owns them — the
 * panel prints that table and does not restate a figure of its own, because a
 * reputation action worth -12 in one place and -10 in another is how a player stops
 * believing the meter.
 *
 * Built as a real `<details>` disclosure rather than a `title` attribute: a tooltip
 * is unreachable by keyboard and by touch, and this is the difference between
 * honouring an oath and being branded an oathbreaker.
 *
 * The sign carries in the word as well as the number — "costs 12", "gains 4" —
 * because the effect is a direction, not just a magnitude.
 */
function reputationEffectsLegend(): HTMLElement {
  const details = h("details", {
    class: "reputation-legend",
    "data-testid": "reputation-effects",
  });
  details.appendChild(
    h("summary", { class: "label" }, "What moves your reputation"),
  );
  const list = h("ul", { class: "reputation-legend__list" });
  for (const action of REPUTATION_ACTIONS) {
    const effect = REPUTATION_EFFECTS[action];
    const item = h("li", {
      class: "reputation-legend__row",
      "data-testid": `reputation-effect-${action}`,
      "data-direction": effect >= 0 ? "up" : "down",
    });
    item.append(
      h("span", { class: "label" }, REPUTATION_ACTION_LABEL[action]),
      h(
        "span",
        { class: "row__value data" },
        effect >= 0 ? `gains ${effect}` : `costs ${Math.abs(effect)}`,
      ),
    );
    list.appendChild(item);
  }
  details.appendChild(list);
  details.appendChild(
    h(
      "p",
      { class: "annotation", style: "font-size:var(--type-caption-size);margin:var(--space-2) 0 0" },
      `Standing drifts ${REPUTATION_DRIFT} a season toward neutral when nothing happens.`,
    ),
  );
  return details;
}

function incidentCard(
  incident: BorderIncident,
  season: number,
  onAnswered: (notice: string) => void,
): HTMLElement {
  const card = h(
    "div",
    { class: "incident-card", "data-testid": `border-incident-${incident.id}` },
    h("p", { class: "label" }, incident.description),
    row("Standing", `${relationWith(incident.factionId)}`, { mono: true }),
  );
  const actions = h("div", { class: "row-actions" });
  for (const response of INCIDENT_RESPONSES) {
    actions.append(
      button(responseLabel(response), () => {
        const resolution = answerBorderIncident(incident.id, response, Date.now() % 2 ** 31);
        if (!resolution) {
          onAnswered("That incident was already answered.");
          return;
        }
        // The response moves the relationship; the reason is required and honest.
        adjustRelation(
          incident.factionId,
          incident.factionName,
          resolution.relationDelta,
          `border incident: ${response}`,
          season,
        );
        onAnswered(
          `${resolution.line} (relations ${resolution.relationDelta >= 0 ? "+" : ""}${resolution.relationDelta})`,
        );
      }, { testId: `border-incident-${response}-${incident.id}` }),
    );
  }
  card.appendChild(actions);
  return card;
}

function responseLabel(response: IncidentResponse): string {
  return response === "retaliate" ? "Retaliate" : response === "protest" ? "Protest" : "Overlook";
}

/**
 * One faction on the diplomacy list.
 *
 * Only what identifies it: the panel resolves everything else — the standing, the
 * wars, the treaties — from the modules that own those, by id.
 */
export interface DiplomacyFaction {
  /** The id the diplomacy layer keys its records by. */
  id: string;
  /** Display name. */
  name: string;
}

/**
 * Who the player is dealing with. Tasks 202 and 203.
 *
 * The relation is read with `relationWith` from
 * `src/diplomacy/relationNotifications.ts`, which is where every relation change in
 * the client lands, so this list cannot disagree with the change feed below it. The
 * band is `relationBand` from `src/diplomacy/notables.ts`, the client's shared
 * -100..100 definition.
 *
 * The bar is two-sided because the scale is: a bar that only grew rightward would
 * make a faction you are at -80 with look closer to neutral than one you are merely
 * cold-shouldered at -10. The fill leaves the centre toward the side the relation
 * lies on, and the number is printed beside it so nobody has to read the bar at all.
 */
function factionList(factions: DiplomacyFaction[] | undefined): HTMLElement | null {
  if (factions === undefined) return null;
  const wrap = h("section", { "data-testid": "diplomacy-factions" });
  wrap.appendChild(sectionHeader("Factions"));

  if (factions.length === 0) {
    wrap.appendChild(
      emptyState("No factions to report", "Nobody has been met yet. Factions appear once the campaign reports them."),
    );
    return wrap;
  }

  // Resolved once, by id, rather than per row: the war and treaty modules own those
  // records, and this list only reports what they say.
  const wars = new Map(activeWars().map((w) => [w.enemyId, w]));
  const treaties = treatyCompliance();

  const list = h("ul", { class: "faction-list" });
  for (const faction of factions) {
    const relation = relationWith(faction.id);
    const band = relationBand(relation);
    const war = wars.get(faction.id);
    const item = h("li", {
      class: "faction",
      "data-testid": `faction-${faction.id}`,
      "data-band": band,
      "data-direction": relation < 0 ? "down" : "up",
      "data-at-war": String(war !== undefined),
    });

    const head = h("div", { class: "field-row", style: "justify-content:space-between;align-items:baseline;gap:var(--space-2)" });
    head.append(
      h("strong", { class: "label" }, faction.name),
      h(
        "span",
        { class: "mono caption", "data-testid": `faction-relation-${faction.id}` },
        `${RELATION_BAND_WORD[band]} · ${signedRelation(relation)}`,
      ),
    );
    item.appendChild(head);

    // Task 204. Being at war is a fact, not a feeling, so it is stated rather than
    // hinted at with a colour — and it is stated from `activeWars`, which is the same
    // record the war-goal table above is built from, so the list cannot say you are at
    // war with someone the table does not list. A declared goal is named, because the
    // goal is the reason the war is being fought and the weariness it causes is in the
    // table already.
    if (war) {
      item.appendChild(
        h(
          "p",
          { class: "faction__war", "data-testid": `faction-at-war-${faction.id}` },
          war.goal
            ? `At war — fighting for ${war.goal}: ${WAR_GOAL_DESCRIPTIONS[war.goal]}`
            : "At war — no goal declared.",
        ),
      );
    }

    // Task 205. A signed treaty is the one binding the client can actually evidence
    // between two factions, so that is what is reported — with whether it is holding.
    // `treatyCompliance` is the same source the treaties table below is built from,
    // so the two agree on what is strained and what is not.
    const held = treaties.filter((t) => t.treaty.factionId === faction.id);
    if (held.length > 0) {
      const names = held
        .map((t) => `${t.treaty.name} (${t.underStrain ? `strained, ${t.brokenTerms} term${t.brokenTerms === 1 ? "" : "s"} broken` : "holding"})`)
        .join("; ");
      item.appendChild(
        h(
          "p",
          { class: "faction__treaty", "data-testid": `faction-treaty-${faction.id}` },
          `Bound by: ${names}`,
        ),
      );
    }

    const half = Math.abs(relation) / 2;
    item.appendChild(
      h(
        "div",
        {
          class: "relation",
          role: "meter",
          "aria-label": `Standing with ${faction.name}`,
          "aria-valuemin": "-100",
          "aria-valuemax": "100",
          "aria-valuenow": String(relation),
          "aria-valuetext": `${signedRelation(relation)}, ${RELATION_BAND_WORD[band]}`,
          "data-testid": `faction-bar-${faction.id}`,
        },
        h("span", { class: "relation__axis", "aria-hidden": "true" }),
        h("span", {
          class: "relation__fill",
          "aria-hidden": "true",
          "data-testid": `faction-fill-${faction.id}`,
          style: relation < 0
            ? `left:${50 - half}%;width:${half}%`
            : `left:50%;width:${half}%`,
        }),
      ),
    );

    list.appendChild(item);
  }
  wrap.appendChild(list);
  wrap.appendChild(
    h(
      "p",
      { class: "caption", style: "margin:var(--space-2) 0 0" },
      "Standing runs from -100 against you to +100 for you, and every change is logged below with its reason.",
    ),
  );
  return wrap;
}

/** The band words, so a relation reads as a judgement rather than a bare number. */
const RELATION_BAND_WORD: Record<ReturnType<typeof relationBand>, string> = {
  hostile: "Hostile",
  cold: "Cold",
  neutral: "Neutral",
  warm: "Warm",
  allied: "Allied",
};

/** A signed relation, so +5 never reads as 5. */
function signedRelation(value: number): string {
  return value > 0 ? `+${Math.round(value)}` : String(Math.round(value));
}

/**
 * One treaty's terms, item by item. Task 228.
 *
 * `TermStatus` is "kept" | "broken" | "pending", and the three are different claims:
 * a term nobody has reported on yet is not a term that is being honoured. Each is
 * therefore printed as its own word, with the glyph the status chips use across the
 * client so a strained treaty reads the same here as it does in the table above.
 *
 * A party of "us" is written as your own obligation and "them" as theirs, because
 * "party: them" is a storage detail and not a thing a player can act on.
 */
function treatyTerms(status: TreatyStatus): HTMLElement {
  const card = h("details", {
    class: "treaty-terms",
    "data-testid": `treaty-terms-${status.treaty.id}`,
    "data-under-strain": String(status.underStrain),
  });
  card.appendChild(
    h(
      "summary",
      { class: "label" },
      `${status.treaty.name} — ${status.underStrain ? `${status.brokenTerms} term${status.brokenTerms === 1 ? "" : "s"} broken` : "all terms honoured"}`,
    ),
  );
  const list = h("ul", { class: "treaty-terms__list" });
  for (const term of status.treaty.terms) {
    const item = h("li", {
      class: "treaty-terms__row",
      "data-testid": `treaty-term-${term.id}`,
      "data-term-status": term.status,
    });
    item.append(
      h("span", { class: "label" }, term.text),
      h(
        "span",
        { class: "caption" },
        `${term.party === "us" ? "Your obligation" : "Theirs"} · ${TERM_STATUS_WORD[term.status]}` +
          (term.seasonsKept > 0 ? ` · kept ${term.seasonsKept} season${term.seasonsKept === 1 ? "" : "s"}` : ""),
      ),
    );
    list.appendChild(item);
  }
  card.appendChild(list);
  return card;
}

/** Each term status in a word, because "pending" is not "kept". */
const TERM_STATUS_WORD: Record<TreatyTerm["status"], string> = {
  kept: "Kept",
  broken: "Broken",
  pending: "Not yet reported",
};

/**
 * Proposing an alliance. Tasks 210 and 211.
 *
 * The odds are `allianceAcceptOdds` from `src/diplomacy/negotiation.ts`, and the
 * counter-offer is `counterOffer` from the same file: the panel supplies the three
 * inputs that module names — the standing with that faction, the demand being made,
 * and the player's own reputation — and prints what comes back. It does not compute
 * a second set of odds, because two disagreeing estimates of whether an alliance will
 * be accepted is worse than one.
 *
 * The requirements shown are the terms the player has written and the demand being
 * asked, plus where the counter-offer lands: `counterOffer` moves the demand toward
 * the middle by a concession step, so showing both numbers is the difference between
 * "they will probably refuse" and an offer the player can adjust.
 *
 * **Nothing here records an alliance.** `negotiateRound` computes the structure of a
 * round and the campaign's own layer answers it; the diplomacy layer has no store this
 * panel can write a signed alliance into without inventing one. The panel says so
 * rather than pretending the offer went anywhere.
 */
function allianceBlock(options: DiplomacyPanelOptions): HTMLElement | null {
  if (options.factions === undefined) return null;
  const wrap = h("section", { "data-testid": "diplomacy-alliance" });
  wrap.appendChild(sectionHeader("Alliance"));

  if (options.factions.length === 0) {
    wrap.appendChild(
      emptyState("Nobody to propose to", "A faction has to be known before an alliance can be proposed."),
    );
    return wrap;
  }

  const target = h(
    "select",
    { "aria-label": "Faction to propose to", "data-testid": "alliance-faction" },
    ...options.factions.map((f) => h("option", { value: f.id }, f.name)),
  ) as HTMLSelectElement;

  const demand = numberField("alliance-demand", "Demand of them (0-100)", 50, { min: 0, max: 100 });
  const terms = h("input", {
    type: "text",
    id: "alliance-terms",
    placeholder: "Terms, comma separated",
    "aria-label": "Alliance terms, comma separated",
    "data-testid": "alliance-terms",
    class: "field__input",
  }) as HTMLInputElement;

  const oddsLine = h("p", {
    class: "caption",
    "data-testid": "alliance-odds",
    role: "status",
  }, "Set a demand and read the odds.");
  const counterLine = h("p", {
    class: "caption",
    "data-testid": "alliance-counter",
    role: "status",
  }, "Their counter-offer appears here once the odds are read.");

  wrap.appendChild(h("div", { class: "form-row" }, target, demand.field));
  wrap.appendChild(
    h("div", { class: "field" }, h("label", { class: "field__label label", for: "alliance-terms" }, "Terms"), terms),
  );

  /** The demand and terms, validated once, for both readings below. */
  const read = (): { ok: true; value: number; list: string[] } | { ok: false; why: string } => {
    const value = Number(demand.input.value);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return { ok: false, why: "A demand is 0 to 100." };
    }
    const list = terms.value.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
    if (list.length === 0) {
      return { ok: false, why: "An alliance needs at least one term." };
    }
    return { ok: true, value, list };
  };

  wrap.appendChild(
    button("Read the odds", () => {
      const demandValue = read();
      if (!demandValue.ok) {
        oddsLine.textContent = demandValue.why;
        counterLine.textContent = "Their counter-offer appears here once the odds are read.";
        return;
      }
      const factionId = target.value;
      const factionName = options.factions!.find((f) => f.id === factionId)?.name ?? factionId;
      const relation = relationWith(factionId);
      const reputation = diplomaticReputation();
      const odds = allianceAcceptOdds(relation, demandValue.value, reputation);
      const offer: AllianceOffer = { from: "you", to: factionId, terms: demandValue.list, demand: demandValue.value };
      const round = negotiateRound(offer, 1, relation, reputation, 0);

      oddsLine.textContent =
        `${percent(odds)} likely to be accepted by ${factionName}. ` +
        `That is from a standing of ${signedRelation(relation)} and a reputation of ${reputation}/100.`;
      // The requirement the player can act on: where their demand has to land.
      counterLine.textContent =
        `Against a demand of ${round.offer.demand} they would counter at ${round.counter.demand}. ` +
        `Terms on the table: ${demandValue.list.join("; ")}.`;
    }, { testId: "alliance-read" }),
  );
  wrap.appendChild(oddsLine);
  wrap.appendChild(counterLine);
  wrap.appendChild(
    h(
      "p",
      { class: "annotation", style: "font-size:var(--type-caption-size)" },
      "Reading the odds is all this panel does. Sending the offer is the campaign's, and nothing here records a signed alliance.",
    ),
  );
  return wrap;
}

/** An accept probability as a whole percentage. */
function percent(odds: number): string {
  return `${Math.round(odds * 100)}%`;
}

/**
 * Sending a gift. Tasks 216 and 217.
 *
 * The gain is `sendGift` from `src/diplomacy/statecraft.ts`, which scales the gift
 * against the recipient's wealth and takes diminishing returns on how much they
 * already like you. The panel supplies those inputs and prints what came back; it
 * does not price a gift itself.
 *
 * Unlike the alliance and tribute sections, this one *does* change something, and
 * deliberately so: it records the gain through `adjustRelation` with the reason
 * spelled out — "gift: $400" — which is the same path the border-incident answers in
 * this panel already take, and the same requirement `adjustRelation` enforces that a
 * relation change must carry a cause. The relation change feed below therefore shows
 * a gift as a logged event with a reason, like every other change, rather than a
 * number that moved for no stated cause.
 *
 * The standing passed to the calculator is the -100..100 value `relationWith` returns
 * unchanged. The module's "room" is 100 minus that figure, so a faction that dislikes
 * you simply has more headroom for a gift to move — which is the behaviour the module
 * describes, rather than one this panel would have to invent a mapping for.
 */
function giftBlock(
  options: DiplomacyPanelOptions,
  /** Rebuild the panel carrying a notice — the same path the incident answers take. */
  onSent: (notice: string) => void,
): HTMLElement | null {
  if (options.factions === undefined) return null;
  const wrap = h("section", { "data-testid": "diplomacy-gifts" });
  wrap.appendChild(sectionHeader("Gifts"));

  if (options.factions.length === 0) {
    wrap.appendChild(
      emptyState("Nobody to send a gift to", "A faction has to be known before it can be courted."),
    );
    return wrap;
  }

  const target = h(
    "select",
    { "aria-label": "Gift recipient", "data-testid": "gift-faction" },
    ...options.factions.map((f) => h("option", { value: f.id }, f.name)),
  ) as HTMLSelectElement;

  const value = numberField("gift-value", "Value of the gift", 100, { min: 1 });
  const wealth = numberField("gift-wealth", "Their wealth", 1000, { min: 0 });
  const outcome = h("p", {
    class: "caption",
    "data-testid": "gift-outcome",
    role: "status",
  }, "Nothing sent yet. A gift is recorded in the relation feed below with its value as the reason.");

  wrap.appendChild(h("div", { class: "form-row" }, target, value.field, wealth.field));
  wrap.appendChild(
    button("Send the gift", () => {
      const amount = Number(value.input.value);
      const theirWealth = Number(wealth.input.value);
      const factionId = target.value;
      const factionName = options.factions!.find((f) => f.id === factionId)?.name ?? factionId;
      if (!Number.isFinite(amount) || amount <= 0) {
        outcome.textContent = "A gift has to be worth something.";
        return;
      }
      if (!Number.isFinite(theirWealth) || theirWealth < 0) {
        outcome.textContent = "Wealth cannot be negative.";
        return;
      }
      let result: GiftResult;
      try {
        result = sendGift(amount, factionName, theirWealth, relationWith(factionId));
      } catch (e) {
        outcome.textContent = e instanceof Error ? e.message : "The gift did not go through.";
        return;
      }
      // Logged with its cause, like every other relation change in this panel.
      const logged = adjustRelation(
        factionId,
        factionName,
        result.relationGain,
        `gift: $${Math.round(amount).toLocaleString("en-US")}`,
        options.currentSeason,
      );
      // The panel is rebuilt so the relation feed below actually shows the change.
      // Reporting a logged event into a table that still reads "No changes recorded"
      // is the panel claiming something the screen does not say.
      onSent(
        `Sent $${Math.round(amount).toLocaleString("en-US")} to ${factionName}. Standing moved ` +
          `${logged.delta >= 0 ? "+" : ""}${Math.round(logged.delta)} to ${signedRelation(logged.newValue)}.`,
      );
    }, { testId: "gift-send" }),
  );
  wrap.appendChild(outcome);
  wrap.appendChild(
    h(
      "p",
      { class: "annotation", style: "font-size:var(--type-caption-size)" },
      "A gift buys standing, not a treaty. It is logged in the relation feed below with its value as the reason.",
    ),
  );
  return wrap;
}
