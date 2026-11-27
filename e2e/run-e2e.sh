#!/usr/bin/env bash
# RE:START ブラウザ確認（ローカル専用。外部への送信・push・デプロイはしない）
#
#   npm run test:e2e
#
# 環境変数：
#   CHROME    Chrome 本体のパス（既定：macOS の Google Chrome）
#   APP_PORT  アプリの待ち受けポート（既定：3100）
#
# 結果は e2e-results/<日時>/ に保存する（Git 管理外）。
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
APP_PORT="${APP_PORT:-3100}"
TMP_ROOT="${TMPDIR:-/tmp}"
TMP_ROOT="${TMP_ROOT%/}"

RUN_NAME="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="$REPO_DIR/e2e-results/$RUN_NAME"
mkdir -p "$RUN_DIR/shots"
PROFILE="$(mktemp -d "$TMP_ROOT/restart-e2e-chrome.XXXXXX")" # 毎回新しい一時プロファイル
SERVER_PID=""
CHROME_PID=""

cleanup() {
  # 起動時に取得した PID だけを終了する
  if [[ -n "$CHROME_PID" ]] && kill -0 "$CHROME_PID" 2>/dev/null; then
    kill "$CHROME_PID"
    wait "$CHROME_PID" 2>/dev/null || true
  fi
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID"
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  # 削除前に、対象がこのスクリプトの作った一時プロファイルであることを検証する
  case "$PROFILE" in
    "$TMP_ROOT"/restart-e2e-chrome.??????)
      if [[ -d "$PROFILE" && ! -L "$PROFILE" ]]; then rm -rf -- "$PROFILE"; fi
      ;;
    *) echo "skip delete: unexpected profile path" >&2 ;;
  esac
}
trap cleanup EXIT

if [[ ! -x "$CHROME" ]]; then
  echo "Chrome not found. Set CHROME to the Chrome binary path." >&2
  exit 2
fi
# 既存のプロセスに接続しないよう、ポートが空いていることを確認する
if lsof -nP -iTCP:"$APP_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "port $APP_PORT is already in use" >&2
  exit 2
fi

cd "$REPO_DIR"
npm run build >"$RUN_DIR/build.log" 2>&1

# アプリは 127.0.0.1 のみで待ち受ける。.bin/next を直接起動して、そのプロセスの PID を得る
./node_modules/.bin/next start -H 127.0.0.1 -p "$APP_PORT" >"$RUN_DIR/server.log" 2>&1 &
SERVER_PID=$!

# リモートデバッグは 127.0.0.1 のみ。ポートは自動割り当て（DevToolsActivePort に書かれる）
"$CHROME" --headless=new --remote-debugging-address=127.0.0.1 --remote-debugging-port=0 \
  --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check --disable-extensions \
  about:blank >"$RUN_DIR/chrome.log" 2>&1 &
CHROME_PID=$!

for _ in $(seq 1 120); do
  [[ -s "$PROFILE/DevToolsActivePort" ]] && curl -sf "http://127.0.0.1:$APP_PORT" >/dev/null && break
  sleep 0.5
done
DEBUG_PORT="$(head -n 1 "$PROFILE/DevToolsActivePort")"

# 待ち受けがループバックだけであることを検証する（それ以外なら中止）
for pid in "$CHROME_PID" "$SERVER_PID"; do
  listen="$(lsof -nP -a -p "$pid" -iTCP -sTCP:LISTEN -Fn 2>/dev/null | sed -n 's/^n//p')"
  if [[ -z "$listen" ]] || grep -qvE '^(127\.0\.0\.1|\[::1\]):' <<<"$listen"; then
    echo "pid $pid listens on non-loopback or nothing: $listen" >&2
    exit 3
  fi
  echo "pid $pid listens on: $(tr '\n' ' ' <<<"$listen")" | tee -a "$RUN_DIR/output.log"
done

"$CHROME" --version | tee -a "$RUN_DIR/output.log"
node --version | tee -a "$RUN_DIR/output.log"

set +e
node "$REPO_DIR/e2e/cdp-check.mjs" "http://127.0.0.1:$APP_PORT" "http://127.0.0.1:$DEBUG_PORT" "$RUN_DIR/shots" 2>&1 |
  tee -a "$RUN_DIR/output.log"
status=${PIPESTATUS[0]}
set -e
echo "results: e2e-results/$RUN_NAME/results.json"
echo "cdp-check exit=$status"
exit "$status"
