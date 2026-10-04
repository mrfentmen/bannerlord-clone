/**
 * The clan panel (tasks 139-142): dynasty, courtship, clan tier and the lords
 * your party holds prisoner. Everything on it is read from the simulation on
 * demand or sent as an order; the panel invents no number and no refusal.
 *
 * - Family: the roster from the snapshot, heir via `getHeir(clanId)`, marriages
 *   and births posted to the dynasty routes.
 * - Courtship: start on an unmarried character, gift/visit/deed/poem actions,
 *   propose. The sim rolls affection and writes the line.
 * - Tier: `getClanTier()` — tier, renown, progress to next, fief and party
 *   limits. Founding a kingdom posts `/v1/kingdom`; the sim decides the wars.
 * - Held lords: ransom for gold, release for relation and honor, execute —
 *   with a typed confirmation, because there is no undoing an execution.
 *
 * Every async action repaints through the caller's `onChanged` so the rail and
 * the rest of the app see the same world this panel just moved.
 */
import { h, row, sectionHeader } from "../dom.js";
import { emptyState, panel } from "../kit.js";
import { asBottomSheet } from "./narrow.js";
import type { GameCharacter, SimSnapshot } from "../../data/types.js";

export interface ClanPanelOptions {
  snapshot: SimSnapshot;
  /** Read the clan tier from the provider. */
  onGetClanTier: () => Promise<{
    tier: number;
    name: string;
    renown: number;
    renownToNext: number;
    fiefLimit: number;
    fiefsHeld: number;
    companionSlots: number;
    partyCapacity: number;
  }>;
  /** Read the current heir. */
  onGetHeir: () => Promise<GameCharacter | null>;
  /** Marry two living unmarried characters. */
  onMarry: (charId1: string, charId2: string) => Promise<void>;
  /** Record a birth to two parents. */
  onHaveChild: (parentId1: string, parentId2: string, childName: string) => Promise<{ childId: string }>;
  /** Begin courting a character (the suitor is the player). */
  onStartCourtship: (targetId: string) => Promise<{ line: string }>;
  /** Perform a courting action on the current courtship. */
  onPerformCourtAction: (action: "gift" | "visit" | "deed" | "poem") => Promise<{ line: string; affection: number }>;
  /** Propose to the current courtship target. */
  onProposeMarriage: () => Promise<{ accepted: boolean; line: string }>;
  /** List active courtships. */
  onGetCourtships: () => Promise<{ targetName: string; affection: number; stage: string }[]>;
  /** List the enemy lords your party holds. */
  onGetHeldLords: () => Promise<{ name: string; factionId: string; clanName: string; capturedDay: number }[]>;
  /** Ransom a held lord home for gold. */
  onRansomHeldLord: (name: string) => Promise<{ gold: number }>;
  /** Release a held lord freely: +relation, +honor. */
  onReleaseHeldLord: (name: string) => Promise<{ relationGained: number }>;
  /** Execute a held lord. The nuclear political option. */
  onExecuteHeldLord: (name: string) => Promise<{ line: string }>;
  /** Found your own kingdom. */
  onFoundKingdom: (kingdomName: string) => Promise<{ kingdomName: string; capital: string; warWithFormer: boolean; line: string }>;
  /** The player's character id (suitor, spouse, parent). */
  playerId: string;
  /** The player clan's id (heir lookup, family roster). */
  clanId: string;
  /** Called after any action that changed the world, so the caller repaints. */
  onChanged: () => void;
}

/** One message slot per panel; actions speak into it. */
type Say = (text: string) => void;

function messageSlot(): { slot: HTMLElement; say: Say } {
  const slot = h("p", {
    class: "caption",
    role: "status",
    "data-testid": "clan-message",
    style: "margin:0 0 var(--space-3);white-space:pre-line",
  });
  slot.style.display = "none";
  return { slot, say: (text) => { slot.style.display = ""; slot.textContent = text; } };
}

function errText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** The names of the settlements the clan holds, from the snapshot's towns. */
function clanFiefNames(options: ClanPanelOptions): string[] {
  const clan = options.snapshot.clans.find((c) => c.id === options.clanId);
  if (!clan) return [];
  return clan.fiefIds
    .map((id) => options.snapshot.towns.find((t) => t.settlementId === id || t.id === id)?.name ?? null)
    .filter((n): n is string => n !== null);
}

