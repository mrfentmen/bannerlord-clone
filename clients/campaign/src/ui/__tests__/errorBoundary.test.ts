/**
 * MASTER_PLAN task 25: the global error boundary turns fatal failures into a
 * recovery overlay with reload and report actions, for both `error` events
 * and unhandled promise rejections.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activeReport,
  dismissFatalError,
  installErrorBoundary,
  resetForTests,
  showFatalError,
} from "../errorBoundary.js";

describe("error boundary (task 25)", () => {
  beforeEach(() => {
    resetForTests();
    document.body.innerHTML = "";
  });

  it("renders a recovery overlay with reload, report, and dismiss", () => {
    const onReport = vi.fn();
    const reload = vi.fn();
    showFatalError(
      { message: "TypeError: boom", timestamp: 0 },
      { onReport, reload },
    );

    const overlay = document.querySelector(".fatal-error");
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute("role")).toBe("alertdialog");
    expect(overlay?.textContent).toContain("Reload the game");
    expect(overlay?.textContent).toContain("Report a bug");

    const buttons = [...document.querySelectorAll(".fatal-error__button")];
    buttons[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(reload).toHaveBeenCalledTimes(1);
    buttons[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onReport).toHaveBeenCalledTimes(1);
    expect(onReport.mock.calls[0]![0].message).toBe("TypeError: boom");
    buttons[2]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".fatal-error")).toBeNull();
  });

  it("shows error details collapsed by default", () => {
    showFatalError({ message: "x", stack: "Error: x\n    at y", timestamp: 0 });
    const details = document.querySelector(".fatal-error__details");
    expect(details).not.toBeNull();
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(details?.textContent).toContain("at y");
  });

  it("replaces rather than stacks a second overlay", () => {
    showFatalError({ message: "first", timestamp: 0 });
    showFatalError({ message: "second", timestamp: 1 });
    expect(document.querySelectorAll(".fatal-error")).toHaveLength(1);
    expect(activeReport()?.message).toBe("second");
  });

  it("installs global handlers for error events and rejections", () => {
    installErrorBoundary();
    window.dispatchEvent(
      new ErrorEvent("error", { error: new Error("kaboom"), filename: "app.js" }),
    );
    expect(document.querySelector(".fatal-error")).not.toBeNull();
    expect(activeReport()?.message).toContain("kaboom");
    expect(activeReport()?.source).toBe("app.js");

    dismissFatalError();
    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: "rejected!",
      }),
    );
    expect(document.querySelector(".fatal-error")).not.toBeNull();
    expect(activeReport()?.message).toBe("rejected!");
  });

  it("ignores a second install", () => {
    installErrorBoundary();
    installErrorBoundary();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("once") }));
    expect(document.querySelectorAll(".fatal-error")).toHaveLength(1);
  });
});
