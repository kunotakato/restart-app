import { CLOCK_ERROR_MESSAGE } from "@/lib/messages";
import type { DashboardView } from "@/lib/view-model";

export function HabitCard({ view }: { view: DashboardView }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="today-heading" className="text-sm font-medium text-muted">
          今日の習慣
        </h2>
        <p className="text-sm text-muted">{view.todayLabel}</p>
      </div>
      <p className="mt-2 text-xl font-bold break-words">{view.habitName}</p>
      <p className="mt-2">
        状態：<span className="font-bold">{view.todayStatusLabel}</span>
      </p>
      {view.clockError && (
        <p role="alert" className="mt-3 rounded-xl border border-danger p-3 text-sm text-danger">
          {CLOCK_ERROR_MESSAGE}
        </p>
      )}
    </div>
  );
}
