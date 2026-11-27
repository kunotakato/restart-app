import { formatDisplayDate, formatShortDate, formatSpokenDate } from "@/lib/dates";
import { RESTART_MESSAGES } from "@/lib/messages";
import { isClockBeforeCreated } from "@/lib/records";
import { computeStats, formatRate, getWeeklyHistory, selectMessage, type HistoryState } from "@/lib/stats";
import type { DayKey, RestartData } from "@/types/restart";

export type TodayStatus = "achieved" | "missed" | "unrecorded";

export const HISTORY_SYMBOLS: Record<HistoryState, string> = {
  achieved: "✓",
  missed: "−",
  unrecorded: "○",
  outOfRange: "—",
};

export const HISTORY_LABELS: Record<HistoryState, string> = {
  achieved: "達成",
  missed: "未達成",
  unrecorded: "未記録",
  outOfRange: "対象外",
};

export type HistoryCell = {
  day: DayKey;
  state: HistoryState;
  shortDate: string;
  symbol: string;
  label: string;
  spoken: string;
  isToday: boolean;
};

export type DashboardView = {
  habitName: string;
  todayLabel: string;
  todayStatus: TodayStatus;
  todayStatusLabel: string;
  clockError: boolean;
  message: string;
  restartCount: number;
  achievedDays: number;
  rateText: string;
  history: HistoryCell[];
};

/** 画面に必要な値をすべて記録から導出する（UI 側では計算しない） */
export function buildDashboard(data: RestartData, today: DayKey): DashboardView {
  const clockError = isClockBeforeCreated(data, today);
  const recorded = clockError ? undefined : data.records[today];
  const todayStatus: TodayStatus = recorded ?? "unrecorded";
  const stats = computeStats(data, today);
  return {
    habitName: data.habit.name,
    todayLabel: formatDisplayDate(today),
    todayStatus,
    todayStatusLabel: HISTORY_LABELS[todayStatus],
    clockError,
    message: RESTART_MESSAGES[selectMessage(data, today)],
    restartCount: stats.restartCount,
    achievedDays: stats.achievedDays,
    rateText: stats.rate === null ? "—" : formatRate(stats.rate),
    history: getWeeklyHistory(data, today).map(({ day, state }) => ({
      day,
      state,
      shortDate: formatShortDate(day),
      symbol: HISTORY_SYMBOLS[state],
      label: HISTORY_LABELS[state],
      spoken: `${formatSpokenDate(day)} ${HISTORY_LABELS[state]}`,
      isToday: day === today,
    })),
  };
}
