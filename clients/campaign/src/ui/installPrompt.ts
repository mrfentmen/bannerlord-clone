/**
 * In-app PWA install prompt (MASTER_PLAN task 28).
 *
 * The manifest + service worker (pinned by `pwa/__tests__/pwa.test.ts`) make
 * the campaign installable; this module handles the runtime half. When the
 * browser fires `beforeinstallprompt` the default mini-infobar is suppressed
 * and a first-party banner is shown instead, so the prompt arrives in the
 * game's own UI and voice. `prompt()` is called exactly once per banner,
 * because re-prompting the same event throws; the deferred event is consumed
 * on first use either way. Dismissal is persisted so the player is not nagged
 * every session. Browsers that never fire the event (no install support) see
 * nothing and no errors.
 *
 * The DOM event target and storage are injected so tests never touch the real
 * window.
 */
export interface BeforeInstallPromptEventLike extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallPromptOptions {
  /** Defaults to window. Injected for tests. */
  target?: EventTarget;
  /** Defaults to window.localStorage; pass null to disable persistence. */
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
}

export const DISMISSED_KEY = "campaign.installPromptDismissed";

let banner: HTMLElement | null = null;
let deferred: BeforeInstallPromptEventLike | null = null;
let beforePromptHandler: ((e: Event) => void) | null = null;
let installedHandler: (() => void) | null = null;

function readDismissed(storage: Pick<Storage, "getItem" | "setItem"> | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(storage: Pick<Storage, "getItem" | "setItem"> | null): void {
  if (!storage) return;
  try {
    storage.setItem(DISMISSED_KEY, "1");
  } catch {
    /* private mode etc: stay silent */
  }
}

function hideBanner(): void {
  banner?.remove();
  banner = null;
  deferred = null;
}

function showBanner(onInstall: () => void, onDismiss: () => void): void {
  if (banner) return;
  banner = document.createElement("div");
  banner.className = "install-banner";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-label", "Install the campaign as an app");

  const text = document.createElement("span");
  text.textContent = "Install the campaign for fullscreen play, even offline.";
  const install = document.createElement("button");
  install.type = "button";
  install.className = "install-banner__button";
  install.textContent = "Install";
  install.addEventListener("click", onInstall);
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "install-banner__button install-banner__button--quiet";
  dismiss.textContent = "Not now";
  dismiss.setAttribute("aria-label", "Dismiss the install prompt");
  dismiss.addEventListener("click", onDismiss);

  banner.appendChild(text);
  banner.appendChild(install);
  banner.appendChild(dismiss);
  document.body.appendChild(banner);
}

/**
 * Starts listening for the browser's install prompt. Idempotent; calling it
 * twice (e.g. from tests) replaces the previous listeners rather than
 * stacking them.
 */
export function installInstallPrompt(options: InstallPromptOptions = {}): void {
  const target = options.target ?? window;
  const storage = options.storage === undefined ? window.localStorage : options.storage;

  if (beforePromptHandler) target.removeEventListener("beforeinstallprompt", beforePromptHandler);
  if (installedHandler) target.removeEventListener("appinstalled", installedHandler);

  beforePromptHandler = (e: Event) => {
    // On browsers that fire the event but the player already dismissed or
    // installed, stay silent.
    if (readDismissed(storage)) return;
    e.preventDefault();
    deferred = e as BeforeInstallPromptEventLike;
    showBanner(
      () => {
        const d = deferred;
        deferred = null;
        hideBanner();
        // fire-and-forget: the event may only be prompted once; if the player
        // already answered, userChoice just resolves to the stored outcome.
        void d?.prompt();
      },
      () => {
        writeDismissed(storage);
        hideBanner();
      },
    );
  };
  installedHandler = () => {
    writeDismissed(storage);
    hideBanner();
  };

  target.addEventListener("beforeinstallprompt", beforePromptHandler);
  target.addEventListener("appinstalled", installedHandler);
}

/** Test-only: detaches listeners and removes the banner. */
export function resetInstallPromptForTests(): void {
  const target: EventTarget = typeof window !== "undefined" ? window : globalThis;
  if (beforePromptHandler) target.removeEventListener("beforeinstallprompt", beforePromptHandler);
  if (installedHandler) target.removeEventListener("appinstalled", installedHandler);
  beforePromptHandler = null;
  installedHandler = null;
  hideBanner();
}
