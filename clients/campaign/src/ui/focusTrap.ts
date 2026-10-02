/**
 * Modal focus trap + Escape stack (Rowan solo task 17).
 *
 * Two pieces:
 *
 * 1. `trapFocus(container)` — keeps Tab/Shift+Tab cycling inside the
 *    container while it is active. Returns a release function.
 *
 * 2. The modal stack — `pushModal({ element, onClose })` registers an open
 *    modal; a single document-level Escape listener closes only the topmost
 *    one. Modals that already handle their own Escape should NOT also push
 *    (double-close is worse than none); the stack is for panels that mount
 *    raw DOM.
 *
 * Adoption: call `pushModal` when a dialog mounts, `popModal` (or the
 * returned release) when it unmounts. Every modal in the client should go
 * through this; the ones wired so far are listed in the tracker.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableIn(container: ParentNode): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of container.querySelectorAll(FOCUSABLE)) {
    if (el instanceof HTMLElement && el.offsetParent !== null) out.push(el);
  }
  return out;
}

/** Trap Tab inside `container`. Returns a function that releases the trap. */
export function trapFocus(container: HTMLElement): () => void {
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key !== "Tab") return;
    const items = focusableIn(container);
    if (items.length === 0) {
      ev.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (ev.shiftKey && (active === first || !container.contains(active))) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && active === last) {
      ev.preventDefault();
      first.focus();
    }
  };
  container.addEventListener("keydown", onKey);
  // Move focus into the dialog when the trap engages.
  const first = focusableIn(container)[0];
  first?.focus();
  return () => container.removeEventListener("keydown", onKey);
}

export interface ModalEntry {
  element: HTMLElement;
  onClose: () => void;
}

const stack: ModalEntry[] = [];
let escapeListenerAttached = false;

function onDocumentKey(ev: KeyboardEvent): void {
  if (ev.key !== "Escape") return;
  // Drop entries whose elements were removed without a release call.
  while (stack.length > 0 && !stack[stack.length - 1]!.element.isConnected) {
    stack.pop();
  }
  const top = stack[stack.length - 1];
  if (!top) return;
  ev.preventDefault();
  ev.stopPropagation();
  top.onClose();
}

function ensureEscapeListener(): void {
  if (escapeListenerAttached) return;
  document.addEventListener("keydown", onDocumentKey, true);
  escapeListenerAttached = true;
}

/**
 * Register an open modal. Escape closes only the topmost entry.
 * Returns a release function that unregisters (idempotent).
 */
export function pushModal(entry: ModalEntry): () => void {
  ensureEscapeListener();
  stack.push(entry);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Current depth of the modal stack (for tests and debugging). */
export function modalDepth(): number {
  return stack.length;
}

/**
 * One-call modal wiring: trap Tab inside `element`, push it on the Escape
 * stack, and return a cleanup function. The panel's close path should call
 * the cleanup; if the host removes the element without calling it, the
 * stack drops the dead entry on the next Escape.
 */
export function modalize(element: HTMLElement, onClose: () => void): () => void {
  const releaseTrap = trapFocus(element);
  const releaseModal = pushModal({ element, onClose });
  return () => {
    releaseTrap();
    releaseModal();
  };
}

/** Clear the stack (tests only — never call from game code). */
export function _resetModalStackForTests(): void {
  stack.length = 0;
}