function familySection(
  body: HTMLElement,
  options: ClanPanelOptions,
  say: Say,
): void {
  body.appendChild(sectionHeader("Family"));
  const members = (options.snapshot.characters ?? [])
    .filter((c) => c.clanId === options.clanId && c.alive)
    .sort((a, b) => Number(b.isPlayer) - Number(a.isPlayer));
  const list = h("ul", { class: "notable-list", "data-testid": "clan-family" });
  for (const m of members) {
    const item = h("li", { class: "notable", "data-testid": `clan-member-${m.id}` });
    item.append(
      h("div", { class: "field-row", style: "justify-content:space-between;align-items:baseline;gap:var(--space-2)" },
        h("strong", { class: "label" }, m.isPlayer ? `${m.name} (you)` : m.name),
        h("span", { class: "caption" }, m.spouseId ? "married" : "unmarried"),
      ),
    );
    list.appendChild(item);
  }
  body.appendChild(list);

  // Fiefs (task 249): the towns and castles the clan holds, named from the
  // snapshot's own town records. Empty means none held, not a fabrication.
  const fiefs = clanFiefNames(options);
  body.appendChild(
    row("Fiefs", fiefs.length > 0 ? fiefs.join(", ") : "None held", { testId: "clan-fief-list" }),
  );

  const heirSlot = h("div", { "data-testid": "clan-heir", style: "margin-top:var(--space-2)" });
  heirSlot.append(h("p", { class: "caption", style: "margin:0" }, "Reading the line of succession..."));
  body.appendChild(heirSlot);
  void options.onGetHeir().then(
    (heir) => {
      heirSlot.replaceChildren(
        row("Heir", heir ? heir.name : "None named", { testId: "clan-heir-name" }),
      );
    },
    () => {
      heirSlot.replaceChildren(h("p", { class: "caption", style: "margin:0" }, "The succession could not be read."));
    },
  );

  // Marry: two clan members by id, posted to the dynasty route.
  const marry1 = h("input", { class: "field__input", "data-testid": "clan-marry-1", placeholder: "character id A", "aria-label": "First character id to marry" });
  const marry2 = h("input", { class: "field__input", "data-testid": "clan-marry-2", placeholder: "character id B", "aria-label": "Second character id to marry" });
  const marryBtn = h("button", { type: "button", class: "btn", "data-testid": "clan-marry" }, "Marry");
  marryBtn.addEventListener("click", () => {
    marryBtn.disabled = true;
    void options.onMarry(marry1.value.trim(), marry2.value.trim()).then(
      () => { say("The marriage is recorded."); options.onChanged(); },
      (err: unknown) => { marryBtn.disabled = false; say(errText(err, "The marriage did not land.")); },
    );
  });
  const marryRow = h("div", { class: "field-row", style: "gap:var(--space-2);margin-top:var(--space-2)" }, marry1, marry2, marryBtn);
  body.appendChild(marryRow);

  // A child to two parents.
  const childName = h("input", { class: "field__input", "data-testid": "clan-child-name", placeholder: "child's name", "aria-label": "Child's name" });
  const childBtn = h("button", { type: "button", class: "btn", "data-testid": "clan-have-child" }, "Record a birth");
  childBtn.addEventListener("click", () => {
    const name = childName.value.trim();
    if (!name) { say("The child needs a name."); return; }
    childBtn.disabled = true;
    void options.onHaveChild(options.playerId, options.playerId, name).then(
      () => { say(`A child was born: ${name}.`); options.onChanged(); },
      (err: unknown) => { childBtn.disabled = false; say(errText(err, "The birth did not land.")); },
    );
  });
  const childRow = h("div", { class: "field-row", style: "gap:var(--space-2);margin-top:var(--space-2)" }, childName, childBtn);
  body.appendChild(childRow);
}

const COURT_ACTIONS: { id: "gift" | "visit" | "deed" | "poem"; label: string }[] = [
  { id: "gift", label: "Send a gift" },
  { id: "visit", label: "Pay a visit" },
  { id: "deed", label: "Tell of a deed" },
  { id: "poem", label: "Send a poem" },
];

