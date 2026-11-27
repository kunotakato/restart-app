import { isValidDayKey, diffDays } from "@/lib/dates";
import { validateHabitName } from "@/lib/records";
import type { DailyStatus, DayKey, RestartData } from "@/types/restart";

export const STORAGE_KEY = "restart:v1";

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** getSnapshot が返す値。文字列・null・下の2つの固定値だけなので、比較が常に安定する */
export const READ_ERROR = Symbol("restart:readError");
export const LOADING = Symbol("restart:loading");
export type StorageSnapshot = string | null | typeof READ_ERROR | typeof LOADING;

export type LoadErrorReason = "readFailed" | "invalidJson" | "invalidShape" | "unsupportedVersion";

export type LoadState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; data: RestartData; raw: string }
  | { status: "error"; reason: LoadErrorReason };

export type SaveResult =
  | { ok: true; raw: string }
  | { ok: false; reason: "conflict" | "writeFailed" };

// ---- 純粋な処理（テスト対象） ----

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 保存文字列を検証する。余分な項目は無視し、必要な項目だけで新しいデータを作る（追補Q6） */
export function parseRestartData(
  raw: string,
): { ok: true; data: RestartData } | { ok: false; reason: Exclude<LoadErrorReason, "readFailed"> } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalidJson" };
  }
  if (!isPlainObject(value)) return { ok: false, reason: "invalidShape" };
  if (value.schemaVersion !== 1) {
    return {
      ok: false,
      reason: typeof value.schemaVersion === "number" ? "unsupportedVersion" : "invalidShape",
    };
  }

  const habit = value.habit;
  if (!isPlainObject(habit) || typeof habit.name !== "string") {
    return { ok: false, reason: "invalidShape" };
  }
  const name = validateHabitName(habit.name);
  if (!name.ok || !isValidDayKey(habit.createdDate)) return { ok: false, reason: "invalidShape" };
  const createdDate: DayKey = habit.createdDate;

  if (!isPlainObject(value.records)) return { ok: false, reason: "invalidShape" };
  const records: Record<DayKey, DailyStatus> = {};
  for (const [key, status] of Object.entries(value.records)) {
    if (!isValidDayKey(key) || diffDays(createdDate, key) < 0) {
      return { ok: false, reason: "invalidShape" };
    }
    if (status !== "achieved" && status !== "missed") return { ok: false, reason: "invalidShape" };
    records[key] = status;
  }

  return { ok: true, data: { schemaVersion: 1, habit: { name: name.name, createdDate }, records } };
}

export function interpretSnapshot(snapshot: StorageSnapshot): LoadState {
  if (snapshot === LOADING) return { status: "loading" };
  if (snapshot === READ_ERROR) return { status: "error", reason: "readFailed" };
  if (snapshot === null) return { status: "empty" };
  const parsed = parseRestartData(snapshot);
  if (!parsed.ok) return { status: "error", reason: parsed.reason };
  return { status: "ready", data: parsed.data, raw: snapshot };
}

/** localStorage の取得。ストレージへのアクセス自体や getItem の例外は READ_ERROR */
export function readSnapshot(getStorage: () => StorageLike): StorageSnapshot {
  try {
    return getStorage().getItem(STORAGE_KEY);
  } catch {
    return READ_ERROR;
  }
}

/**
 * 保存直前に読み直し、表示に使った文字列（expectedRaw）と違えば保存しない（別タブ変更の簡易検出）。
 * 成功時だけ ok: true を返す。失敗時は何も書き込まない。
 */
export function saveRestartData(
  getStorage: () => StorageLike,
  data: RestartData,
  expectedRaw: string | null,
): SaveResult {
  let storage: StorageLike;
  let current: string | null;
  try {
    storage = getStorage();
    current = storage.getItem(STORAGE_KEY);
  } catch {
    return { ok: false, reason: "writeFailed" };
  }
  if (current !== expectedRaw) return { ok: false, reason: "conflict" };

  const raw = JSON.stringify(data);
  try {
    storage.setItem(STORAGE_KEY, raw);
  } catch {
    return { ok: false, reason: "writeFailed" };
  }
  return { ok: true, raw };
}

// ---- ブラウザとの接続（useSyncExternalStore 用） ----

export function getBrowserStorage(): StorageLike {
  return window.localStorage;
}

const listeners = new Set<() => void>();

/** 同一タブでは storage イベントが発生しないため、保存成功後・再試行時に明示的に呼ぶ */
export function notifyStorageChanged(): void {
  for (const listener of listeners) listener();
}

export function subscribeStorage(onChange: () => void): () => void {
  listeners.add(onChange);
  // 別タブの保存は storage イベントで受け取る
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onChange();
  };
  const hasWindow = typeof window !== "undefined";
  if (hasWindow) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    if (hasWindow) window.removeEventListener("storage", onStorage);
  };
}

export function getStorageSnapshot(): StorageSnapshot {
  return readSnapshot(getBrowserStorage);
}

export function getServerStorageSnapshot(): StorageSnapshot {
  return LOADING;
}
