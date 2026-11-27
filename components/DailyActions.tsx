import type { TodayStatus } from "@/lib/view-model";
import type { DailyStatus } from "@/types/restart";

type Props = {
  todayStatus: TodayStatus;
  disabled: boolean;
  onRecord: (status: DailyStatus) => void;
};

const base =
  "min-h-12 w-full rounded-xl px-4 font-bold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export function DailyActions({ todayStatus, disabled, onRecord }: Props) {
  return (
    <div className="mt-4 grid gap-3">
      <button
        type="button"
        aria-pressed={todayStatus === "achieved"}
        disabled={disabled}
        onClick={() => onRecord("achieved")}
        className={`${base} bg-accent text-canvas focus-visible:outline-ink`}
      >
        {todayStatus === "achieved" ? "✓ " : ""}今日の習慣を達成した
      </button>
      <button
        type="button"
        aria-pressed={todayStatus === "missed"}
        disabled={disabled}
        onClick={() => onRecord("missed")}
        className={`${base} border border-muted bg-missed text-ink focus-visible:outline-accent`}
      >
        {todayStatus === "missed" ? "✓ " : ""}今日はできなかった
      </button>
    </div>
  );
}
