/**
 * The siege section (tasks 134/426). Doorless: the snapshot already carries the
 * town's siege, so the section reads it through the caller's `onGetSiege` and
 * renders exactly one of three shapes — the siege in progress (progress, walls,
 * food, engines, assault/lift), a Besiege button when the town is a valid
 * target (at war, not already besieged), or nothing to do. The simulation owns
 * every gate and every refusal; this section prints them verbatim and re-arms.
 */
import { h } from "../../dom.js";
import type { Siege } from "../../../data/types.js";
import type { TownPanelOptions } from "../TownPanel.js";
import { type TownSectionSpec } from "../townSections.js";
import { SIEGE_ENGINE_TYPES, engineType } from "../../../siege/engines.js";

/** The engine's own name, from the build-order module both providers mirror. */
function engineName(typeId: string): string {
  return engineType(typeId)?.name ?? typeId;
}

function siegeCard(siege: Siege, say: (t: string) => void, options: TownPanelOptions): HTMLElement {
  const card = h("div", { "data-testid": "siege-card" });
  card.append(
    h("p", { class: "caption", style: "margin:0" },
      `Preparation ${Math.round(siege.preparation * 100)}% \u00b7 walls ${siege.breached ? "BREACHED" : `${Math.round(siege.wallIntegrity * 100)}%`}` +
        ` \u00b7 defender food ${Math.max(0, Math.round(siege.defenderFoodDays))} days \u00b7 engines ${siege.siegeEngines}`),
    h("p", { class: "caption", style: "margin:var(--space-1) 0 0" },
      `Casualties so far: attackers ${siege.attackerCasualties}, defenders ${siege.defenderCasualties}.`),
  );

  const actions = h("div", { class: "field-row", style: "gap:var(--space-2);margin-top:var(--space-2)" });
  const assault = h("button", { type: "button", class: "btn", "data-testid": "siege-assault" }, "Order the assault");
  assault.addEventListener("click", () => {
    assault.disabled = true;
    void options.onAssaultSiege!(siege.id).then(
      (r) => {
        // Win or lose, the caller repaints from a fresh snapshot; the re-arm
        // only matters when the siege (and so the section) survives the repaint,
        // which is exactly the thrown-back case.
        assault.disabled = false;
        say(r.victory ? "The walls are taken." : "The assault was thrown back.");
        options.onSiegeChanged?.();
      },
      (err: unknown) => {
        assault.disabled = false;
        say(err instanceof Error && err.message ? err.message : "The assault could not be ordered.");
      },
    );
  });
  const lift = h("button", { type: "button", class: "btn", "data-testid": "siege-lift" }, "Lift the siege");
  lift.addEventListener("click", () => {
    lift.disabled = true;
    void options.onLiftSiege!(siege.id).then(
      () => {
        say("The siege is lifted. The army withdraws.");
        options.onSiegeChanged?.();
      },
      (err: unknown) => {
        lift.disabled = false;
        say(err instanceof Error && err.message ? err.message : "The siege could not be lifted.");
      },
    );
  });
  actions.append(assault, lift);
  card.append(actions);

  // -- engine park -----------------------------------------------------------
  // Built only when the caller can serve the park orders. The park is the
  // sim's ledger read through the caller; the type names and prices are the
  // client's build-order module, which both providers mirror.
  if (options.onGetSiegeEngines && options.onQueueSiegeEngine && options.onMoveSiegeEngine) {
    const parkBox = h("div", { "data-testid": "siege-engine-park", style: "margin-top:var(--space-3)" });
    parkBox.append(h("p", { class: "label", style: "margin:0 0 var(--space-1)" }, "Engine park"));
    parkBox.append(h("p", { class: "caption", style: "margin:0" }, "Reading the park..."));
    card.append(parkBox);
    void options.onGetSiegeEngines(siege.id).then(
      (park) => {
        parkBox.replaceChildren(h("p", { class: "label", style: "margin:0 0 var(--space-1)" }, "Engine park"));
        if (park.queue.length === 0 && park.reserve.length === 0 && park.deployed.length === 0) {
          parkBox.append(h("p", { class: "caption", "data-testid": "engine-park-empty", style: "margin:0" },
            "No engines yet. Order one below and the builders get to work."));
        } else {
          for (const q of park.queue) {
            parkBox.append(h("p", { class: "caption", "data-testid": `engine-queue-${q.typeId}`, style: "margin:0" },
              `${engineName(q.typeId)}: ${q.daysLeft} day${q.daysLeft === 1 ? "" : "s"} from ready.`));
          }
          for (const [key, engines, action, label] of [
            ["deployed", park.deployed, "reserve" as const, "Pull back to reserve"],
            ["reserve", park.reserve, "deployed" as const, "Deploy to the lines"],
          ] as const) {
            for (const typeId of engines) {
              const row = h("div", { class: "field-row", "data-testid": `engine-${key}-${typeId}`, style: "gap:var(--space-2);margin:var(--space-1) 0 0" });
              row.append(h("span", { class: "caption", style: "margin:0" },
                `${engineName(typeId)} (${key})${park.fireVariants.includes(typeId) ? " \u00b7 fire variant" : ""}`));
              const moveBtn = h("button", { type: "button", class: "btn btn--small", "data-testid": `engine-move-${typeId}-${key}` }, label);
              moveBtn.addEventListener("click", () => {
                moveBtn.disabled = true;
                void options.onMoveSiegeEngine!(siege.id, typeId, action).then(
                  () => {
                    say("The engine moves.");
                    options.onSiegeChanged?.();
                  },
                  (err: unknown) => {
                    moveBtn.disabled = false;
                    say(err instanceof Error && err.message ? err.message : "The engine did not move.");
                  },
                );
              });
              row.append(moveBtn);
              if (key === "reserve" && options.onMakeFireVariant && !park.fireVariants.includes(typeId)) {
                const fireBtn = h("button", { type: "button", class: "btn btn--small", "data-testid": `engine-fire-${typeId}` }, "Fire variant");
                fireBtn.addEventListener("click", () => {
                  fireBtn.disabled = true;
                  void options.onMakeFireVariant!(siege.id, typeId).then(
                    () => {
                      say("It burns hotter now. So does the risk.");
                      options.onSiegeChanged?.();
                    },
                    (err: unknown) => {
                      fireBtn.disabled = false;
                      say(err instanceof Error && err.message ? err.message : "The conversion did not land.");
                    },
                  );
                });
                row.append(fireBtn);
              }
              parkBox.append(row);
            }
          }
        }
        // The build order: one priced button per engine type.
        const buildRow = h("div", { class: "field-row", style: "gap:var(--space-2);margin-top:var(--space-2)" });
        for (const t of SIEGE_ENGINE_TYPES) {
          const buildBtn = h("button", { type: "button", class: "btn btn--small", "data-testid": `engine-queue-${t.id}` },
            `Build ${t.name} (${t.cost}g, ${t.buildDays}d)`);
          buildBtn.addEventListener("click", () => {
            buildBtn.disabled = true;
            void options.onQueueSiegeEngine!(siege.id, t.id).then(
              () => {
                say("The builders are on it.");
                options.onSiegeChanged?.();
              },
              (err: unknown) => {
                buildBtn.disabled = false;
                say(err instanceof Error && err.message ? err.message : "The order did not land.");
              },
            );
          });
          buildRow.append(buildBtn);
        }
        parkBox.append(buildRow);
      },
      (err: unknown) => {
        parkBox.replaceChildren(
          h("p", { class: "label", style: "margin:0 0 var(--space-1)" }, "Engine park"),
          h("p", { class: "caption", style: "margin:0" },
            err instanceof Error && err.message ? err.message : "The park could not be read."),
        );
      },
    );
  }

  return card;
}

