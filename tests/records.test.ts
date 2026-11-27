import { describe, expect, it } from "vitest";
import { countCodePoints, isClockBeforeCreated, validateHabitName } from "@/lib/records";
import { fromPattern } from "./helpers";

describe("習慣名の検証（F-01、追補Q1）", () => {
  it.each([
    ["空欄", ""],
    ["半角空白のみ", "   "],
    ["全角空白のみ", "　　"],
    ["改行・タブのみ", "\n\t"],
  ])("T02: %s は登録不可（empty）", (_label, input) => {
    expect(validateHabitName(input)).toEqual({ ok: false, reason: "empty" });
  });

  it("T02: 61文字は登録不可、60文字は登録可", () => {
    expect(validateHabitName("あ".repeat(61))).toEqual({ ok: false, reason: "tooLong" });
    expect(validateHabitName("あ".repeat(60))).toEqual({ ok: true, name: "あ".repeat(60) });
  });

  it("前後の空白を除いて保存し、除いた後の長さで判定する", () => {
    expect(validateHabitName("  毎日10分読書する　")).toEqual({ ok: true, name: "毎日10分読書する" });
    expect(validateHabitName(` ${"a".repeat(60)} `).ok).toBe(true);
  });

  it("T34: 絵文字はコードポイント数で判定する（UTF-16 の長さではない）", () => {
    const sixty = "😀".repeat(60);
    expect(sixty.length).toBe(120);
    expect(countCodePoints(sixty)).toBe(60);
    expect(validateHabitName(sixty).ok).toBe(true);
    expect(validateHabitName("😀".repeat(61))).toEqual({ ok: false, reason: "tooLong" });
  });

  it("T34: 結合絵文字は構成するコードポイントの数で数える", () => {
    expect(countCodePoints("👨‍👩‍👧")).toBe(5);
    expect(validateHabitName("👨‍👩‍👧".repeat(12)).ok).toBe(true); // 60
    expect(validateHabitName(`${"👨‍👩‍👧".repeat(12)}a`).ok).toBe(false); // 61
  });
});

describe("端末日付の異常（T25）", () => {
  it("登録日より前なら記録を止める", () => {
    const data = fromPattern("✓", "2026-11-26");
    expect(isClockBeforeCreated(data, "2026-11-25")).toBe(true);
    expect(isClockBeforeCreated(data, "2026-11-26")).toBe(false);
    expect(isClockBeforeCreated(data, "2026-11-27")).toBe(false);
  });
});
