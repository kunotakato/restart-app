import type { StorageLike } from "@/lib/storage";

/** テスト用の localStorage。例外を起こす設定ができる */
export class MemoryStorage implements StorageLike {
  private items = new Map<string, string>();
  failGet = false;
  failSet = false;
  setCalls = 0;

  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.items.set(key, value);
  }

  getItem(key: string): string | null {
    if (this.failGet) throw new Error("getItem failed");
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.setCalls++;
    if (this.failSet) throw new DOMException("quota", "QuotaExceededError");
    this.items.set(key, value);
  }

  /** 別タブからの書き込みを再現する（例外設定の影響を受けない） */
  externalWrite(key: string, value: string): void {
    this.items.set(key, value);
  }

  peek(key: string): string | null {
    return this.items.get(key) ?? null;
  }
}
