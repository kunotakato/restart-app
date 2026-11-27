# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 現在の状態

MVP（F-01〜F-13）は実装済み。仕様の基準は `requirements.md`（原本・変更しない）と、Plan Mode で承認された `docs/requirements-addendum.md`（Q1〜Q8、T31〜T36 など。原本と異なる点は追補が優先）。テスト結果と未実施項目は `docs/test-report.md`。

## コマンド

```bash
npm run dev          # 開発サーバー（http://localhost:3000）
npm run build        # 本番ビルド
npm run typecheck    # next typegen && tsc --noEmit（typegen なしの tsc は .next/types がなく失敗する）
npm run lint         # ESLint
npm test             # Vitest（tests/**/*.test.ts）
npm run test:tz      # Vitest を TZ=Asia/Tokyo / America/New_York / Pacific/Auckland で実行
npx vitest run tests/stats.test.ts -t "T09"   # 1件だけ実行（テスト名に T 番号を入れている）
npm run test:e2e     # ヘッドレス Chrome でのブラウザ確認（e2e/run-e2e.sh）
```

- `test:e2e` は本番ビルド→ `next start -H 127.0.0.1 -p 3100` →一時プロファイルのヘッドレス Chrome（デバッグポートも 127.0.0.1）で `e2e/cdp-check.mjs` を実行する。結果は `e2e-results/<日時>/`（Git 管理外）。Chrome の場所は `CHROME`、ポートは `APP_PORT` で変更できる。ポート 3100 が使用中なら中止する。
- 日付の切り替わりの確認は、ページ内でテスト用の時計（`Date` の置き換え）を使う。端末のシステム時刻は変更しない。
- 手動確認やブラウザ確認ができなかった項目は「未実施」と記録し、合格扱いにしない。

## 進め方のルール

- `requirements.md` を仕様の基準とする。仕様変更は提案として示し、事前承認を得る。
- 実装前にPlan Modeで設計を提示し、承認を待つ（提示内容は requirements.md 第11節）。
- MVPに認証・DB・AI・複数習慣を追加しない。習慣名の編集・削除、過去日の編集、通知なども対象外（第1節）。
- 有料API・外部UIライブラリ・外部画像/フォントは使わない。習慣データをサーバーや外部APIへ送らない。
- 実装後は型チェック・lint・テスト・ビルドを実行し、実際の結果を報告する。失敗を隠さず、未実施は未実施と記載する（T01〜T30、第9節）。
- 公開・pushなど外部への変更はユーザーの指示に従う。
- 日付処理・集計ロジック・localStorageの保存・復元処理はUIから分離し、lib/配下で管理する。UIコンポーネントに計算ロジックや保存処理を直接記述しない。
- 集計ロジックと日付処理は、独立してテスト可能な純粋関数として設計する。

## 概要

RE:START「継続より、再開する力。」— 1画面・1習慣・1日1記録の習慣アプリ。達成日数と再開回数を可視化する。

Next.js App Router / TypeScript / Tailwind CSS、保存はlocalStorageのみ、Vercelに公開予定。URLは `/` だけで、初回登録と通常利用は同じページの状態切替。

## アーキテクチャ

- `lib/dates.ts`：日付キーと暦日計算。年は `setUTCFullYear` で設定する（`Date.UTC` は 0〜99 年を 1900 年代に読み替えるため）。検証と計算は同じ関数を通す。
- `lib/records.ts`・`lib/stats.ts`：習慣名の検証（コードポイント数）、今日の記録（上書き）、再開回数・達成率・7日履歴・メッセージ選択。「今日」は必ず引数で受け取る。
- `lib/storage.ts`：保存データの検証（`parseRestartData`）と保存（`saveRestartData`）。`StorageLike` を引数で受け取るので、テストでは `tests/memory-storage.ts` の偽ストレージで例外も再現できる。
- `lib/actions.ts`：記録・初回登録の操作。操作直前の今日と表示中の今日を比べ、違えば保存しない。結果は `ActionOutcome` で返す。
- `lib/clock.ts`：今日の購読（30秒ごと・`focus`・`visibilitychange`）。
- `lib/view-model.ts`：画面に出す値をすべて導出する。`lib/messages.ts`：固定文。
- `hooks/useRestartApp.ts`：保存データと今日を `useSyncExternalStore` で購読し、画面の状態（loading / error / setup / ready）と操作を返す。
- `components/`：表示だけ。計算・検証・保存を書かない。

**`useSyncExternalStore` の約束事**
- `getSnapshot` が返すのは、保存文字列・`null`・固定の Symbol（`READ_ERROR`・`LOADING`）だけ。毎回新しいオブジェクトを返すと無限に再描画される。
- サーバー側のスナップショットは `LOADING` / `null`。これで SSR とハイドレーション時は「読み込み中」になり、初回フォームのちらつきとハイドレーションのずれを防いでいる。
- 同じタブでは `storage` イベントが来ないので、保存成功後と再試行時に `notifyStorageChanged()` を呼ぶ。保存失敗時は呼ばない（表示を旧状態のままにするため）。
- 別タブの変更は `saveRestartData` が保存直前に読み直して検出し（`conflict`）、上書きしない。

データの流れ：読み込み → 検証 →（データなし：初回登録 / 正常：通常画面 / 失敗：エラーと再試行）。記録は保存が成功してから画面に反映される。集計値は保存せず、毎回 `records` から導出する。

## 間違えやすい仕様

**保存（第7.1・8節）**
- キー `restart:v1` に単一JSON。未記録はキーの不存在で表す。
- データなしは正常、破損・未知バージョンはエラー。自動初期化・上書き・消去をしない。
- 保存失敗時は旧状態を維持し、成功表示も集計更新もしない。

**日付（第7.2節）**
- 今日は端末のローカル暦日（UTC+9固定ではない）。`getFullYear/getMonth/getDate` から生成し、`toISOString().slice(0,10)` を使わない。
- 加算・差分は年月日から作るUTCベースの暦日番号で計算する（DST対策）。
- 起動・操作直前・focus・visibilitychange・60秒以内の定期チェックで今日を再取得する。操作時に日付が変わっていたら記録せず、再操作を求める。
- 未来の記録は保持するが集計から除外。端末日付が登録日より前なら記録を停止する。

**集計（第7.3・7.4節）**
- 再開回数：達成日を昇順に並べ、直前の達成日との差が2暦日以上なら+1。初回達成は含めず、何日空いても1回。
- 達成率の分母：登録日〜昨日の全暦日（未記録も含む）に、今日の記録がある場合だけ+1。分母0は「—」で、0%と区別する。小数1桁。
- 直近7日：達成✓ / 未達成− / 未記録○ / 登録前—。登録前は分母に含めない。

**メッセージ**：固定文。優先順位は第8節の表に従う。

**UI（第4・6節）**：320px以上で横スクロールなし、スマホ1列・md以上2列、ボタン48px以上、状態を色だけで区別しない、保存結果は `aria-live` で通知。赤はエラー専用。配色は第6節の承認済みデザインA（`app/globals.css` の `@theme`。クラス名は `bg-canvas`・`bg-card`・`text-accent`・`text-ink`・`text-muted`・`bg-missed`・`text-danger`）。
- 7日履歴はスマホと md の2カラムでは1日1行、`lg`（1024px）以上だけ7列。md の2カラムで7列にすると1列が約43pxで「未達成」が収まらない。
- 未達成色 #33413B の上に補助文字 #94A3B8 を置かない（コントラスト約4.2:1で基準未満）。
- 外部フォントは使わない（`next/font/google` を追加しない）。
