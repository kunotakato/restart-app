import type { NoticeKind } from "@/hooks/useRestartApp";
import { NOTICE_MESSAGES } from "@/lib/messages";

/** 保存結果などを読み上げる。領域は常に置いておき、中身だけを変える（aria-live の確実な通知のため） */
export function StatusNotice({ notice }: { notice: NoticeKind | null }) {
  const isError = notice === "saveFailed";
  const text = notice && !isError ? NOTICE_MESSAGES[notice] : "";
  return (
    <>
      <p aria-live="polite" className="mt-3 text-sm text-muted empty:hidden">
        {text}
      </p>
      <p role="alert" className="mt-3 rounded-xl border border-danger p-3 text-sm text-danger empty:hidden">
        {isError ? NOTICE_MESSAGES.saveFailed : ""}
      </p>
    </>
  );
}
