"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { performRecord, performRegister, type ActionOutcome } from "@/lib/actions";
import { getServerTodaySnapshot, getTodaySnapshot, refreshToday, subscribeToday } from "@/lib/clock";
import { countCodePoints } from "@/lib/records";
import {
  getBrowserStorage,
  getServerStorageSnapshot,
  getStorageSnapshot,
  interpretSnapshot,
  notifyStorageChanged,
  subscribeStorage,
  type LoadErrorReason,
} from "@/lib/storage";
import { buildDashboard, type DashboardView } from "@/lib/view-model";
import type { DailyStatus } from "@/types/restart";

export type NoticeKind = "saved" | "saveFailed" | "dateChanged" | "conflict";

export type RestartAppState =
  | { phase: "loading" }
  | { phase: "error"; reason: LoadErrorReason; retry: () => void }
  | {
      phase: "setup";
      nameInput: string;
      nameLength: number;
      nameError: "empty" | "tooLong" | null;
      notice: NoticeKind | null;
      setNameInput: (value: string) => void;
      register: () => void;
    }
  | {
      phase: "ready";
      view: DashboardView;
      notice: NoticeKind | null;
      record: (status: DailyStatus) => void;
    };

/** 画面の状態をまとめる。計算・検証・保存は lib/ の関数に任せる */
export function useRestartApp(): RestartAppState {
  const snapshot = useSyncExternalStore(subscribeStorage, getStorageSnapshot, getServerStorageSnapshot);
  const today = useSyncExternalStore(subscribeToday, getTodaySnapshot, getServerTodaySnapshot);
  const load = useMemo(() => interpretSnapshot(snapshot), [snapshot]);
  const view = useMemo(
    () => (load.status === "ready" && today !== null ? buildDashboard(load.data, today) : null),
    [load, today],
  );

  const [notice, setNotice] = useState<NoticeKind | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<"empty" | "tooLong" | null>(null);

  function apply(outcome: ActionOutcome) {
    switch (outcome.kind) {
      case "saved":
        setNotice("saved");
        notifyStorageChanged(); // 同一タブには storage イベントが来ないため明示的に通知
        break;
      case "conflict":
        setNotice("conflict");
        notifyStorageChanged(); // 上書きせず、別タブの最新データを表示し直す
        break;
      case "saveFailed":
        setNotice("saveFailed"); // 通知しない＝表示は保存前のまま
        break;
      case "dateChanged":
        setNotice("dateChanged");
        refreshToday();
        break;
      case "invalidName":
        setNameError(outcome.reason);
        break;
      case "clockError":
        break; // 画面上で常に案内している
    }
  }

  if (load.status === "loading" || today === null) return { phase: "loading" };

  if (load.status === "error") {
    return {
      phase: "error",
      reason: load.reason,
      retry: () => {
        notifyStorageChanged(); // getSnapshot を呼び直させ、読み込みを必ずやり直す
        refreshToday();
      },
    };
  }

  if (load.status === "empty") {
    return {
      phase: "setup",
      nameInput,
      nameLength: countCodePoints(nameInput.trim()),
      nameError,
      notice,
      setNameInput: (value) => {
        setNameInput(value);
        setNameError(null);
      },
      register: () => {
        setNotice(null);
        apply(
          performRegister({
            input: nameInput,
            displayedToday: today,
            now: getTodaySnapshot(),
            getStorage: getBrowserStorage,
          }),
        );
      },
    };
  }

  return {
    phase: "ready",
    view: view!,
    notice,
    record: (status) => {
      setNotice(null);
      apply(
        performRecord({
          data: load.data,
          raw: load.raw,
          displayedToday: today,
          now: getTodaySnapshot(),
          status,
          getStorage: getBrowserStorage,
        }),
      );
    },
  };
}
