import { LOAD_ERROR_GUIDANCE, LOAD_ERROR_MESSAGES, retryStillFailingMessage } from "@/lib/messages";
import type { LoadErrorReason } from "@/lib/storage";

type Props = {
  reason: LoadErrorReason;
  retryAttempts: number;
  onRetry: () => void;
};

export function LoadError({ reason, retryAttempts, onRetry }: Props) {
  return (
    <section role="alert" className="mx-auto max-w-xl rounded-2xl border border-danger bg-card p-4">
      <h2 className="text-xl font-bold text-danger">{LOAD_ERROR_MESSAGES[reason]}</h2>
      <p className="mt-2 text-sm">{LOAD_ERROR_GUIDANCE}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 min-h-12 w-full rounded-xl border border-muted bg-missed px-4 font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        もう一度読み込む
      </button>
      {/* 読み込みは一瞬で終わるため、再試行の結果を回数つきで知らせる（同じ結果でも押したことが分かる） */}
      <p aria-live="polite" className="mt-3 text-sm text-ink empty:hidden">
        {retryAttempts > 0 ? retryStillFailingMessage(retryAttempts) : ""}
      </p>
    </section>
  );
}
