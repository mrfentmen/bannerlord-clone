/**
 * Bug reporter (MASTER_PLAN task 26).
 *
 * Opens from the error boundary's "Report a bug" action (and anywhere else
 * that has an ErrorReport). The dialog assembles everything a developer needs
 * to reproduce a bug without asking the player follow-up questions:
 *
 *   - the player's own description (the one thing only they can provide)
 *   - a screenshot of the map canvas, when the canvas allows it
 *   - the console tail (last console lines before the failure)
 *   - the full settings snapshot
 *   - the error report itself, plus user agent, URL, and timestamp
 *
 * There is no backend endpoint for reports in this build, so the reporter
 * exports the bundle two ways: copy-to-clipboard as Markdown, and download
 * as a `.md` file. Both are honest about what they do.
 */
import { panel, toast } from "./kit.js";
import { consoleTail } from "./consoleTail.js";
import type { ErrorReport } from "./errorBoundary.js";

export interface BugReporterOptions {
  /** Returns a PNG data URL of the scene, or null when unavailable. */
  screenshot?: () => string | null;
  /** Settings snapshot to attach; defaults to a placeholder the caller replaces. */
  getSettings?: () => unknown;
  /** Build hash for the notifier (task 29); omitted until that lands. */
  buildHash?: string;
  /** Clipboard hook; defaults to navigator.clipboard. Injected for tests. */
  clipboard?: { writeText: (text: string) => Promise<void> };
  /** File-download hook; defaults to an anchor download. Injected for tests. */
  download?: (filename: string, text: string) => void;
}

export interface BugReportBundle {
  description: string;
  report: ErrorReport;
  screenshot: string | null;
  console: { level: string; text: string; at: number }[];
  settings: unknown;
  userAgent: string;
  url: string;
  buildHash?: string;
}

/** Assembles the bundle from its parts. Exported so tests can verify it. */
export function buildBugReportBundle(
  description: string,
  report: ErrorReport,
  options: BugReporterOptions = {},
): BugReportBundle {
  let screenshot: string | null = null;
  try {
    screenshot = options.screenshot?.() ?? null;
  } catch {
    screenshot = null;
  }
  return {
    description,
    report,
    screenshot,
    console: consoleTail(),
    settings: options.getSettings?.() ?? null,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    url: typeof location !== "undefined" ? location.href : "unknown",
    ...(options.buildHash ? { buildHash: options.buildHash } : {}),
  };
}

/** Renders the bundle as Markdown for clipboard/file export. */
export function bugReportMarkdown(bundle: BugReportBundle): string {
  const lines = [
    "# Bug report",
    "",
    `Reported: ${new Date(bundle.report.timestamp).toISOString()}`,
    `URL: ${bundle.url}`,
    ...(bundle.buildHash ? [`Build: ${bundle.buildHash}`] : []),
    `User agent: ${bundle.userAgent}`,
    "",
    "## What the player saw",
    bundle.description.trim() || "(no description given)",
    "",
    "## Error",
    `\`${bundle.report.message}\``,
    ...(bundle.report.source ? [`Source: ${bundle.report.source}`] : []),
    ...(bundle.report.stack ? ["", "```", bundle.report.stack, "```"] : []),
    "",
    "## Screenshot",
    bundle.screenshot ? "(attached as PNG in the downloaded file; see below)" : "Unavailable — the canvas would not release its pixels.",
    "",
    "## Console tail",
    "```",
    ...bundle.console.map((l) => `[${new Date(l.at).toISOString()}] ${l.level}: ${l.text}`),
    "```",
    "",
    "## Settings",
    "```json",
    JSON.stringify(bundle.settings, null, 2) ?? "null",
    "```",
  ];
  return lines.join("\n");
}

function defaultDownload(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Opens the bug reporter dialog for `report`. Returns the dialog root.
 * Only one reporter is open at a time.
 */
export function openBugReporter(report: ErrorReport, options: BugReporterOptions = {}): HTMLElement {
  document.querySelector(".bug-reporter")?.remove();

  const { root, body } = panel({
    title: "Report a bug",
    testId: "bug-reporter",
    onClose: () => root.remove(),
  });
  root.classList.add("bug-reporter");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");

  const intro = document.createElement("p");
  intro.className = "bug-reporter__intro";
  intro.textContent =
    "Describe what happened in your own words. The report automatically includes " +
    "a screenshot, the recent console output, and your settings — nothing else leaves your browser.";
  body.appendChild(intro);

  const label = document.createElement("label");
  label.className = "bug-reporter__label";
  label.textContent = "What were you doing when it broke?";
  const textarea = document.createElement("textarea");
  textarea.className = "bug-reporter__description";
  textarea.rows = 4;
  textarea.placeholder = "e.g. I opened the market panel in Richmond and the screen went black.";
  label.appendChild(textarea);
  body.appendChild(label);

  const previewWrap = document.createElement("div");
  previewWrap.className = "bug-reporter__preview";
  let shot: string | null = null;
  try {
    shot = options.screenshot?.() ?? null;
  } catch {
    shot = null;
  }
  if (shot) {
    const img = document.createElement("img");
    img.className = "bug-reporter__screenshot";
    img.alt = "Screenshot of the game at the time of the report";
    img.src = shot;
    previewWrap.appendChild(img);
  } else {
    const note = document.createElement("p");
    note.className = "bug-reporter__note";
    note.textContent = "Screenshot unavailable — the canvas would not release its pixels.";
    previewWrap.appendChild(note);
  }
  body.appendChild(previewWrap);

  const actions = document.createElement("div");
  actions.className = "bug-reporter__actions";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "btn";
  copyBtn.textContent = "Copy report";
  copyBtn.addEventListener("click", async () => {
    const bundle = buildBugReportBundle(textarea.value, report, { ...options, screenshot: () => shot });
    const markdown = bugReportMarkdown(bundle);
    try {
      const clipboard = options.clipboard ?? navigator.clipboard;
      await clipboard.writeText(markdown);
      toast("Bug report copied to the clipboard.");
    } catch {
      toast("Could not reach the clipboard — use Download instead.");
    }
  });
  actions.appendChild(copyBtn);

  const downloadBtn = document.createElement("button");
  downloadBtn.type = "button";
  downloadBtn.className = "btn";
  downloadBtn.textContent = "Download report";
  downloadBtn.addEventListener("click", () => {
    const bundle = buildBugReportBundle(textarea.value, report, { ...options, screenshot: () => shot });
    const markdown = bugReportMarkdown(bundle);
    // The screenshot travels inside the downloaded file as a data URL so the
    // .md stays a single self-contained artifact.
    const withShot = bundle.screenshot
      ? `${markdown}\n\n## Screenshot data\n\n![screenshot](${bundle.screenshot})\n`
      : markdown;
    const stamp = new Date(bundle.report.timestamp).toISOString().replace(/[:.]/g, "-");
    (options.download ?? defaultDownload)(`bug-report-${stamp}.md`, withShot);
    toast("Bug report downloaded.");
  });
  actions.appendChild(downloadBtn);
  body.appendChild(actions);

  document.body.appendChild(root);
  textarea.focus();
  return root;
}
