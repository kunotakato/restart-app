"use client";

import { DailyActions } from "@/components/DailyActions";
import { Header } from "@/components/Header";
import { HabitCard } from "@/components/HabitCard";
import { HabitSetup } from "@/components/HabitSetup";
import { LoadError } from "@/components/LoadError";
import { RestartMessage } from "@/components/RestartMessage";
import { StatsDashboard } from "@/components/StatsDashboard";
import { StatusNotice } from "@/components/StatusNotice";
import { WeeklyHistory } from "@/components/WeeklyHistory";
import { useRestartApp } from "@/hooks/useRestartApp";

export function RestartApp() {
  const state = useRestartApp();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <Header />
      <div className="mt-6">
        {state.phase === "loading" && (
          <p role="status" className="rounded-2xl bg-card p-4 text-muted">
            読み込み中…
          </p>
        )}

        {state.phase === "error" && <LoadError reason={state.reason} onRetry={state.retry} />}

        {state.phase === "setup" && (
          <HabitSetup
            value={state.nameInput}
            length={state.nameLength}
            error={state.nameError}
            notice={state.notice}
            onChange={state.setNameInput}
            onSubmit={state.register}
          />
        )}

        {state.phase === "ready" && (
          <div className="grid gap-6 md:grid-cols-2 md:items-start">
            <section aria-labelledby="today-heading" className="min-w-0 rounded-2xl bg-card p-4">
              <HabitCard view={state.view} />
              <DailyActions
                todayStatus={state.view.todayStatus}
                disabled={state.view.clockError}
                onRecord={state.record}
              />
              <StatusNotice notice={state.notice} />
              <RestartMessage message={state.view.message} />
            </section>
            <div className="grid min-w-0 gap-6">
              <StatsDashboard view={state.view} />
              <WeeklyHistory cells={state.view.history} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
