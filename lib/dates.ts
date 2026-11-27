import type { DayKey } from "@/types/restart";

const MS_PER_DAY = 86_400_000;
const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

type DayParts = { year: number; month: number; day: number };

/**
 * 年月日から UTC 0時のミリ秒を作る。
 * Date.UTC は 0〜99 年を 1900 年代に読み替えるため、setUTCFullYear で年を設定する。
 * 日付の検証と暦日計算は必ずこの関数を通す。
 */
function utcMidnight({ year, month, day }: DayParts): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime();
}

function partsFromUtc(ms: number): DayParts {
  const date = new Date(ms);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function formatParts({ year, month, day }: DayParts): DayKey {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 形式と実在する暦日を厳密に検証する（例：2027-02-29、2026-11-31 は不正） */
export function parseDayKey(key: unknown): DayParts | null {
  if (typeof key !== "string") return null;
  const match = DAY_KEY_PATTERN.exec(key);
  if (!match) return null;
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const roundTrip = partsFromUtc(utcMidnight(parts));
  if (
    roundTrip.year !== parts.year ||
    roundTrip.month !== parts.month ||
    roundTrip.day !== parts.day
  ) {
    return null;
  }
  return parts;
}

export function isValidDayKey(key: unknown): key is DayKey {
  return parseDayKey(key) !== null;
}

/** 暦日の通し番号（1970-01-01 = 0）。時刻を含まないため DST の影響を受けない */
export function dayNumber(key: DayKey): number {
  const parts = parseDayKey(key);
  if (!parts) throw new Error(`Invalid day key: ${key}`);
  return utcMidnight(parts) / MS_PER_DAY;
}

export function dayKeyFromNumber(value: number): DayKey {
  return formatParts(partsFromUtc(value * MS_PER_DAY));
}

/** to - from の暦日差 */
export function diffDays(from: DayKey, to: DayKey): number {
  return dayNumber(to) - dayNumber(from);
}

export function addDays(key: DayKey, amount: number): DayKey {
  return dayKeyFromNumber(dayNumber(key) + amount);
}

/**
 * 端末のローカル暦日のキー。
 * toISOString() は UTC の日付になるため使わない（日本では 0〜9 時に前日になる）。
 */
export function toDayKey(date: Date): DayKey {
  return formatParts({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
}

/** 例：2026年11月26日（木） */
export function formatDisplayDate(key: DayKey): string {
  const parts = parseDayKey(key);
  if (!parts) throw new Error(`Invalid day key: ${key}`);
  const weekday = WEEKDAYS[new Date(utcMidnight(parts)).getUTCDay()];
  return `${parts.year}年${parts.month}月${parts.day}日（${weekday}）`;
}

/** 例：11/26 */
export function formatShortDate(key: DayKey): string {
  const parts = parseDayKey(key);
  if (!parts) throw new Error(`Invalid day key: ${key}`);
  return `${parts.month}/${parts.day}`;
}

/** 例：11月26日（読み上げ用） */
export function formatSpokenDate(key: DayKey): string {
  const parts = parseDayKey(key);
  if (!parts) throw new Error(`Invalid day key: ${key}`);
  return `${parts.month}月${parts.day}日`;
}
