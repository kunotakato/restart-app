import {
  createRestartData,
  isClockBeforeCreated,
  setTodayRecord,
  validateHabitName,
} from "@/lib/records";
import { saveRestartData, type StorageLike } from "@/lib/storage";
import type { DailyStatus, DayKey, RestartData } from "@/types/restart";

export type ActionOutcome =
  | { kind: "saved" }
  | { kind: "saveFailed" }
  | { kind: "conflict" }
  | { kind: "dateChanged" }
  | { kind: "clockError" }
  | { kind: "invalidName"; reason: "empty" | "tooLong" };

function fromSave(result: ReturnType<typeof saveRestartData>): ActionOutcome {
  if (result.ok) return { kind: "saved" };
  return result.reason === "conflict" ? { kind: "conflict" } : { kind: "saveFailed" };
}

/**
 * 今日の記録。now は操作直前に取り直した今日。
 * 表示中の日付と違えば誤った日に記録しないよう、保存せずに dateChanged を返す。
 */
export function performRecord(params: {
  data: RestartData;
  raw: string;
  displayedToday: DayKey;
  now: DayKey;
  status: DailyStatus;
  getStorage: () => StorageLike;
}): ActionOutcome {
  const { data, raw, displayedToday, now, status, getStorage } = params;
  if (now !== displayedToday) return { kind: "dateChanged" };
  if (isClockBeforeCreated(data, now)) return { kind: "clockError" };
  return fromSave(saveRestartData(getStorage, setTodayRecord(data, now, status), raw));
}

/** 初回登録。入力欄の値は呼び出し側が保持し、ここでは変更しない */
export function performRegister(params: {
  input: string;
  displayedToday: DayKey;
  now: DayKey;
  getStorage: () => StorageLike;
}): ActionOutcome {
  const { input, displayedToday, now, getStorage } = params;
  const name = validateHabitName(input);
  if (!name.ok) return { kind: "invalidName", reason: name.reason };
  if (now !== displayedToday) return { kind: "dateChanged" };
  return fromSave(saveRestartData(getStorage, createRestartData(name.name, now), null));
}