export const townSiegeSectionSpec: TownSectionSpec<void> = {
  id: "siege",
  header: "Siege",
  enterLabel: "Consider a siege",
  loadingLabel: "Reading the walls...",  failureLabel: "The siege could not be read.",
  available: (options) =>
    options.onGetSiege !== undefined && options.onStartSiege !== undefined && options.onAssaultSiege !== undefined && options.onLiftSiege !== undefined,
  render: (list, _view, _rt, options) => {
    const town = options.town;
    if (!town) return;
    const say = (text: string) => {
      const slot = list.closest("section")?.querySelector("[data-testid='siege-message']");
      if (slot) {
        slot.textContent = text;
        (slot as HTMLElement).style.display = "";
      }
    };

    const btnRow = h("div", { class: "field-row", style: "gap:var(--space-2);margin-top:var(--space-2)" });
    const besiegeBtn = h("button", { type: "button", class: "btn", "data-testid": "siege-begin" }, "Lay siege to this town");
    besiegeBtn.addEventListener("click", () => {
      besiegeBtn.disabled = true;
      void options.onStartSiege!(town.id).then(
        () => {
          say("The siege lines are drawn.");
          options.onSiegeChanged?.();
        },
        (err: unknown) => {
          besiegeBtn.disabled = false;
          say(err instanceof Error && err.message ? err.message : "The siege could not begin.");
        },
      );
    });
    btnRow.append(besiegeBtn);
    list.append(btnRow);

    // The live siege, read through the caller so the data is as fresh as the
    // caller's snapshot; the Besiege button above is only an offer the sim can refuse.
    void options.onGetSiege!(town.id).then(
      (siege: Siege | null) => {
        if (siege) {
          list.replaceChildren(siegeCard(siege, say, options));
        }
      },
      (err: unknown) => {
        say(err instanceof Error && err.message ? err.message : "The siege could not be read.");
      },
    );
  },
};
