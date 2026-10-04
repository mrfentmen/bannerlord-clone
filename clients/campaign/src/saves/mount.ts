/**
 * Save/load panel mount.
 *
 * The DOM layer over the SaveScreens view models (screens.ts), which sits on
 * the campaign server's `POST /v1/save` / `POST /v1/load` and on a local store
 * of the save files the server wrote. The layering is strict:
 *
 *   DOM (this file) -> SaveScreens (view models, validation, errors) ->
 *   SaveServer (the campaign server) + SlotStore (IndexedDB)
 *
 * This module owns no game state, no transport and no storage. It renders the
 * panel, forwards player intent, and shows `SaveUiError.playerMessage` verbatim
 * — never a raw stack and never a sentence it invented. A retryable failure
 * also gets a retry button, because CONSTITUTION.md section 1.3 requires a way
 * out of every error state and "try again" is the real way out of a save that
 * was refused while the world was busy.
 *
 * Wiring: `currentSnapshot` supplies the day a new slot is labelled with, and
 * `onLoad` is the after-restore hook (see screens.ts — the restore itself
 * happens on the server). Both `server` and `store` default to live ones
 * pointed at the configured API, so the panel reaches the campaign without the
 * app shell having to wire it.
 */

import "./saves.css";
import { getAudioManager } from "../audio/AudioManager.js";
import { h, replace, clear } from "../ui/dom.js";
import { panel, statusChip, emptyState, toast } from "../ui/kit.js";
import {
  AUTOSAVE_ID,
  SaveScreens,
  SaveUiError,
  type SlotCard,
} from "./screens.js";
import { SaveServer } from "./server.js";
import type { SlotStore } from "./slots.js";
import type { SimSnapshot } from "../data/types.js";

export interface SaveLoadPanelOptions {
  /** The campaign server. Defaults to a live one on the configured API. */
  server?: SaveServer;
  /** Where save files are kept. Defaults to IndexedDB. */
  store?: SlotStore;
  /** Live game state, read when the player saves. */
  currentSnapshot: () => SimSnapshot;
  /**
   * Called after the server has restored the campaign. Advisory: the restore
   * has already happened, so use it to drop cached state and let the next tick
   * repaint. A throw here is logged, not shown as a failed load.
   */
  onLoad?: (snapshot: SimSnapshot) => void | Promise<void>;
  onClose?: () => void;
  /**
   * Ironman (MASTER_PLAN task 143): a single autosave, no manual saves. When
   * true the save row and the named-slot list are hidden and only the
   * autosave slot can be loaded. The autosave itself is written by the
   * game's normal autosave path, not by this panel.
   */
  ironmanActive?: boolean;
}

const DELETE_ARM_MS = 5000;

