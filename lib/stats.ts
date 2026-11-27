import { addDays, dayNumber, diffDays } from "@/lib/dates";
import type { DayKey, RestartData } from "@/types/restart";

export type Stats = {
  achievedDays: number;
  restartCount: number;
  /** 分母が 0 のときは null（「—」表示。0% とは区別する） */
  rate: number | null;
};

export type HistoryState = "achieved" | "missed" | "unrecorded" | "outOfRange";

export type MessageKey =
  | "restarted"
  | "firstStep"
  | "progress"
  | "effortRemains"
  | "startAgain"
  | "startSmall";

/** 登録日〜今日の達成日の通し番号（昇順）。未来の記録は除外する */
function achievedDayNumbers(data: RestartData, today: DayKey): number[] {
  const start = dayNumber(data.habit.createdDate);
  const end = dayNumber(today);
  return Object.entries(data.records)
    .filter(([, status]) => status === "achieved")
    .map(([key]) => dayNumber(key))
    .filter((n) => n >= start && n <= end)
    .sort((a, b) => a - b);
}

/** 2番目以降の達成日について、直前の達成日との差が2暦日以上なら +1（初回達成は含めない） */
export function countRestarts(sortedAchieved: readonly number[]): number {
  let count = 0;
  for (let i = 1; i < sortedAchieved.length; i++) {
    if (sortedAchieved[i] - sortedAchieved[i - 1] >= 2) count++;
  }
  return count;
}

export function computeStats(data: RestartData, today: DayKey): Stats {
  const achieved = achievedDayNumbers(data, today);
  const elapsed = Math.max(0, diffDays(data.habit.createdDate, today));
  const todayInRange = diffDays(data.habit.createdDate, today) >= 0;
  const hasTodayRecord = todayInRange && data.records[today] !== undefined;
  const denominator = elapsed + (hasTodayRecord ? 1 : 0);
  return {
    achievedDays: achieved.length,
    restartCount: countRestarts(achieved),
    rate: denominator === 0 ? null : Math.round((achieved.length * 1000) / denominator) / 10,
  };
}

export function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${rate.toFixed(1)}%`;
}

/** 今日を含む7暦日（古い順）。登録前は outOfRange */
export function getWeeklyHistory(
  data: RestartData,
  today: DayKey,
): { day: DayKey; state: HistoryState }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    if (diffDays(data.habit.createdDate, day) < 0) return { day, state: "outOfRange" as const };
    const status = data.records[day];
    return { day, state: status ?? ("unrecorded" as const) };
  });
}

/** 第8節の優先順位（読み込み・エラー・初回登録は画面の状態として別に扱う） */
export function selectMessage(data: RestartData, today: DayKey): MessageKey {
  const todayNumber = dayNumber(today);
  const status = diffDays(data.habit.createdDate, today) >= 0 ? data.records[today] : undefined;
  const earlier = achievedDayNumbers(data, today).filter((n) => n < todayNumber);
  const lastBefore = earlier.length > 0 ? earlier[earlier.length - 1] : null;

  if (status === "achieved") {
    if (lastBefore === null) return "firstStep";
    return todayNumber - lastBefore >= 2 ? "restarted" : "progress";
  }
  if (status === "missed") return "effortRemains";
  return lastBefore !== null && todayNumber - lastBefore >= 2 ? "startAgain" : "startSmall";
}