function courtshipSection(body: HTMLElement, options: ClanPanelOptions, say: Say): void {
  body.appendChild(sectionHeader("Courtship"));
  const status = h("div", { "data-testid": "clan-courtship-status" });
  status.append(h("p", { class: "caption", style: "margin:0" }, "Reading the courtships..."));
  body.appendChild(status);
  void options.onGetCourtships().then(
    (courtships) => {
      if (courtships.length === 0) {
        status.replaceChildren(h("p", { class: "caption", style: "margin:0", "data-testid": "clan-courtship-empty" }, "Nobody is being courted."));
        return;
      }
      status.replaceChildren(
        ...courtships.map((c) =>
          row(`${c.targetName} (${c.stage})`, `${Math.round(c.affection)}`, { testId: "clan-courtship-row" }),
        ),
      );
    },
    () => {
      status.replaceChildren(h("p", { class: "caption", style: "margin:0" }, "The courtships could not be read."));
    },
  );

  const target = h("input", { class: "field__input", "data-testid": "clan-court-target", placeholder: "character id to court", "aria-label": "Character id to court" });
  const startBtn = h("button", { type: "button", class: "btn", "data-testid": "clan-court-start" }, "Begin courting");
  startBtn.addEventListener("click", () => {
    const id = target.value.trim();
    if (!id) { say("Whose attention are you trying to earn?"); return; }
    startBtn.disabled = true;
    void options.onStartCourtship(id).then(
      (r) => { say(r.line); options.onChanged(); },
      (err: unknown) => { startBtn.disabled = false; say(errText(err, "The courtship did not begin.")); },
    );
  });
  body.appendChild(h("div", { class: "field-row", style: "gap:var(--space-2);margin-top:var(--space-2)" }, target, startBtn));

  const actions = h("div", { class: "field-row", style: "gap:var(--space-2);margin-top:var(--space-2)" });
  for (const a of COURT_ACTIONS) {
    const btn = h("button", { type: "button", class: "btn", "data-testid": `clan-court-${a.id}` }, a.label);
    btn.addEventListener("click", () => {
      btn.disabled = true;
      void options.onPerformCourtAction(a.id).then(
        (r) => { btn.disabled = false; say(`${r.line} (affection ${Math.round(r.affection)})`); options.onChanged(); },
        (err: unknown) => { btn.disabled = false; say(errText(err, "The gesture did not land.")); },
      );
    });
    actions.appendChild(btn);
  }
  body.appendChild(actions);

  const proposeBtn = h("button", { type: "button", class: "btn", "data-testid": "clan-propose" }, "Propose marriage");
  proposeBtn.addEventListener("click", () => {
    proposeBtn.disabled = true;
    void options.onProposeMarriage().then(
      (r) => {
        proposeBtn.disabled = false;
        say(r.line);
        if (r.accepted) options.onChanged();
      },
      (err: unknown) => { proposeBtn.disabled = false; say(errText(err, "The proposal did not land.")); },
    );
  });
  body.appendChild(proposeBtn);
}

function tierSection(body: HTMLElement, options: ClanPanelOptions, say: Say): void {
  body.appendChild(sectionHeader("Clan standing"));
  const tierBox = h("div", { "data-testid": "clan-tier" });
  tierBox.append(h("p", { class: "caption", style: "margin:0" }, "Reading the clan's standing..."));
  body.appendChild(tierBox);
  void options.onGetClanTier().then(
    (t) => {
      tierBox.replaceChildren(
        row("Tier", `${t.tier} \u2014 ${t.name}`, { testId: "clan-tier-name" }),
        row("Renown", `${Math.round(t.renown)} / ${Math.round(t.renownToNext)} to next`, { mono: true, testId: "clan-tier-renown" }),
        row("Fiefs", `${t.fiefsHeld} of ${t.fiefLimit}`, { mono: true, testId: "clan-tier-fiefs" }),
        row("Party capacity", String(t.partyCapacity), { mono: true, testId: "clan-tier-capacity" }),
      );
    },
    () => {
      tierBox.replaceChildren(h("p", { class: "caption", style: "margin:0" }, "The clan's standing could not be read."));
    },
  );

  const kingdomName = h("input", { class: "field__input", "data-testid": "clan-kingdom-name", placeholder: "name your kingdom", "aria-label": "Kingdom name" });
  const foundBtn = h("button", { type: "button", class: "btn", "data-testid": "clan-found-kingdom" }, "Found a kingdom");
  foundBtn.addEventListener("click", () => {
    const name = kingdomName.value.trim();
    if (!name) { say("A kingdom needs a name."); return; }
    foundBtn.disabled = true;
    void options.onFoundKingdom(name).then(
      (r) => {
        say(`${r.line}${r.warWithFormer ? " You are at war with your former liege." : ""}`);
        options.onChanged();
      },
      (err: unknown) => { foundBtn.disabled = false; say(errText(err, "The kingdom was not founded.")); },
    );
  });
  body.appendChild(h("div", { class: "field-row", style: "gap:var(--space-2);margin-top:var(--space-2)" }, kingdomName, foundBtn));
}

