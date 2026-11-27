/** 厳密な YYYY-MM-DD 形式の暦日キー（端末のローカル暦日） */
export type DayKey = string;

export type DailyStatus = "achieved" | "missed";

export type Habit = {
  name: string;
  createdDate: DayKey;
};

/** localStorage（キー restart:v1）に保存する唯一のデータ。集計値は保存しない */
export type RestartData = {
  schemaVersion: 1;
  habit: Habit;
  records: Record<DayKey, DailyStatus>;
};
