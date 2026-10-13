/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  addLeverage,
  leverage,
  leverageBoard,
  LEVERAGE_DECAY,
  spendLeverage,
} from "../leverage.js";

beforeEach(() => localStorage.clear());

describe("blackmail leverage tracker (solo task 66)", () => {
  it("accumulates leverage per target", () => {
    addLeverage("Lord Harrow", 5, 1);
    addLeverage("Lord Harrow", 3, 1);
    expect(leverage("Lord Harrow", 1)).toBe(8);
    expect(leverage("Lady Vex", 1)).toBe(0);
  });

  it("decays with disuse", () => {
    addLeverage("Lord Harrow", 10, 1);
    expect(leverage("Lord Harrow", 3)).toBe(10 - 2 * LEVERAGE_DECAY);
    expect(leverage("Lord Harrow", 100)).toBe(0);
  });

  it("spends leverage when there is enough", () => {
    addLeverage("Lord Harrow", 10, 1);
    expect(spendLeverage("Lord Harrow", 6, 1)).toBe(true);
    expect(leverage("Lord Harrow", 1)).toBe(4);
    expect(spendLeverage("Lord Harrow", 10, 1)).toBe(false);
  });

  it("boards rank targets highest first", () => {
    addLeverage("Harrow", 5, 1);
    addLeverage("Vex", 12, 1);
    const board = leverageBoard(1);
    expect(board[0]!.target).toBe("Vex");
    expect(board).toHaveLength(2);
  });

  it("decayed-to-zero targets leave the board", () => {
    addLeverage("Harrow", 3, 1);
    expect(leverageBoard(100)).toHaveLength(0);
  });

  it("rejects non-positive amounts", () => {
    expect(() => addLeverage("Harrow", 0, 1)).toThrow("positive");
    expect(() => spendLeverage("Harrow", -1, 1)).toThrow("positive");
  });
});
