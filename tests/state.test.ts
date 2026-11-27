import { afterEach, describe, expect, it, vi } from "vitest";
import { performRecord, performRegister } from "@/lib/actions";
import { getTodaySnapshot, subscribeToday, TODAY_CHECK_INTERVAL_MS } from "@/lib/clock";
import { setTodayRecord } from "@/lib/records";
import { computeStats } from "@/lib/stats";
import {
  interpretSnapshot,
  notifyStorageChanged,
  readSnapshot,
  STORAGE_KEY,
  subscribeStorage,
} from "@/lib/storage";
import { buildDashboard } from "@/lib/view-model";
import { fromPattern, TODAY } from "./helpers";
import { MemoryStorage } from "./memory-storage";

function seeded(pattern: string) {
  const data = fromPattern(pattern);
  const raw = JSON.stringify(data);
  return { data, raw, storage: new MemoryStorage({ [STORAGE_KEY]: raw }) };
}

describe("記録の操作", () => {
  it("T31: 保存成功で通知され、読み直すと記録・集計が更新済み", () => {
    const { data, raw, storage } = seeded("✓−○");
    const onChange = vi.fn();
    const unsubscribe = subscribeStorage(onChange);

    const outcome = performRecord({
      data,
      raw,
      displayedToday: TODAY,
      now: TODAY,
      status: "achieved",
      getStorage: () => storage,
    });
    expect(outcome).toEqual({ kind: "saved" });
    notifyStorageChanged(); // フックは saved のときにこれを呼ぶ
    expect(onChange).toHaveBeenCalledTimes(1);

    const state = interpretSnapshot(readSnapshot(() => storage));
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      expect(computeStats(state.data, TODAY)).toEqual({ achievedDays: 2, restartCount: 1, rate: 66.7 });
      expect(buildDashboard(state.data, TODAY).todayStatus).toBe("achieved");
    }
    unsubscribe();
    notifyStorageChanged();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("T20: 日付変更直前の画面から操作したら保存しない", () => {
    const { data, raw, storage } = seeded("✓○");
    const outcome = performRecord({
      data,
      raw,
      displayedToday: TODAY,
      now: "2026-11-27",
      status: "achieved",
      getStorage: () => storage,
    });
    expect(outcome).toEqual({ kind: "dateChanged" });
    expect(storage.setCalls).toBe(0);
    expect(storage.peek(STORAGE_KEY)).toBe(raw);
  });

  it("T21: 保存失敗なら saveFailed で、保存済みデータは変わらない", () => {
    const { data, raw, storage } = seeded("✓○");
    storage.failSet = true;
    const outcome = performRecord({
      data,
      raw,
      displayedToday: TODAY,
      now: TODAY,
      status: "achieved",
      getStorage: () => storage,
    });
    expect(outcome).toEqual({ kind: "saveFailed" });
    expect(storage.peek(STORAGE_KEY)).toBe(raw);
  });

  it("T25: 端末日付が登録日より前なら保存しない", () => {
    const { data, raw, storage } = seeded("✓○");
    const outcome = performRecord({
      data,
      raw,
      displayedToday: "2026-11-20",
      now: "2026-11-20",
      status: "achieved",
      getStorage: () => storage,
    });
    expect(outcome).toEqual({ kind: "clockError" });
    expect(storage.setCalls).toBe(0);
  });

  it("T32: 別タブの変更を検出したら古いデータで上書きしない", () => {
    const { data, raw, storage } = seeded("✓○");
    const otherTab = JSON.stringify(setTodayRecord(data, TODAY, "missed"));
    storage.externalWrite(STORAGE_KEY, otherTab);
    const outcome = performRecord({
      data,
      raw,
      displayedToday: TODAY,
      now: TODAY,
      status: "achieved",
      getStorage: () => storage,
    });
    expect(outcome).toEqual({ kind: "conflict" });
    expect(storage.peek(STORAGE_KEY)).toBe(otherTab);
  });
});

describe("初回登録の操作", () => {
  it("T03: 正常な習慣名は保存され、通常画面のデータになる", () => {
    const storage = new MemoryStorage();
    const outcome = performRegister({
      input: " 毎日10分読書する ",
      displayedToday: TODAY,
      now: TODAY,
      getStorage: () => storage,
    });
    expect(outcome).toEqual({ kind: "saved" });
    const state = interpretSnapshot(readSnapshot(() => storage));
    expect(state.status === "ready" && state.data.habit).toEqual({
      name: "毎日10分読書する",
      createdDate: TODAY,
    });
  });

  it("T02: 不正な習慣名は保存しない", () => {
    const storage = new MemoryStorage();
    expect(
      performRegister({ input: "　", displayedToday: TODAY, now: TODAY, getStorage: () => storage }),
    ).toEqual({ kind: "invalidName", reason: "empty" });
    expect(storage.setCalls).toBe(0);
  });

  it("T36: 保存に失敗しても、入力内容（呼び出し側の値）は変更されず、保存もされない", () => {
    const storage = new MemoryStorage();
    storage.failSet = true;
    const input = "毎日10分読書する";
    const outcome = performRegister({ input, displayedToday: TODAY, now: TODAY, getStorage: () => storage });
    expect(outcome).toEqual({ kind: "saveFailed" });
    expect(input).toBe("毎日10分読書する");
    expect(storage.peek(STORAGE_KEY)).toBeNull();
  });
});

describe("今日の再取得（F-12、T19）", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("定期チェックは60秒以内、focus と visibilitychange でも再取得し、解除後は止まる", () => {
    vi.useFakeTimers();
    const windowTarget = new EventTarget();
    const documentTarget = new EventTarget();
    const onChange = vi.fn();
    const unsubscribe = subscribeToday(onChange, {
      windowTarget,
      documentTarget,
      setInterval: (cb, ms) => setInterval(cb, ms),
      clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
    });

    expect(TODAY_CHECK_INTERVAL_MS).toBeLessThanOrEqual(60_000);
    vi.advanceTimersByTime(60_000);
    expect(onChange).toHaveBeenCalledTimes(2);
    windowTarget.dispatchEvent(new Event("focus"));
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(onChange).toHaveBeenCalledTimes(4);

    unsubscribe();
    vi.advanceTimersByTime(120_000);
    windowTarget.dispatchEvent(new Event("focus"));
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it("T19: テスト用の時計で深夜0時をまたぐと、今日と集計が切り替わる", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 26, 23, 59, 50));
    const data = setTodayRecord(fromPattern("✓○"), TODAY, "achieved");
    expect(getTodaySnapshot()).toBe(TODAY);
    expect(buildDashboard(data, getTodaySnapshot()).todayStatus).toBe("achieved");

    const seen: string[] = [];
    const unsubscribe = subscribeToday(() => seen.push(getTodaySnapshot()), {
      windowTarget: new EventTarget(),
      documentTarget: new EventTarget(),
      setInterval: (cb, ms) => setInterval(cb, ms),
      clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
    });
    vi.advanceTimersByTime(TODAY_CHECK_INTERVAL_MS);
    unsubscribe();
    expect(seen).toEqual(["2026-11-27"]);
    const next = buildDashboard(data, seen[0]);
    expect(next.todayLabel).toBe("2026年11月27日（金）");
    expect(next.todayStatus).toBe("unrecorded");
    expect(next.rateText).toBe("100.0%");
  });
});

describe("画面表示用の値", () => {
  it("7日履歴は記号・文字ラベル・読み上げ文を持つ", () => {
    const cell = buildDashboard(fromPattern("✓−○"), TODAY).history;
    expect(cell[3]).toMatchObject({ symbol: "—", label: "対象外", spoken: "11月23日 対象外" });
    expect(cell[4]).toMatchObject({ symbol: "✓", label: "達成" });
    expect(cell[5]).toMatchObject({ symbol: "−", label: "未達成" });
    expect(cell[6]).toMatchObject({ symbol: "○", label: "未記録", isToday: true });
  });

  it("T25: 端末日付が登録日より前なら clockError", () => {
    expect(buildDashboard(fromPattern("✓"), "2026-11-20").clockError).toBe(true);
  });
});
