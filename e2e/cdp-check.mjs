// RE:START のブラウザ確認（Chrome DevTools Protocol を直接使う。依存パッケージなし）
// 通常は `npm run test:e2e`（e2e/run-e2e.sh）から実行する。
// usage: node e2e/cdp-check.mjs <appBase> <debugBase> <shotsDir>
import { mkdirSync, writeFileSync } from "node:fs";

const [BASE, DEBUG, SHOTS] = process.argv.slice(2);
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (id, pass, detail) => {
  results.push({ id, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${id} ${detail}`);
};

const STORAGE_PATCH = `(() => {
  const realGet = Storage.prototype.getItem, realSet = Storage.prototype.setItem;
  Storage.prototype.getItem = function (...a) { if (window.__failGet) throw new DOMException("blocked", "SecurityError"); return realGet.apply(this, a); };
  Storage.prototype.setItem = function (...a) { if (window.__failSet) throw new DOMException("quota", "QuotaExceededError"); return realSet.apply(this, a); };
  window.__raw = () => realGet.call(localStorage, "restart:v1");
  window.__write = (v) => realSet.call(localStorage, "restart:v1", v);
})();`;

const CLOCK_PATCH = `(() => {
  const RealDate = Date; window.__clockOffset = 0; window.__RealDate = RealDate;
  class TestDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(RealDate.now() + window.__clockOffset); else super(...a); }
    static now() { return RealDate.now() + window.__clockOffset; }
  }
  globalThis.Date = TestDate;
})();`;

const OBSERVE_PATCH = `(() => {
  window.__appReadyAt = null; window.__sawSetup = false; window.__sawLoading = false;
  new MutationObserver(() => {
    if (document.getElementById("habit-name")) window.__sawSetup = true;
    if (document.body && document.body.textContent.includes("読み込み中…")) window.__sawLoading = true;
    if (window.__appReadyAt === null && (document.getElementById("setup-heading") || document.getElementById("today-heading"))) window.__appReadyAt = performance.now();
  }).observe(document, { childList: true, subtree: true, characterData: true });
})();`;

class Page {
  static async open(initScripts = []) {
    const info = await (await fetch(`${DEBUG}/json/new?about:blank`, { method: "PUT" })).json();
    const page = new Page(info);
    await page.connect();
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Network.enable");
    for (const source of [STORAGE_PATCH, ...initScripts]) {
      await page.send("Page.addScriptToEvaluateOnNewDocument", { source });
    }
    await page.viewport(390);
    return page;
  }
  constructor(info) {
    this.info = info;
    this.seq = 0;
    this.pending = new Map();
    this.waiters = [];
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.info.webSocketDebuggerUrl);
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { res, rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(msg.error.message));
          else res(msg.result);
        } else if (msg.method) {
          this.waiters = this.waiters.filter((w) => {
            if (w.method !== msg.method) return true;
            w.resolve(msg.params);
            return false;
          });
        }
      };
    });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  once(method, timeout = 20000) {
    return new Promise((resolve, reject) => {
      this.waiters.push({ method, resolve });
      setTimeout(() => reject(new Error(`timeout ${method}`)), timeout);
    });
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  async goto(url = BASE) {
    const loaded = this.once("Page.loadEventFired");
    await this.send("Page.navigate", { url });
    await loaded;
  }
  async waitFor(expression, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        if (await this.eval(expression)) return true;
      } catch {}
      await sleep(50);
    }
    return false;
  }
  waitText(text, timeout) {
    return this.waitFor(`document.body.innerText.includes(${JSON.stringify(text)})`, timeout);
  }
  text() {
    return this.eval("document.body.innerText");
  }
  raw() {
    return this.eval("window.__raw()");
  }
  async viewport(width, height = 800) {
    await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  }
  click(label) {
    return this.eval(`(() => {
      const b = [...document.querySelectorAll("button")].find((b) => b.textContent.includes(${JSON.stringify(label)}));
      if (!b) throw new Error("button not found: " + ${JSON.stringify(label)});
      b.click(); return true; })()`);
  }
  async type(value) {
    await this.eval(`(() => { const el = document.getElementById("habit-name"); el.focus(); el.select(); return true; })()`);
    if (value === "") {
      for (const type of ["keyDown", "keyUp"]) {
        await this.send("Input.dispatchKeyEvent", { type, key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
      }
    } else {
      await this.send("Input.insertText", { text: value });
    }
    await sleep(50);
  }
  async key(key, code, keyCode) {
    const text = key === "Enter" ? "\r" : key === " " ? " " : undefined;
    for (const type of ["keyDown", "keyUp"]) {
      await this.send("Input.dispatchKeyEvent", {
        type,
        key,
        code,
        windowsVirtualKeyCode: keyCode,
        nativeVirtualKeyCode: keyCode,
        ...(type === "keyDown" && text ? { text } : {}),
      });
    }
    await sleep(50);
  }
  async shot(name) {
    const { width, height } = await this.eval(
      "({ width: document.documentElement.clientWidth, height: document.documentElement.scrollHeight })",
    );
    const r = await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.data, "base64"));
  }
  async close() {
    try {
      this.ws.close();
      await fetch(`${DEBUG}/json/close/${this.info.id}`);
    } catch {}
  }
}

// ---- date helpers (same local TZ as Chrome) ----
const pad = (n, w = 2) => String(n).padStart(w, "0");
const key = (d) => `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (days, base = new Date()) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, 12);
const label = (d) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${"日月火水木金土"[d.getDay()]}）`;
const TODAY = key(shift(0));

/** pattern: ✓ − ○ の並び。最終日が todayOffset（既定は今日）。登録日は先頭 */
function dataFromPattern(pattern, { name = "毎日10分読書する", endOffset = 0, extra = {} } = {}) {
  const marks = Array.from(pattern);
  const start = endOffset - (marks.length - 1);
  const records = {};
  marks.forEach((m, i) => {
    if (m === "✓") records[key(shift(start + i))] = "achieved";
    if (m === "−") records[key(shift(start + i))] = "missed";
  });
  return JSON.stringify({
    schemaVersion: 1,
    habit: { name, createdDate: key(shift(start)) },
    records: { ...records, ...extra },
  });
}

async function seed(page, raw) {
  await page.goto();
  await page.eval(raw === null ? "localStorage.clear(), true" : `window.__write(${JSON.stringify(raw)}), true`);
  await page.goto();
}

const ready = (page) => page.waitFor(`!!document.getElementById("today-heading")`);
const setup = (page) => page.waitFor(`!!document.getElementById("setup-heading")`);
const has = (text, ...words) => words.every((w) => text.includes(w));

async function scenario(name, fn) {
  try {
    await fn();
  } catch (error) {
    record(name, false, `error: ${error.message}`);
  }
}

// ---- scenarios ----
await scenario("setup-flow", async () => {
  const p = await Page.open();
  await seed(p, null);
  const isSetup = await setup(p);
  record("T01", isSetup && !(await p.eval(`!!document.getElementById("today-heading")`)), "保存キーなしで初回登録フォームを表示");

  await p.click("この習慣で始める");
  let t = await p.text();
  const empty = t.includes("習慣名を入力してください。");
  await p.type("　 　");
  await p.click("この習慣で始める");
  t = await p.text();
  const spaces = t.includes("習慣名を入力してください。");
  await p.type("あ".repeat(61));
  await p.click("この習慣で始める");
  t = await p.text();
  const tooLong = t.includes("習慣名は60文字以内で入力してください。");
  record("T02", empty && spaces && tooLong && (await p.raw()) === null, `空欄=${empty} 空白のみ=${spaces} 61文字=${tooLong}、保存なし`);

  await p.type("😀".repeat(61));
  t = await p.text();
  const c61 = t.includes("61 / 60文字");
  await p.click("この習慣で始める");
  const refused = (await p.text()).includes("60文字以内") && (await p.raw()) === null;
  await p.type("😀".repeat(60));
  const c60 = (await p.text()).includes("60 / 60文字");
  record("T34", c61 && refused && c60, `😀×61=「61 / 60文字」で登録不可、😀×60=「60 / 60文字」`);

  await p.eval("window.__failSet = true");
  await p.type("毎日10分読書する");
  await p.click("この習慣で始める");
  await p.waitText("記録を保存できませんでした");
  const kept = await p.eval(`document.getElementById("habit-name").value`);
  const stillSetup = await p.eval(`!!document.getElementById("setup-heading")`);
  record("T36", kept === "毎日10分読書する" && stillSetup && (await p.raw()) === null, `保存失敗後も入力値「${kept}」を維持、初回画面のまま`);
  await p.eval("window.__failSet = false");

  await p.click("この習慣で始める");
  const ok = await ready(p);
  t = await p.text();
  const saved = JSON.parse(await p.raw());
  record(
    "T03",
    ok && has(t, "状態：未記録", "0回", "—", "まだ記録がありません", "0日") && saved.habit.createdDate === TODAY,
    `通常画面へ切替、0日/0回/—、登録日=${saved.habit.createdDate}`,
  );

  await p.click("今日の習慣を達成した");
  await p.waitText("状態：達成");
  t = await p.text();
  record("T31", has(t, "状態：達成", "100.0%", "1日", "保存しました。"), "同一タブで保存直後に状態・集計・通知が更新");
  record("T04", has(t, "1日", "0回", "100.0%", "最初の一歩を踏み出しました！"), "初日に達成で 1日/0回/100.0%");

  await p.eval(`(() => { const b = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("今日の習慣を達成した")); for (let i = 0; i < 5; i++) b.click(); return true; })()`);
  await sleep(200);
  const recs = Object.keys(JSON.parse(await p.raw()).records).length;
  t = await p.text();
  record("T13", recs === 1 && has(t, "1日", "0回", "100.0%"), `5回連打後の記録件数=${recs}`);

  await p.click("今日はできなかった");
  await p.waitText("状態：未達成");
  t = await p.text();
  const corrected = has(t, "0日", "0回", "0.0%", "これまでの努力は消えません。");
  await p.click("今日の習慣を達成した");
  await p.waitText("状態：達成");
  record("T12", corrected, "同日に未達成へ訂正すると 0日/0回/0.0% に再計算（画面）");

  await p.goto();
  await ready(p);
  t = await p.text();
  record("T14", has(t, "毎日10分読書する", "状態：達成", "1日", "100.0%"), "再読み込み後に習慣・記録・集計を復元");

  const before = await p.raw();
  await p.eval("window.__failSet = true");
  await p.click("今日はできなかった");
  await p.waitText("記録を保存できませんでした");
  t = await p.text();
  record("T21", has(t, "状態：達成", "100.0%") && (await p.raw()) === before, "setItem 例外でエラー表示、表示と保存データは旧状態のまま");
  await p.eval("window.__failSet = false");
  await p.close();
});

await scenario("sample", async () => {
  const p = await Page.open();
  await seed(p, dataFromPattern("✓✓−✓✓−○"));
  await ready(p);
  let t = await p.text();
  const before = has(t, "4日", "1回", "66.7%", "今日から、また始めよう。");
  await p.click("今日の習慣を達成した");
  await p.waitText("71.4%");
  t = await p.text();
  const after = has(t, "5日", "2回", "71.4%", "再開できました！戻ってきたことも、あなたの実績です。");
  record("T30", before && after, `サンプルと同じ並び（今日=最終日）: 未記録時 4日/1回/66.7%=${before}、達成後 5日/2回/71.4%+再開メッセージ=${after}`);
  await p.close();
});

await scenario("pre-registration", async () => {
  const p = await Page.open();
  await seed(p, dataFromPattern("✓−○"));
  await ready(p);
  const outOfRange = await p.eval(`[...document.querySelectorAll("ol li")].filter((li) => li.textContent.includes("対象外")).length`);
  const t = await p.text();
  record("T23", outOfRange === 4 && has(t, "50.0%"), `7日履歴の対象外=${outOfRange}件、達成率 1/2=50.0%`);
  await p.close();
});

await scenario("future", async () => {
  const p = await Page.open();
  await seed(p, dataFromPattern("✓○", { extra: { [key(shift(1))]: "achieved", [key(shift(5))]: "missed" } }));
  await ready(p);
  let t = await p.text();
  const stats = has(t, "1日", "0回", "100.0%");
  await p.click("今日の習慣を達成した");
  await p.waitText("状態：達成");
  const kept = JSON.parse(await p.raw()).records;
  t = await p.text();
  record("T24", stats && kept[key(shift(1))] === "achieved" && kept[key(shift(5))] === "missed" && has(t, "2日"), "未来の記録は保存後も保持され、集計に含まれない");
  await p.close();
});

await scenario("clock-before-created", async () => {
  const p = await Page.open();
  const raw = JSON.stringify({ schemaVersion: 1, habit: { name: "読書", createdDate: key(shift(2)) }, records: {} });
  await seed(p, raw);
  await ready(p);
  const t = await p.text();
  const disabled = await p.eval(`[...document.querySelectorAll("button")].filter((b) => b.disabled).length`);
  await p.eval(`[...document.querySelectorAll("button")].forEach((b) => b.click()), true`);
  await sleep(100);
  record("T25", t.includes("端末の日付が習慣の登録日より前") && disabled === 2 && (await p.raw()) === raw, `時刻確認の案内あり、無効なボタン=${disabled}、保存データ不変`);
  await p.close();
});

await scenario("corrupt-and-retry", async () => {
  const p = await Page.open();
  await seed(p, "{broken");
  const shown = await p.waitText("保存データが壊れているため");
  const kept = (await p.raw()) === "{broken";
  await seed(p, JSON.stringify({ schemaVersion: 2, habit: { name: "x", createdDate: TODAY }, records: {} }));
  const version = await p.waitText("このアプリでは読み込めない形式");
  await seed(p, JSON.stringify({ schemaVersion: 1, habit: { name: "x", createdDate: "2026-02-30" }, records: {} }));
  const shape = await p.waitText("保存データの内容が正しくない");
  const t = await p.text();
  record("T22", shown && kept && version && shape && t.includes("保存データは消去していません") && !t.includes("この習慣で始める"), "破損/未知バージョン/不正型でエラー表示、データ保持、初回フォームを出さない");

  await p.eval(`window.__write(${JSON.stringify(dataFromPattern("✓○"))}), true`);
  await p.click("もう一度読み込む");
  const restored = await ready(p);
  record("T35", restored, "エラー表示中に保存データを正常化し「もう一度読み込む」で復元（同一タブ・再読み込みなし）");
  await p.close();
});

await scenario("getItem-throws", async () => {
  const seedPage = await Page.open();
  const raw = dataFromPattern("✓○");
  await seed(seedPage, raw);
  await seedPage.close();
  const p = await Page.open(["window.__failGet = true;"]);
  await p.goto();
  const shown = await p.waitText("保存データを読み込めませんでした。");
  const noForm = !(await p.eval(`!!document.getElementById("habit-name")`));
  await p.click("もう一度読み込む");
  const stillFailing = await p.waitText("まだ読み込めませんでした（1回目）", 2000);
  await p.eval("window.__failGet = false");
  const kept = (await p.raw()) === raw;
  await p.click("もう一度読み込む");
  const restored = await ready(p);
  const told = await p.waitText("もう一度読み込みました。", 2000);
  record("T29", shown && noForm && kept, "getItem 例外でエラーと再試行ボタン、初回フォームなし、データ上書きなし");
  record("T35", restored && stillFailing && told, `失敗が続く再試行で回数つきの案内=${stillFailing}、解消後に復元し「もう一度読み込みました。」=${told}`);
  await p.close();
});

await scenario("two-tabs", async () => {
  const a = await Page.open();
  await seed(a, dataFromPattern("✓○"));
  await ready(a);
  const b = await Page.open();
  await b.goto();
  await ready(b);
  await b.click("今日の習慣を達成した");
  const synced = await a.waitText("状態：達成", 5000);

  const external = JSON.parse(await a.raw());
  external.records[TODAY] = "missed";
  const externalRaw = JSON.stringify(external);
  await a.eval(`window.__write(${JSON.stringify(externalRaw)}), true`); // storage イベントなしの変更
  await a.click("今日の習慣を達成した");
  await a.waitText("別のタブで記録が変更されました");
  const t = await a.text();
  record("T32", synced && (await a.raw()) === externalRaw && t.includes("状態：未達成"), `別タブの保存が自動反映=${synced}、検出時は上書きせず最新（未達成）を表示`);
  await a.close();
  await b.close();
});

await scenario("clock", async () => {
  const p = await Page.open([CLOCK_PATCH]);
  await seed(p, dataFromPattern("✓○"));
  await ready(p);
  // 今日の 23:59:57 に合わせる（テスト用の時計。システム時刻は変更しない）
  await p.eval(`(() => { const R = window.__RealDate; const n = new R(); const t = new R(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 0).getTime() - 3000; window.__clockOffset = t - R.now(); return true; })()`);
  const start = Date.now();
  const rolled = await p.waitText(label(shift(1)), 65000);
  const seconds = ((Date.now() - start) / 1000 - 3).toFixed(1);
  const t = await p.text();
  record("T19", rolled && Number(seconds) <= 60 && t.includes("状態：未記録"), `深夜0時の約${seconds}秒後に今日の表示が翌日へ更新（定期チェック）`);

  await p.eval(`window.__clockOffset += 86400000, document.dispatchEvent(new Event("visibilitychange")), true`);
  const onReturn = await p.waitText(label(shift(2)), 1000);
  record("T19", onReturn, "画面復帰（visibilitychange）で即座に翌々日へ更新");

  const before = await p.raw();
  await p.eval(`window.__clockOffset += 86400000, true`);
  await p.click("今日の習慣を達成した");
  const warned = await p.waitText("日付が変わりました", 2000);
  const updated = await p.waitText(label(shift(3)), 2000);
  record("T20", warned && updated && (await p.raw()) === before, "日付変更直後の操作は保存せず、最新日付に更新して再操作を促す");
  await p.close();
});

await scenario("no-flash", async () => {
  const p = await Page.open([OBSERVE_PATCH]);
  await seed(p, dataFromPattern("✓○"));
  await ready(p);
  const r = await p.eval("({ sawSetup: window.__sawSetup, sawLoading: window.__sawLoading })");
  record("T28", !r.sawSetup && r.sawLoading, `保存データありの読み込みで初回フォーム出現=${r.sawSetup}、読み込み中表示=${r.sawLoading}`);
  await p.close();
});

await scenario("responsive", async () => {
  const p = await Page.open();
  const issues = [];
  for (const name of ["a".repeat(60), "毎日10分読書する".repeat(6).slice(0, 60)]) {
    await seed(p, dataFromPattern("✓✓−✓○−○", { name }));
    await ready(p);
    for (const w of [320, 390, 768, 1280]) {
      await p.viewport(w);
      await sleep(150);
      const m = await p.eval(`(() => {
        const vw = document.documentElement.clientWidth;
        const overflowX = document.documentElement.scrollWidth > vw;
        const outside = [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 0.5; }).length;
        const smallButtons = [...document.querySelectorAll("button")].filter((b) => b.getBoundingClientRect().height < 48).length;
        const clipped = [...document.querySelectorAll("ol li, dd, p, h1, h2")].filter((e) => e.scrollWidth > e.clientWidth + 1).length;
        return { vw, overflowX, outside, smallButtons, clipped };
      })()`);
      if (m.overflowX || m.outside || m.smallButtons || m.clipped) issues.push(`${w}px ${JSON.stringify(m)}`);
      if (name.startsWith("a")) await p.shot(`ready-${w}`);
    }
  }
  await seed(p, null);
  await setup(p);
  for (const w of [320, 390]) {
    await p.viewport(w);
    await p.type("a".repeat(60));
    await sleep(100);
    const over = await p.eval("document.documentElement.scrollWidth > document.documentElement.clientWidth");
    if (over) issues.push(`setup ${w}px overflow`);
    await p.shot(`setup-${w}`);
  }
  record("T26", issues.length === 0, issues.length ? issues.join(" / ") : "320/390/768/1280px で横スクロール・はみ出し・48px 未満のボタン・文字のはみ出しなし（長い習慣名2種）");
  await p.close();
});

await scenario("keyboard", async () => {
  const p = await Page.open();
  await seed(p, dataFromPattern("✓○"));
  await ready(p);
  await p.viewport(390);
  const order = [];
  let outlined = true;
  for (let i = 0; i < 3; i++) {
    await p.key("Tab", "Tab", 9);
    const info = await p.eval(`(() => { const e = document.activeElement; return { text: e.textContent.trim(), outline: getComputedStyle(e).outlineStyle, pressed: e.getAttribute("aria-pressed") }; })()`);
    order.push(info.text);
    if (info.text && info.outline === "none") outlined = false;
  }
  await p.eval(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("今日の習慣を達成した")).focus(), true`);
  await p.key("Enter", "Enter", 13);
  const byEnter = await p.waitText("状態：達成", 2000);
  await p.eval(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("今日はできなかった")).focus(), true`);
  await p.key(" ", "Space", 32);
  const bySpace = await p.waitText("状態：未達成", 2000);
  const a11y = await p.eval(`(() => ({
    pressed: [...document.querySelectorAll("button[aria-pressed]")].map((b) => b.getAttribute("aria-pressed")),
    live: !!document.querySelector("[aria-live=polite]"),
    srHistory: [...document.querySelectorAll("ol li .sr-only")].map((s) => s.textContent).slice(-2),
    label: !!document.querySelector("label[for=habit-name]") || true,
  }))()`);
  record(
    "T27",
    outlined && byEnter && bySpace && a11y.live && a11y.pressed.includes("true"),
    `Tab順=${JSON.stringify(order)}、フォーカス枠=${outlined}、Enter=${byEnter}、Space=${bySpace}、aria-pressed=${JSON.stringify(a11y.pressed)}、読み上げ文=${JSON.stringify(a11y.srHistory)}（VoiceOver 実機確認は未実施）`,
  );
  await p.close();
});

await scenario("performance", async () => {
  const runs = { normal: [], throttled: [] };
  for (const mode of ["normal", "throttled", "normal", "throttled", "normal", "throttled"]) {
    const p = await Page.open([OBSERVE_PATCH]);
    await seed(p, null);
    await p.send("Network.setCacheDisabled", { cacheDisabled: true });
    if (mode === "throttled") {
      await p.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
      await p.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    }
    await p.goto();
    await p.waitFor("window.__appReadyAt !== null", 20000);
    const m = await p.eval(`(() => ({
      fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
      ready: window.__appReadyAt,
      load: performance.getEntriesByType("navigation")[0].loadEventEnd,
    }))()`);
    runs[mode].push(m);
    await p.close();
  }
  // 取得できなかった値は 0 にせず「取得できず」と記録する
  const med = (xs) => {
    const values = xs.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
    if (values.length === 0) return "取得できず";
    return Math.round(values[Math.floor(values.length / 2)]);
  };
  const summary = Object.fromEntries(
    Object.entries(runs).map(([k, v]) => [
      k,
      {
        fcp: med(v.map((x) => x.fcp)),
        fcpSamples: `${v.filter((x) => typeof x.fcp === "number").length}/${v.length}`,
        ready: med(v.map((x) => x.ready)),
        load: med(v.map((x) => x.load)),
      },
    ]),
  );
  const within = (x) => typeof x === "number" && x <= 3000;
  const pass = within(summary.normal.ready) && within(summary.throttled.ready);
  record("T33", pass, `中央値(ms、ready=初回画面の描画まで) 通常=${JSON.stringify(summary.normal)} 低速(150ms遅延・1.6Mbps・CPU4倍)=${JSON.stringify(summary.throttled)}`);
});

// README 用の実画面（架空の習慣名と記録のみ。個人情報を含めない）
await scenario("readme-screens", async () => {
  const p = await Page.open();
  await seed(p, dataFromPattern("✓✓−✓✓−○"));
  await ready(p);
  await p.viewport(390);
  await sleep(150);
  await p.shot("readme-mobile");
  await p.viewport(1280);
  await sleep(150);
  await p.shot("readme-desktop");
  await seed(p, null);
  await setup(p);
  await p.viewport(390);
  await sleep(150);
  await p.shot("readme-setup");
  const heading = await p.eval(`(() => { const s = [...document.querySelectorAll("#setup-heading span")]; return s.length === 2 && s[0].getBoundingClientRect().top !== s[1].getBoundingClientRect().top ? "2行（意図どおり）" : s.length === 2 ? "1行" : "想定外"; })()`);
  await p.viewport(320);
  await sleep(150);
  const at320 = await p.eval(`(() => { const s = [...document.querySelectorAll("#setup-heading span")]; const lines = new Set(s.map((e) => Math.round(e.getBoundingClientRect().top))).size; const orphan = s.some((e) => e.getClientRects().length > 1); return { lines, orphan }; })()`);
  record("UI-320見出し", !at320.orphan, `320px の初回見出しは ${at320.lines} 行、語句の途中で改行=${at320.orphan}（390px: ${heading}）`);
  await p.close();
});

// ---- 未実施の記録（ブラウザでは確認していない項目を明示する） ----
const NOT_RUN = [
  ["T15", "ブラウザ未実施（暦日差は Vitest で確認）"],
  ["T16", "ブラウザ未実施（うるう年は Vitest で確認）"],
  ["T17", "ブラウザ未実施（UTC と端末日付の差は Vitest の TZ 別実行で確認）"],
  ["T18", "ブラウザ未実施（DST は Vitest の TZ 別実行で確認）"],
  ["T05", "ブラウザ未実施（Vitest で確認）"],
  ["T06", "ブラウザ未実施（Vitest で確認）"],
  ["T07", "ブラウザ未実施（Vitest で確認）"],
  ["T08", "ブラウザ未実施（Vitest で確認）"],
  ["T09", "ブラウザ未実施（Vitest で確認）"],
  ["T10", "ブラウザ未実施（Vitest で確認）"],
  ["T11", "ブラウザ未実施（Vitest で確認）"],
  ["T27-VoiceOver", "未実施（読み上げソフトでの実機確認）"],
  ["T26-実機", "未実施（スマートフォン実機での操作確認）"],
  ["T33-公開URL", "未実施（公開URLでの実ネットワーク計測。デプロイ未承認のため）"],
];
for (const [id, detail] of NOT_RUN) {
  results.push({ id, pass: null, detail });
  console.log(`NOT_RUN ${id} ${detail}`);
}

const summary = {
  pass: results.filter((r) => r.pass === true).length,
  fail: results.filter((r) => r.pass === false).length,
  notRun: results.filter((r) => r.pass === null).length,
};
writeFileSync(`${SHOTS}/../results.json`, JSON.stringify({ summary, results }, null, 2));
console.log(`\n成功 ${summary.pass} / 失敗 ${summary.fail} / 未実施 ${summary.notRun}`);
process.exit(summary.fail ? 1 : 0);
