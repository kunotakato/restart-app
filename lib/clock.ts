import { toDayKey } from "@/lib/dates";
import type { DayKey } from "@/types/restart";

/** 表示中の定期チェック間隔（要件：60秒以内） */
export const TODAY_CHECK_INTERVAL_MS = 30_000;

export type ClockEnv = {
  windowTarget: EventTarget;
  documentTarget: EventTarget;
  setInterval: (callback: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
};

function browserEnv(): ClockEnv {
  return {
    windowTarget: window,
    documentTarget: document,
    setInterval: (callback, ms) => window.setInterval(callback, ms),
    clearInterval: (id) => window.clearInterval(id as number),
  };
}

const listeners = new Set<() => void>();

/** 操作直前に日付の変化を検出したとき、表示中の今日を即座に更新させる */
export function refreshToday(): void {
  for (const listener of listeners) listener();
}

/** focus・visibilitychange・定期チェックで今日を再取得させる。解除時にイベントとタイマーを外す */
export function subscribeToday(onChange: () => void, env: ClockEnv = browserEnv()): () => void {
  listeners.add(onChange);
  env.windowTarget.addEventListener("focus", onChange);
  env.documentTarget.addEventListener("visibilitychange", onChange);
  const timer = env.setInterval(onChange, TODAY_CHECK_INTERVAL_MS);
  return () => {
    listeners.delete(onChange);
    env.windowTarget.removeEventListener("focus", onChange);
    env.documentTarget.removeEventListener("visibilitychange", onChange);
    env.clearInterval(timer);
  };
}

export function getTodaySnapshot(): DayKey {
  return toDayKey(new Date());
}

/** サーバー側・ハイドレーション時は端末日付にアクセスしない */
export function getServerTodaySnapshot(): DayKey | null {
  return null;
}
