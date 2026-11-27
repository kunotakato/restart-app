import { StatusNotice } from "@/components/StatusNotice";
import type { NoticeKind } from "@/hooks/useRestartApp";
import { NAME_ERROR_MESSAGES, SETUP_MESSAGE, SETUP_MESSAGE_PARTS, STORAGE_NOTE } from "@/lib/messages";
import { HABIT_NAME_MAX } from "@/lib/records";

type Props = {
  value: string;
  length: number;
  error: "empty" | "tooLong" | null;
  notice: NoticeKind | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function HabitSetup({ value, length, error, notice, onChange, onSubmit }: Props) {
  const over = length > HABIT_NAME_MAX;
  return (
    <section aria-labelledby="setup-heading" className="mx-auto max-w-xl rounded-2xl bg-card p-4">
      <h2 id="setup-heading" aria-label={SETUP_MESSAGE} className="text-xl font-bold">
        {SETUP_MESSAGE_PARTS.map((part) => (
          <span key={part} aria-hidden="true" className="inline-block">
            {part}
          </span>
        ))}
      </h2>
      <form
        className="mt-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor="habit-name" className="block font-medium">
          続けたい習慣（1つだけ）
        </label>
        <input
          id="habit-name"
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="例：毎日10分読書する"
          autoComplete="off"
          aria-invalid={error !== null}
          aria-describedby="habit-name-count habit-name-error"
          className="mt-2 block min-h-12 w-full rounded-xl border border-muted bg-canvas px-3 text-base text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        <p id="habit-name-count" className={`mt-1 text-sm ${over ? "text-danger" : "text-muted"}`}>
          {length} / {HABIT_NAME_MAX}文字
        </p>
        <p id="habit-name-error" role="alert" className="mt-1 text-sm text-danger empty:hidden">
          {error ? NAME_ERROR_MESSAGES[error] : ""}
        </p>
        <button
          type="submit"
          className="mt-4 min-h-12 w-full rounded-xl bg-accent px-4 font-bold text-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          この習慣で始める
        </button>
      </form>
      <StatusNotice notice={notice} />
      <p className="mt-4 text-sm text-muted">{STORAGE_NOTE}</p>
    </section>
  );
}
