import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { createRestartData, setTodayRecord } from "@/lib/records";
import { computeStats, formatRate, getWeeklyHistory, selectMessage } from "@/lib/stats";
import type { RestartData } from "@/types/restart";
import { fromPattern, SAMPLE_JSON, TODAY } from "./helpers";

function summary(data: RestartData, today = TODAY) {
  const s = computeStats(data, today);
  return `${s.achievedDays}日/${s.restartCount}回/${formatRate(s.rate)}`;
}

describe("集計（第7.3・7.4節、第9節）", () => {
  it("T03: 登録直後は 0日/0回/—", () => {
    expect(summary(createRestartData("読書", TODAY))).toBe("0日/0回/—");
  });

  it("T04: 初日に達成 → 1日/0回/100.0%", () => {
    const data = setTodayRecord(createRestartData("読書", TODAY), TODAY, "achieved");
    expect(summary(data)).toBe("1日/0回/100.0%");
  });

  it.each([
    ["T05", "✓✓✓", "3日/0回/100.0%"],
    ["T06", "✓−✓", "2日/1回/66.7%"],
    ["T07", "✓○○✓", "2日/1回/50.0%"],
    ["T08", "−○✓", "1日/0回/33.3%"],
    ["T09", "✓✓−✓−○✓", "4日/2回/57.1%"],
    ["T10", "✓−○", "1日/0回/50.0%"],
    ["T11", "−−", "0日/0回/0.0%"],
  ])("%s: %s → %s", (_id, pattern, expected) => {
    expect(summary(fromPattern(pattern))).toBe(expected);
  });

  it("T11: 0.0% は「—」と区別する", () => {
    expect(computeStats(fromPattern("−−"), TODAY).rate).toBe(0);
  });

  it("T12: ✓−✓ の今日を未達成に訂正 → 1日/0回/33.3%", () => {
    const corrected = setTodayRecord(fromPattern("✓−✓"), TODAY, "missed");
    expect(summary(corrected)).toBe("1日/0回/33.3%");
  });

  it("T13: 同日に達成を何度押しても1日分のみ、再開も重複しない", () => {
    let data = fromPattern("✓−○");
    for (let i = 0; i < 5; i++) data = setTodayRecord(data, TODAY, "achieved");
    expect(Object.keys(data.records)).toHaveLength(3);
    expect(summary(data)).toBe("2日/1回/66.7%");
  });

  it("setTodayRecord は元のデータを変更しない", () => {
    const original = fromPattern("✓○");
    const before = JSON.stringify(original);
    setTodayRecord(original, TODAY, "achieved");
    expect(JSON.stringify(original)).toBe(before);
  });

  it("再開は何日休んでも1回、初回達成は数えない", () => {
    expect(summary(fromPattern("✓○○○✓"))).toBe("2日/1回/40.0%");
    expect(computeStats(fromPattern("○○✓"), TODAY).restartCount).toBe(0);
  });

  it("T23: 登録前の日は分母に含めない", () => {
    // 登録が今日-2日。7日履歴の4日分は登録前
    expect(summary(fromPattern("✓○✓"))).toBe("2日/1回/66.7%");
  });

  it("T24: 未来の記録は保持するが集計には含めない", () => {
    const data = fromPattern("✓○");
    data.records[addDays(TODAY, 1)] = "achieved";
    data.records[addDays(TODAY, 3)] = "achieved";
    expect(summary(data)).toBe("1日/0回/100.0%");
    expect(getWeeklyHistory(data, TODAY).map((h) => h.day)).not.toContain(addDays(TODAY, 1));
    expect(selectMessage(data, TODAY)).toBe("startSmall");
  });

  it("T25: 端末日付が登録日より前なら集計は 0日/0回/—", () => {
    const data = fromPattern("✓", "2026-11-26");
    expect(summary(data, "2026-11-20")).toBe("0日/0回/—");
    expect(getWeeklyHistory(data, "2026-11-20").every((h) => h.state === "outOfRange")).toBe(true);
  });

  it("T30: サンプルJSON（今日=11/25）未記録 4日/1回/66.7%、達成後 5日/2回/71.4%", () => {
    const today = "2026-11-25";
    const data = JSON.parse(SAMPLE_JSON) as RestartData;
    expect(summary(data, today)).toBe("4日/1回/66.7%");
    expect(selectMessage(data, today)).toBe("startAgain");
    const achieved = setTodayRecord(data, today, "achieved");
    expect(summary(achieved, today)).toBe("5日/2回/71.4%");
    expect(selectMessage(achieved, today)).toBe("restarted");
  });
});

describe("7日履歴（F-09）", () => {
  it("今日を含む7暦日を古い順に、達成・未達成・未記録・登録前で区別する", () => {
    const data = fromPattern("✓−○");
    data.records[TODAY] = "achieved";
    expect(getWeeklyHistory(data, TODAY)).toEqual([
      { day: "2026-11-20", state: "outOfRange" },
      { day: "2026-11-21", state: "outOfRange" },
      { day: "2026-11-22", state: "outOfRange" },
      { day: "2026-11-23", state: "outOfRange" },
      { day: "2026-11-24", state: "achieved" },
      { day: "2026-11-25", state: "missed" },
      { day: "2026-11-26", state: "achieved" },
    ]);
  });

  it("月末をまたぐ7日も暦日で並ぶ", () => {
    const data = fromPattern("○○○○○○○○○○", "2026-12-02");
    expect(getWeeklyHistory(data, "2026-12-02").map((h) => h.day)).toEqual([
      "2026-11-26",
      "2026-11-27",
      "2026-11-28",
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
    ]);
  });
});

describe("メッセージ（第8節、追補Q3〜Q5）", () => {
  it.each([
    ["今日達成・再開条件成立", "✓−✓", "restarted"],
    ["今日達成・初回達成", "−○✓", "firstStep"],
    ["今日達成・その他（昨日も達成）", "✓✓", "progress"],
    ["今日未達成", "✓✓−", "effortRemains"],
    ["今日未記録・最後の達成が一昨日", "✓−○", "startAgain"],
    ["今日未記録・最後の達成が3日前", "✓○○○", "startAgain"],
    ["今日未記録・昨日達成", "✓○", "startSmall"],
    ["今日未記録・達成歴なし", "−○", "startSmall"],
    ["登録直後", "○", "startSmall"],
  ])("%s（%s）→ %s", (_label, pattern, expected) => {
    expect(selectMessage(fromPattern(pattern), TODAY)).toBe(expected);
  });
});