const LORD_ACTIONS: { id: "ransom" | "release" | "execute"; label: string; needsConfirm: boolean }[] = [
  { id: "ransom", label: "Ransom", needsConfirm: false },
  { id: "release", label: "Release", needsConfirm: false },
  { id: "execute", label: "Execute", needsConfirm: true },
];

function heldLordsSection(body: HTMLElement, options: ClanPanelOptions, say: Say): void {
  body.appendChild(sectionHeader("Held lords"));
  const box = h("div", { "data-testid": "clan-held-lords" });
  box.append(h("p", { class: "caption", style: "margin:0" }, "Counting your prisoners..."));
  body.appendChild(box);
  void options.onGetHeldLords().then(
    (lords) => {
      if (lords.length === 0) {
        box.replaceChildren(h("p", { class: "caption", style: "margin:0", "data-testid": "clan-held-empty" }, "No enemy lords in chains."));
        return;
      }
      const rows: HTMLElement[] = [];
      for (const lord of lords) {
        const card = h("div", { class: "field-row", "data-testid": `clan-lord-${lord.name}`, style: "margin-bottom:var(--space-3)" });
        card.append(
          h("div", {},
            h("strong", { class: "label" }, lord.name),
            h("p", { class: "caption", style: "margin:0" }, `${lord.clanName} \u00b7 taken day ${lord.capturedDay}`),
          ),
        );
        const actions = h("div", { class: "field-row", style: "gap:var(--space-2)" });
        for (const a of LORD_ACTIONS) {
          const btn = h("button", { type: "button", class: "btn", "data-testid": `clan-lord-${a.id}-${lord.name}` }, a.label);
          btn.addEventListener("click", () => {
            if (a.needsConfirm && btn.textContent !== "Confirm") {
              btn.textContent = "Confirm";
              say(`Executing ${lord.name} cannot be undone. Press again.`);
              return;
            }
            btn.disabled = true;
            const work =
              a.id === "ransom" ? options.onRansomHeldLord(lord.name).then((r) => `Ransomed for ${r.gold} gold.`)
              : a.id === "release" ? options.onReleaseHeldLord(lord.name).then((r) => `Released. Relation +${r.relationGained}.`)
              : options.onExecuteHeldLord(lord.name).then((r) => r.line);
            void work.then(
              (line) => { say(line); options.onChanged(); },
              (err: unknown) => { btn.disabled = false; btn.textContent = a.label; say(errText(err, "The order did not land.")); },
            );
          });
          actions.appendChild(btn);
        }
        card.append(actions);
        rows.push(card);
      }
      box.replaceChildren(...rows);
    },
    () => {
      box.replaceChildren(h("p", { class: "caption", style: "margin:0" }, "Your prisoners could not be counted."));
    },
  );
}

export function clanPanel(options: ClanPanelOptions): HTMLElement {
  const { root, body } = panel({
    title: "Clan",
    testId: "clan-panel",
    onClose: () => undefined,
  });
  root.querySelector(".panel__close")?.remove();
  asBottomSheet(root);

  const { slot, say } = messageSlot();
  body.appendChild(slot);

  if (!options.snapshot.clans.some((c) => c.id === options.clanId)) {
    body.appendChild(emptyState("No clan.", "The simulation is not running a clan for this character yet."));
    return root;
  }

  familySection(body, options, say);
  courtshipSection(body, options, say);
  tierSection(body, options, say);
  heldLordsSection(body, options, say);
  return root;
}
