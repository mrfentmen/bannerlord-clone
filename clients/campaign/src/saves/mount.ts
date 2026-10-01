/**
 * Save/load panel mount.
 *
 * The DOM layer over the SaveScreens UI logic (screens.ts), which itself
 * sits on PAX's SaveManager (../data/saves.ts). The layering is strict:
 *
 *   DOM (this file) -> SaveScreens (view models, validation, errors) ->
 *   SaveManager (IndexedDB storage)
 *
 * This module owns no game state and no storage. It renders the panel,
 * forwards player intent, and shows `SaveUiError.playerMessage` verbatim —
 * never a raw stack or a made-up message.
 *
 * Wiring (see the task report for the exact main.ts snippet):
 * - `currentSnapshot` supplies the live snapshot when the player saves.
 * - `onLoad` applies a loaded snapshot. The client currently has no
 *   provider-level snapshot restore (PAX's data lane), so the reference
 *   wiring reports Load as unsupported rather than faking it.
 */

import "./saves.css";
import { h, replace, clear } from "../ui/dom.js";
import { panel, statusChip, emptyState, toast } from "../ui/kit.js";
import {
  AUTOSAVE_ID,
  SaveManager,
  SaveScreens,
  SaveUiError,
  type SlotCard,
} from "./screens.js";
import type { SimSnapshot } from "../data/types.js";

export interface SaveLoadPanelOptions {
  /** Defaults to a fresh SaveManager (PAX's IndexedDB layer). */
  manager?: SaveManager;
  /** Live game state, read when the player hits Save. */
  currentSnapshot: () => SimSnapshot;
  /** Apply a loaded snapshot to the running game. */
  onLoad: (snapshot: SimSnapshot) => void | Promise<void>;
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
} {
  const screens = new SaveScreens({
    manager: options.manager ?? new SaveManager(),
    currentSnapshot: options.currentSnapshot,
    onLoad: options.onLoad,
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

  function showError(err: unknown): void {
    const message =
      err instanceof SaveUiError
        ? err.playerMessage
        : "Something went wrong. The game itself is untouched.";
    replace(errorBox, statusChip("critical", message));
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

  async function run(op: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true);
    clearError();
    try {
      await op();
    } catch (err) {
      showError(err);
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
  saveBtn.addEventListener("click", () =>
    run(async () => {
      const name = nameInput.value;
      const card = await screens.save(name);
      nameInput.value = "";
      toast(`Saved "${card.name}".`);
      await renderList();
    }),
  );

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
        await screens.load(card.id);
        toast(`Loaded "${card.name}".`);
        await renderList();
      }),
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
      }),
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
      showError(err);
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
      accept: ".bcsave.json,application/json",
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
      toast(`Imported "${card.name}".`);
      await renderList();
    }),
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
  return { root, refresh };
}
