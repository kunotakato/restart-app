import type { MessageKey } from "@/lib/stats";

/** requirements.md 第8節の固定文 */
export const RESTART_MESSAGES: Record<MessageKey, string> = {
  restarted: "再開できました！戻ってきたことも、あなたの実績です。",
  firstStep: "最初の一歩を踏み出しました！",
  progress: "今日も一歩前進しました。",
  effortRemains: "これまでの努力は消えません。",
  startAgain: "今日から、また始めよう。",
  startSmall: "今日の小さな一歩を始めましょう。",
};

export const SETUP_MESSAGE = "小さな一歩から始めましょう。";

export const NOTICE_MESSAGES = {
  saved: "保存しました。",
  saveFailed: "記録を保存できませんでした。もう一度お試しください。",
  dateChanged: "日付が変わりました。今日の日付を確認して、もう一度選んでください。",
  conflict: "別のタブで記録が変更されました。最新の内容を表示しています。もう一度操作してください。",
} as const;

export const CLOCK_ERROR_MESSAGE =
  "端末の日付が習慣の登録日より前になっています。端末の日付と時刻を確認してください。記録は止めています。";

export const NAME_ERROR_MESSAGES = {
  empty: "習慣名を入力してください。",
  tooLong: "習慣名は60文字以内で入力してください。",
} as const;

export const LOAD_ERROR_MESSAGES = {
  readFailed: "保存データを読み込めませんでした。",
  invalidJson: "保存データが壊れているため、読み込めませんでした。",
  invalidShape: "保存データの内容が正しくないため、読み込めませんでした。",
  unsupportedVersion: "このアプリでは読み込めない形式の保存データです。",
} as const;

export const LOAD_ERROR_GUIDANCE =
  "保存データは消去していません。ブラウザの設定で、このサイトのデータやプライベートブラウズの設定を確認してから、もう一度読み込んでください。サイトデータを消去すると、これまでの記録はすべて失われます。";

export const STORAGE_NOTE =
  "記録はこのブラウザの中（localStorage）にだけ保存されます。暗号化やバックアップはされず、ブラウザのデータを消去したり、別の端末やブラウザを使ったりすると引き継げません。共有の端末では使わず、個人情報や機密情報は入力しないでください。";
