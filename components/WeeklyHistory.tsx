import { STORAGE_NOTE } from "@/lib/messages";
import type { HistoryState } from "@/lib/stats";
import { HISTORY_LABELS, HISTORY_SYMBOLS, type HistoryCell } from "@/lib/view-model";

// 未達成色 #33413B の上の文字は主要文字（補助文字では 4.5:1 に届かない）
const CELL_STYLES: Record<HistoryState, string> = {
  achieved: "border-accent text-accent",
  missed: "border-missed bg-missed text-ink",
  unrecorded: "border-dashed border-muted text-ink",
  outOfRange: "border-transparent text-muted",
};

const LEGEND_ORDER: HistoryState[] = ["achieved", "missed", "unrecorded", "outOfRange"];

export function WeeklyHistory({ cells }: { cells: HistoryCell[] }) {
  return (
    <section aria-labelledby="history-heading" className="rounded-2xl bg-card p-4">
      <h2 id="history-heading" className="text-sm font-medium text-muted">
        直近7日間
      </h2>
      {/*
        1日1行で表示し、1024px 以上（1列あたり約61px）だけ7列に並べる。
        320px や md の2カラム（1列あたり約43px）では「未達成」が収まらないため。
      */}
      <ol className="mt-3 grid gap-2 lg:grid-cols-7 lg:gap-1">
        {cells.map((cell) => (
          <li
            key={cell.day}
            className={`flex min-w-0 items-center gap-3 rounded-xl border-2 px-3 py-1 lg:flex-col lg:gap-0 lg:px-1 lg:py-2 ${CELL_STYLES[cell.state]}`}
          >
            <span className="sr-only">
              {cell.spoken}
              {cell.isToday ? "（今日）" : ""}
            </span>
            <span aria-hidden="true" className="w-12 shrink-0 text-sm lg:w-auto lg:text-xs">
              {cell.shortDate}
            </span>
            <span aria-hidden="true" className="w-6 shrink-0 text-center text-xl leading-none font-bold lg:mt-1 lg:w-auto">
              {cell.symbol}
            </span>
            <span aria-hidden="true" className="text-sm lg:mt-1 lg:text-xs">
              {cell.label}
            </span>
            {cell.isToday && (
              <span aria-hidden="true" className="ml-auto text-xs text-muted lg:ml-0">
                今日
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {LEGEND_ORDER.map((state) => (
          <span key={state}>
            {HISTORY_SYMBOLS[state]} {HISTORY_LABELS[state]}
          </span>
        ))}
      </p>
      <p className="mt-3 text-xs text-muted">{STORAGE_NOTE}</p>
    </section>
  );
}
