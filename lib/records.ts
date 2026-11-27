import { diffDays } from "@/lib/dates";
import type { DailyStatus, DayKey, RestartData } from "@/types/restart";

export const HABIT_NAME_MAX = 60;

/** Unicode コードポイント数（結合絵文字は構成するコードポイントの数で数える） */
export function countCodePoints(value: string): number {
  return Array.from(value).length;
}

export type HabitNameResult =
  | { ok: true; name: string }
  | { ok: false; reason: "empty" | "tooLong" };

/** 前後の空白（全角スペースを含む）を除いた後、1〜60 コードポイントなら有効 */
export function validateHabitName(input: string): HabitNameResult {
  const name = input.trim();
  const length = countCodePoints(name);
  if (length === 0) return { ok: false, reason: "empty" };
  if (length > HABIT_NAME_MAX) return { ok: false, reason: "tooLong" };
  return { ok: true, name };
}

export function createRestartData(name: string, today: DayKey): RestartData {
  return { schemaVersion: 1, habit: { name, createdDate: today }, records: {} };
}

/** 今日のキーを上書きする（同日の訂正・連打でも件数は増えない）。元のデータは変更しない */
export function setTodayRecord(data: RestartData, today: DayKey, status: DailyStatus): RestartData {
  return { ...data, records: { ...data.records, [today]: status } };
}

/** 端末の日付が登録日より前なら記録できない */
export function isClockBeforeCreated(data: RestartData, today: DayKey): boolean {
  return diffDays(data.habit.createdDate, today) < 0;
}
