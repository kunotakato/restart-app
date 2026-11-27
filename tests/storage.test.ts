import { describe, expect, it } from "vitest";
import { createRestartData, setTodayRecord } from "@/lib/records";
import { computeStats } from "@/lib/stats";
import {
  interpretSnapshot,
  LOADING,
  READ_ERROR,
  readSnapshot,
  saveRestartData,
  STORAGE_KEY,
} from "@/lib/storage";
import { fromPattern, SAMPLE_JSON, TODAY } from "./helpers";
import { MemoryStorage } from "./memory-storage";

function load(storage: MemoryStorage) {
  return interpretSnapshot(readSnapshot(() => storage));
}

describe("読み込み", () => {
  it("T01: 保存キーなしは empty（初回登録フォーム）", () => {
    expect(load(new MemoryStorage())).toEqual({ status: "empty" });
  });

  it("T28: サーバー側・初回描画は loading（初回フォームを出さない）", () => {
    expect(interpretSnapshot(LOADING)).toEqual({ status: "loading" });
  });

  it("サンプルJSONを正常データとして読み込む", () => {
    const state = load(new MemoryStorage({ [STORAGE_KEY]: SAMPLE_JSON }));
    expect(state.status).toBe("ready");
    if (state.status === "ready") expect(state.data.habit.createdDate).toBe("2026-11-19");
  });

  it("T29: getItem の例外は readFailed", () => {
    const storage = new MemoryStorage({ [STORAGE_KEY]: SAMPLE_JSON });
    storage.failGet = true;
    expect(load(storage)).toEqual({ status: "error", reason: "readFailed" });
    expect(storage.setCalls).toBe(0);
  });

  it("T29: localStorage へのアクセス自体が例外でも readFailed", () => {
    const snapshot = readSnapshot(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(snapshot).toBe(READ_ERROR);
    expect(interpretSnapshot(snapshot)).toEqual({ status: "error", reason: "readFailed" });
  });

  it("T24: 未来の記録は検証を通り、保持される", () => {
    const data = fromPattern("✓○");
    data.records["2026-12-25"] = "achieved";
    const state = load(new MemoryStorage({ [STORAGE_KEY]: JSON.stringify(data) }));
    expect(state.status === "ready" && state.data.records["2026-12-25"]).toBe("achieved");
  });

  it("余分な項目は無視する（追補Q6）", () => {
    const raw = JSON.stringify({ ...JSON.parse(SAMPLE_JSON), extra: 1 });
    const state = load(new MemoryStorage({ [STORAGE_KEY]: raw }));
    expect(state.status).toBe("ready");
    if (state.status === "ready") expect(state.data).not.toHaveProperty("extra");
  });
});

describe("T22: 破損・不正型・未知バージョン", () => {
  const base = JSON.parse(SAMPLE_JSON);
  it.each([
    ["JSON破損", "{not json", "invalidJson"],
    ["配列", "[]", "invalidShape"],
    ["null", "null", "invalidShape"],
    ["未知のバージョン", JSON.stringify({ ...base, schemaVersion: 2 }), "unsupportedVersion"],
    ["バージョンなし", JSON.stringify({ ...base, schemaVersion: undefined }), "invalidShape"],
    ["バージョンが文字列", JSON.stringify({ ...base, schemaVersion: "1" }), "invalidShape"],
    ["habitなし", JSON.stringify({ ...base, habit: undefined }), "invalidShape"],
    ["習慣名が空白のみ", JSON.stringify({ ...base, habit: { ...base.habit, name: "  " } }), "invalidShape"],
    ["習慣名が61文字", JSON.stringify({ ...base, habit: { ...base.habit, name: "あ".repeat(61) } }), "invalidShape"],
    ["登録日が実在しない", JSON.stringify({ ...base, habit: { ...base.habit, createdDate: "2026-02-30" } }), "invalidShape"],
    ["recordsが配列", JSON.stringify({ ...base, records: [] }), "invalidShape"],
    ["記録キーが不正", JSON.stringify({ ...base, records: { "2026-11-31": "achieved" } }), "invalidShape"],
    ["登録日より前の記録", JSON.stringify({ ...base, records: { "2026-11-18": "achieved" } }), "invalidShape"],
    ["状態値が不正", JSON.stringify({ ...base, records: { "2026-11-20": "done" } }), "invalidShape"],
  ])("%s → %s、元のデータは残る", (_label, raw, reason) => {
    const storage = new MemoryStorage({ [STORAGE_KEY]: raw });
    expect(load(storage)).toEqual({ status: "error", reason });
    expect(storage.peek(STORAGE_KEY)).toBe(raw);
    expect(storage.setCalls).toBe(0);
  });
});

describe("保存", () => {
  it("T14: 保存→読み込みで習慣・記録・集計が復元される", () => {
    const storage = new MemoryStorage();
    const data = setTodayRecord(fromPattern("✓−○"), TODAY, "achieved");
    const result = saveRestartData(() => storage, data, null);
    expect(result.ok).toBe(true);
    const state = load(storage);
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      expect(state.data).toEqual(data);
      expect(computeStats(state.data, TODAY)).toEqual(computeStats(data, TODAY));
    }
  });

  it("T21: setItem の例外は writeFailed で、保存済みのデータは変わらない", () => {
    const original = JSON.stringify(fromPattern("✓○"));
    const storage = new MemoryStorage({ [STORAGE_KEY]: original });
    storage.failSet = true;
    const next = setTodayRecord(fromPattern("✓○"), TODAY, "achieved");
    expect(saveRestartData(() => storage, next, original)).toEqual({ ok: false, reason: "writeFailed" });
    expect(storage.peek(STORAGE_KEY)).toBe(original);
  });

  it("保存時に localStorage へアクセスできなければ writeFailed", () => {
    const result = saveRestartData(
      () => {
        throw new DOMException("denied", "SecurityError");
      },
      createRestartData("読書", TODAY),
      null,
    );
    expect(result).toEqual({ ok: false, reason: "writeFailed" });
  });

  it("T32: 別タブで変更されていたら保存せず、別タブのデータを残す", () => {
    const shown = JSON.stringify(fromPattern("✓○"));
    const storage = new MemoryStorage({ [STORAGE_KEY]: shown });
    const otherTab = JSON.stringify(setTodayRecord(fromPattern("✓○"), TODAY, "missed"));
    storage.externalWrite(STORAGE_KEY, otherTab);

    const stale = setTodayRecord(fromPattern("✓○"), TODAY, "achieved");
    expect(saveRestartData(() => storage, stale, shown)).toEqual({ ok: false, reason: "conflict" });
    expect(storage.peek(STORAGE_KEY)).toBe(otherTab);
    expect(storage.setCalls).toBe(0);
  });

  it("T32: 初回登録中に別タブで登録されていたら上書きしない", () => {
    const storage = new MemoryStorage();
    const otherTab = JSON.stringify(createRestartData("別タブの習慣", TODAY));
    storage.externalWrite(STORAGE_KEY, otherTab);
    const result = saveRestartData(() => storage, createRestartData("読書", TODAY), null);
    expect(result).toEqual({ ok: false, reason: "conflict" });
    expect(storage.peek(STORAGE_KEY)).toBe(otherTab);
  });

  it("T35: 読み込みエラーの後、データが正常になっていれば再読み込みで復元される", () => {
    const storage = new MemoryStorage({ [STORAGE_KEY]: SAMPLE_JSON });
    storage.failGet = true;
    expect(load(storage).status).toBe("error");
    storage.failGet = false;
    expect(load(storage).status).toBe("ready");

    storage.externalWrite(STORAGE_KEY, "{broken");
    expect(load(storage)).toEqual({ status: "error", reason: "invalidJson" });
    storage.externalWrite(STORAGE_KEY, SAMPLE_JSON);
    expect(load(storage).status).toBe("ready");
  });
});
