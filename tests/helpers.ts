import { addDays } from "@/lib/dates";
import type { DailyStatus, DayKey, RestartData } from "@/types/restart";

export const TODAY: DayKey = "2026-11-26";

/**
 * 要件書の記法（✓ 達成、− 未達成、○ 未記録）から、最終日を today とするデータを作る。
 * 登録日は先頭の日。
 */
export function fromPattern(pattern: string, today: DayKey = TODAY): RestartData {
  const marks = Array.from(pattern.replace(/\s/g, ""));
  const createdDate = addDays(today, -(marks.length - 1));
  const records: Record<DayKey, DailyStatus> = {};
  marks.forEach((mark, i) => {
    const day = addDays(createdDate, i);
    if (mark === "✓") records[day] = "achieved";
    else if (mark === "−") records[day] = "missed";
    else if (mark !== "○") throw new Error(`Unknown mark: ${mark}`);
  });
  return { schemaVersion: 1, habit: { name: "毎日10分読書する", createdDate }, records };
}

/** requirements.md 第7.1節のサンプル JSON */
export const SAMPLE_JSON = JSON.stringify({
  schemaVersion: 1,
  habit: { name: "毎日10分読書する", createdDate: "2026-11-19" },
  records: {
    "2026-11-19": "achieved",
    "2026-11-20": "achieved",
    "2026-11-21": "missed",
    "2026-11-22": "achieved",
    "2026-11-23": "achieved",
    "2026-11-24": "missed",
  },
});
