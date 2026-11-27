import { describe, expect, it } from "vitest";
import {
  addDays,
  dayKeyFromNumber,
  dayNumber,
  diffDays,
  formatDisplayDate,
  formatShortDate,
  isValidDayKey,
  toDayKey,
} from "@/lib/dates";

const tz = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

describe("日付キーの厳密な検証", () => {
  it.each([
    "2026-11-26",
    "2028-02-29",
    "2000-02-29",
    "0099-01-01",
    "0000-01-01",
  ])("%s は有効", (key) => {
    expect(isValidDayKey(key)).toBe(true);
  });

  it.each([
    "2027-02-29",
    "2100-02-29",
    "2026-11-31",
    "2026-13-01",
    "2026-00-10",
    "2026-1-01",
    "26-11-01",
    " 2026-11-01",
    "2026-11-01T00:00",
    "",
  ])("%j は無効", (key) => {
    expect(isValidDayKey(key)).toBe(false);
  });

  it.each([null, undefined, 20261126, {}])("文字列以外 %j は無効", (key) => {
    expect(isValidDayKey(key)).toBe(false);
  });
});

describe("暦日の計算", () => {
  it("T15: 月末 11/30→12/1 と年末 12/31→1/1 の差は1", () => {
    expect(diffDays("2026-11-30", "2026-12-01")).toBe(1);
    expect(diffDays("2026-12-31", "2027-01-01")).toBe(1);
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("T16: うるう年 2028/2/28→2/29→3/1 の差はそれぞれ1", () => {
    expect(diffDays("2028-02-28", "2028-02-29")).toBe(1);
    expect(diffDays("2028-02-29", "2028-03-01")).toBe(1);
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("0〜99年でも検証と計算が一致する（Date.UTC の読み替えを受けない）", () => {
    expect(diffDays("0099-12-31", "0100-01-01")).toBe(1);
    expect(addDays("0099-12-31", 1)).toBe("0100-01-01");
    expect(dayKeyFromNumber(dayNumber("0050-06-15"))).toBe("0050-06-15");
    // 期待値は Python の datetime.date で独立に算出
    expect(diffDays("0099-01-01", "1999-01-01")).toBe(693_960);
  });

  it("通し番号は 1970-01-01 を 0 とする整数", () => {
    expect(dayNumber("1970-01-01")).toBe(0);
    expect(dayNumber("1970-01-02")).toBe(1);
    expect(Number.isInteger(dayNumber("2026-11-26"))).toBe(true);
  });

  it("不正なキーは計算に使えない", () => {
    expect(() => dayNumber("2026-02-30")).toThrow();
  });
});

describe(`端末のローカル暦日（TZ=${tz}）`, () => {
  it("ローカルの 0:00 と 23:59 は同じ日", () => {
    expect(toDayKey(new Date(2026, 10, 26, 0, 0, 0))).toBe("2026-11-26");
    expect(toDayKey(new Date(2026, 10, 26, 23, 59, 59))).toBe("2026-11-26");
    expect(toDayKey(new Date(2026, 10, 27, 0, 0, 0))).toBe("2026-11-27");
  });

  it("T17: UTC の日付ではなく端末の暦日を採用する", () => {
    const instant = new Date(Date.UTC(2026, 10, 25, 16, 0, 0)); // UTC 11/25 16:00
    const local = `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, "0")}-${String(instant.getDate()).padStart(2, "0")}`;
    expect(toDayKey(instant)).toBe(local);
  });

  it.runIf(tz === "Asia/Tokyo")("T17: 東京 11/26 1:00（UTC 11/25 16:00）は 2026-11-26", () => {
    const instant = new Date(Date.UTC(2026, 10, 25, 16, 0, 0));
    expect(toDayKey(instant)).toBe("2026-11-26");
    expect(instant.toISOString().slice(0, 10)).toBe("2026-11-25");
  });

  it("T18: DST の切り替え日をまたいでも、連続する暦日の差は1", () => {
    // 2026〜2028年の全日（米国・NZ の夏時間の開始・終了日を含む）を、ローカルの 0:30 で順にたどる
    let previous = toDayKey(new Date(2026, 0, 1, 0, 30));
    for (let i = 2; i <= 365 * 3; i++) {
      const current = toDayKey(new Date(2026, 0, i, 0, 30));
      expect(diffDays(previous, current)).toBe(1);
      previous = current;
    }
  });

  it.runIf(tz === "America/New_York")("T18: ニューヨークの夏時間終了日（23時間でなく25時間）でも差は暦日単位", () => {
    const before = toDayKey(new Date(2026, 9, 31, 23, 30)); // 10/31 23:30 EDT
    const after = toDayKey(new Date(2026, 10, 2, 0, 30)); // 11/2 0:30 EST
    expect(before).toBe("2026-10-31");
    expect(after).toBe("2026-11-02");
    expect(diffDays(before, after)).toBe(2);
    // 24時間のミリ秒加算では 11/1 の 23:30 になり、日付を誤らないことの確認
    expect(toDayKey(new Date(2026, 10, 1, 0, 30))).toBe("2026-11-01");
  });
});

describe("表示用の日付", () => {
  it("2026年11月26日（木）の形式", () => {
    expect(formatDisplayDate("2026-11-26")).toBe("2026年11月26日（木）");
    expect(formatDisplayDate("2027-01-01")).toBe("2027年1月1日（金）");
  });

  it("短い日付は M/D", () => {
    expect(formatShortDate("2026-11-06")).toBe("11/6");
  });
});
