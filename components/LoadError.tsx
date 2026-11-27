import { LOAD_ERROR_GUIDANCE, LOAD_ERROR_MESSAGES } from "@/lib/messages";
import type { LoadErrorReason } from "@/lib/storage";

export function LoadError({ reason, onRetry }: { reason: LoadErrorReason; onRetry: () => void }) {
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
    </section>
  );
}
