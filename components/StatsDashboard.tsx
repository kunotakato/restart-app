import type { DashboardView } from "@/lib/view-model";

const tile = "rounded-xl bg-canvas/40 p-3";

export function StatsDashboard({ view }: { view: DashboardView }) {
  const noRecords = view.rateText === "—";
  return (
    <section aria-labelledby="stats-heading" className="rounded-2xl bg-card p-4">
      <h2 id="stats-heading" className="text-sm font-medium text-muted">
        これまでの記録
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div className={`${tile} col-span-2 flex items-baseline justify-between gap-4`}>
          <dt className="font-medium">再開できた回数</dt>
          <dd className="text-2xl font-bold text-accent">{view.restartCount}回</dd>
        </div>
        <div className={tile}>
          <dt className="text-sm text-muted">累計達成率</dt>
          <dd className="text-xl font-bold">
            {view.rateText}
            {noRecords && <span className="block text-xs font-normal text-muted">（まだ記録がありません）</span>}
          </dd>
        </div>
        <div className={tile}>
          <dt className="text-sm text-muted">累計達成日数</dt>
          <dd className="text-xl font-bold">{view.achievedDays}日</dd>
        </div>
      </dl>
    </section>
  );
}