export function saveLoadPanel(options: SaveLoadPanelOptions): {
  root: HTMLElement;
  /** Re-read the slot list. Runs automatically after every action. */
  refresh: () => Promise<void>;
  /** The screens layer, for callers that also drive a quicksave through it. */
  screens: SaveScreens;
} {
  const screens = new SaveScreens({
    ...(options.server ? { server: options.server } : {}),
    ...(options.store ? { store: options.store } : {}),
    currentSnapshot: options.currentSnapshot,
    ...(options.onLoad ? { onLoad: options.onLoad } : {}),
  });

  const { root, body } = panel({
    title: "Save / Load",
    testId: "save-load-panel",
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });

  // -- error line -----------------------------------------------------------
  const errorBox = h("div", {
    class: "save-error",
    role: "alert",
    hidden: true,
    "data-testid": "save-error",
  });

  /**
   * Show a failure.
   *
   * `retry` is the action that was just refused, so the retry button re-runs
   * exactly that rather than a generic refresh: a save refused because the
   * world was busy is fixed by pressing Save again, and offering "refresh the
   * list" there would be a button that cannot fix it. The button names what it
   * retries, because "Try again" next to a save form reads as a guess.
   */
  function showError(err: unknown, retry?: { label: string; run: () => void }): void {
    const message =
      err instanceof SaveUiError
        ? err.playerMessage
        : "Something went wrong. The game itself is untouched.";
    const retryable = err instanceof SaveUiError && err.retryable;
    const children: Node[] = [statusChip("critical", message)];
    if (retryable && retry) {
      const btn = h(
        "button",
        { type: "button", class: "btn btn--quiet", "data-testid": "save-error-retry" },
        `Try ${retry.label} again`,
      );
      btn.addEventListener("click", () => {
        clearError();
        retry.run();
      });
      children.push(btn);
    }
    replace(errorBox, ...children);
    errorBox.hidden = false;
  }

  function clearError(): void {
    clear(errorBox);
    errorBox.hidden = true;
  }

  // -- busy guard -----------------------------------------------------------
  let busy = false;
  const controls: Array<{ disabled: boolean }> = [];
  const track = <T extends { disabled: boolean }>(el: T): T => {
    controls.push(el);
    el.disabled = busy;
    return el;
  };

  function setBusy(next: boolean): void {
    busy = next;
    for (const el of controls) el.disabled = next;
  }

  /**
   * Run one player action: disable the controls, clear the old error, and
   * surface anything that throws.
   *
   * `label` names the action in the retry affordance, so the button reads "Try
   * saving again" rather than a bare "Try again" when the failure was a save.
   */
  async function run(op: () => Promise<void>, label?: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    clearError();
    try {
      await op();
    } catch (err) {
      showError(err, label ? { label, run: () => void run(op, label) } : undefined);
    } finally {
      setBusy(false);
    }
  }

  // -- save row -------------------------------------------------------------
  const nameInput = track(
    h("input", {
      type: "text",
      id: "save-load-name",
      class: "field__input",
      maxlength: 60,
      placeholder: "Name this save…",
      "aria-label": "Save name",
      "data-testid": "save-name-input",
    }) as HTMLInputElement,
  );

  const saveBtn = track(
    h(
      "button",
      {
        type: "button",
        class: "btn btn--primary",
        "data-testid": "save-button",
      },
      "Save",
    ) as HTMLButtonElement,
  );

  /** Named so the retry button can say what it is retrying. */
  const saveAction = async (): Promise<void> => {
    const name = nameInput.value;
    const card = await screens.save(name);
    nameInput.value = "";
    // Task 550: a save that landed gets a chime, not just a toast.
    getAudioManager().playUiSound("confirm");
    toast(`Saved "${card.name}". Day ${card.day}.`);
    await renderList();
  };

  saveBtn.addEventListener("click", () => void run(saveAction, "saving"));

  body.append(
    h(
      "div",
      { class: "save-row" },
      options.ironmanActive
        ? h(
            "p",
            { class: "caption", "data-testid": "ironman-save-notice" },
            "Ironman: one autosave. Manual saves are disabled for this run.",
          )
        : [
            h(
              "div",
              { class: "field" },
              h(
                "label",
                { class: "field__label", for: "save-load-name" },
                "Save name",
              ),
              nameInput,
            ),
            saveBtn,
          ],
    ),
    errorBox,
  );

  // -- slot list ------------------------------------------------------------
  const autosaveBox = h("div", { "data-testid": "autosave-section" });
  const listBox = h("ul", {
    class: "save-slots",
    "data-testid": "save-slot-list",
  });
  body.append(
    h("h3", { class: "save-section-title" }, "Autosave"),
    autosaveBox,
    h("h3", { class: "save-section-title" }, "Saved games"),
    listBox,
  );

  function slotRow(card: SlotCard): HTMLElement {
    const actions = h("div", { class: "save-slot__actions" });

    const loadBtn = track(
      h(
        "button",
        {
          type: "button",
          class: "btn btn--quiet",
          "data-testid": `load-${card.id}`,
          "aria-label": `Load ${card.name}`,
        },
        "Load",
      ) as HTMLButtonElement,
    );
    loadBtn.addEventListener("click", () =>
      run(async () => {
        const loaded = await screens.load(card.id);
        // The day comes back from the server, not from the row the player was
        // just reading, so it is quoted from the answer rather than from `card`.
        toast(`Loaded "${loaded.name}". The campaign is now on day ${loaded.day}.`);
        await renderList();
      }, "loading"),
    );

    const exportBtn = track(
      h(
        "button",
        {
          type: "button",
          class: "btn btn--quiet",
          "data-testid": `export-${card.id}`,
          "aria-label": `Export ${card.name} as a file`,
        },
        "Export",
      ) as HTMLButtonElement,
    );
    exportBtn.addEventListener("click", () =>
      run(async () => {
        await screens.exportSave(card.id);
        toast(`Exported "${card.name}".`);
      }, "exporting"),
    );

    actions.append(loadBtn, exportBtn);

    // The autosave never gets a delete button — the manager refuses it,
    // and the UI does not offer what it cannot do.
    if (!card.isAutosave) actions.append(deleteButton(card));

    return h(
      "li",
      {
        class: `save-slot${card.isAutosave ? " save-slot--autosave" : ""}`,
        "data-testid": `save-slot-${card.id}`,
      },
      h(
        "div",
        { class: "save-slot__meta" },
        h("div", { class: "save-slot__name" }, card.name),
        h("div", { class: "save-slot__sub caption" }, card.subtitle),
      ),
      actions,
    );
  }

  /**
   * Two-step delete: first click arms ("Confirm delete"), second click
   * deletes. Arms expire after a few seconds. No window.confirm — the
   * panel is the dialog.
   */
  function deleteButton(card: SlotCard): HTMLButtonElement {
    const btn = track(
      h(
        "button",
        {
          type: "button",
          class: "btn btn--quiet",
          "data-testid": `delete-${card.id}`,
          "aria-label": `Delete save ${card.name}`,
        },
        "Delete",
      ) as HTMLButtonElement,
    );
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const disarm = (): void => {
      armed = false;
      btn.textContent = "Delete";
      btn.classList.remove("btn--danger");
      btn.classList.add("btn--quiet");
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };
    btn.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        btn.textContent = "Confirm delete";
        btn.classList.remove("btn--quiet");
        btn.classList.add("btn--danger");
        timer = setTimeout(disarm, DELETE_ARM_MS);
        return;
      }
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      void run(async () => {
        await screens.remove(card.id);
        toast(`Deleted "${card.name}".`);
        await renderList();
      });
    });
    return btn;
  }

  async function renderList(): Promise<void> {
    clearError();
    try {
      const { named, autosave } = await screens.overview();
      replace(
        autosaveBox,
        autosave
          ? slotRow({ ...autosave, id: AUTOSAVE_ID, isAutosave: true })
          : h("p", { class: "caption" }, "No autosave yet."),
      );
      replace(
        listBox,
        // Ironman runs get the one autosave above and nothing else: no
        // manual slots to save into, none to reload from.
        options.ironmanActive
          ? h("li", {}, h("p", { class: "caption" }, "Named slots are disabled on ironman runs."))
          : named.length > 0
            ? named.map((card) => slotRow(card))
            : h(
                "li",
                {},
                emptyState(
                  "No saves yet",
                  "Give your campaign a name above and press Save.",
                ),
              ),
      );
    } catch (err) {
      showError(err, { label: "reading the save list", run: () => void refresh() });
    }
  }

  async function refresh(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await renderList();
    } finally {
      setBusy(false);
    }
  }

  // -- import row -----------------------------------------------------------
  const fileInput = track(
    h("input", {
      type: "file",
      id: "save-load-import",
      accept: ".mbclone-save.json,.bcsave.json,application/json",
      "aria-label": "Choose a save file to import",
      "data-testid": "import-file",
    }) as HTMLInputElement,
  );
  const importBtn = track(
    h(
      "button",
      { type: "button", class: "btn btn--quiet", "data-testid": "import-button" },
      "Import",
    ) as HTMLButtonElement,
  );
  importBtn.addEventListener("click", () =>
    run(async () => {
      const file = fileInput.files?.[0];
      if (!file) {
        showError(new SaveUiError("Choose a save file first."));
        return;
      }
      const card = await screens.importSave(file);
      fileInput.value = "";
      toast(`Imported "${card.name}". Load it to play on day ${card.day}.`);
      await renderList();
    }, "importing"),
  );
  body.append(
    h(
      "div",
      { class: "save-import-row" },
      h(
        "div",
        { class: "field" },
        h(
          "label",
          { class: "field__label", for: "save-load-import" },
          "Import a save file",
        ),
        fileInput,
      ),
      importBtn,
    ),
  );

  void refresh();
  return { root, refresh, screens };
}
