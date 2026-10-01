/**
 * MASTER_PLAN task 26: the bug reporter bundles the player's description with
 * a screenshot, the console tail, and the settings snapshot, and exports it
 * via clipboard copy or file download.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bugReportMarkdown,
  buildBugReportBundle,
  openBugReporter,
} from "../bugReporter.js";
import {
  clearConsoleTail,
  consoleTail,
  installConsoleTail,
  uninstallConsoleTail,
} from "../consoleTail.js";

const REPORT = { message: "TypeError: boom", timestamp: 1727740800000 };

describe("console tail (task 26)", () => {
  beforeEach(() => {
    uninstallConsoleTail();
    installConsoleTail(5);
    clearConsoleTail();
  });

  it("captures console lines in order and caps the buffer", () => {
    console.log("one");
    console.warn("two");
    console.error("three");
    console.log("four");
    console.log("five");
    console.log("six");
    const tail = consoleTail();
    expect(tail).toHaveLength(5);
    expect(tail.map((l) => l.text)).toEqual(["two", "three", "four", "five", "six"]);
    expect(tail[1]!.level).toBe("error");
  });

  it("leaves the original console methods working", () => {
    expect(() => console.log("still works")).not.toThrow();
    expect(consoleTail()).toHaveLength(1);
  });
});

describe("bug reporter (task 26)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    uninstallConsoleTail();
    installConsoleTail(50);
    clearConsoleTail();
  });

  it("bundles screenshot, console tail, settings, and the report", () => {
    console.error("map went black");
    const bundle = buildBugReportBundle("the screen went black", REPORT, {
      screenshot: () => "data:image/png;base64,AAA",
      getSettings: () => ({ uiScale: 100 }),
    });
    expect(bundle.description).toBe("the screen went black");
    expect(bundle.screenshot).toBe("data:image/png;base64,AAA");
    expect(bundle.console.map((l) => l.text)).toContain("map went black");
    expect(bundle.settings).toEqual({ uiScale: 100 });
    expect(bundle.report.message).toBe("TypeError: boom");
    expect(bundle.url).toContain("http");
  });

  it("tolerates a screenshot that throws", () => {
    const bundle = buildBugReportBundle("x", REPORT, {
      screenshot: () => {
        throw new Error("tainted");
      },
    });
    expect(bundle.screenshot).toBeNull();
  });

  it("renders the markdown with every section", () => {
    const bundle = buildBugReportBundle("did the thing", REPORT, {
      getSettings: () => ({ highContrast: true }),
      buildHash: "abc123",
    });
    const md = bugReportMarkdown(bundle);
    expect(md).toContain("# Bug report");
    expect(md).toContain("did the thing");
    expect(md).toContain("TypeError: boom");
    expect(md).toContain("## Console tail");
    expect(md).toContain("## Settings");
    expect(md).toContain('"highContrast": true');
    expect(md).toContain("abc123");
  });

  it("opens a dialog with description, screenshot, copy, and download", async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    const download = vi.fn();
    openBugReporter(REPORT, {
      screenshot: () => "data:image/png;base64,AAA",
      getSettings: () => ({}),
      clipboard,
      download,
    });
    const root = document.querySelector(".bug-reporter");
    expect(root).not.toBeNull();
    expect(root?.getAttribute("role")).toBe("dialog");

    const img = root?.querySelector("img.bug-reporter__screenshot") as HTMLImageElement | null;
    expect(img?.src).toBe("data:image/png;base64,AAA");

    const textarea = root?.querySelector("textarea") as HTMLTextAreaElement;
    textarea.value = "it broke when I clicked";

    const [copyBtn, downloadBtn] = [...root!.querySelectorAll(".bug-reporter__actions .btn")];
    copyBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(clipboard.writeText.mock.calls[0]![0]).toContain("it broke when I clicked");

    downloadBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0]![0]).toMatch(/bug-report-.*\.md/);
    expect(download.mock.calls[0]![1]).toContain("data:image/png;base64,AAA");
  });

  it("says plainly when no screenshot is available", () => {
    openBugReporter(REPORT, { screenshot: () => null });
    expect(document.querySelector(".bug-reporter__note")?.textContent).toContain(
      "Screenshot unavailable",
    );
    expect(document.querySelector(".bug-reporter__screenshot")).toBeNull();
  });

  it("falls back to download when the clipboard is unreachable", async () => {
    const clipboard = { writeText: vi.fn().mockRejectedValue(new Error("denied")) };
    openBugReporter(REPORT, { clipboard });
    const [copyBtn] = [...document.querySelectorAll(".bug-reporter__actions .btn")];
    copyBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(clipboard.writeText).toHaveBeenCalled();
    expect(document.querySelector("[data-toast-region]")?.textContent).toContain("Download instead");
  });
});
