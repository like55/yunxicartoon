#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8080}"
PID_FILE="${PID_FILE:-/tmp/yunxicartoon_app.pid}"
LOG_FILE="${LOG_FILE:-/tmp/yunxicartoon_app.log}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
SERVER_URL="http://127.0.0.1:${PORT}"


cd "$ROOT_DIR"

echo "[restart] project: $ROOT_DIR"
echo "[restart] port: $PORT"
echo "[restart] pid file: $PID_FILE"
echo "[restart] log file: $LOG_FILE"

stop_pid() {
  local pid="$1"
  if [[ -z "$pid" ]]; then
    return 0
  fi
  if kill -0 "$pid" 2>/dev/null; then
    echo "[restart] stopping pid $pid"
    kill "$pid" 2>/dev/null || true
    for _ in {1..20}; do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.2
    done
    if kill -0 "$pid" 2>/dev/null; then
      echo "[restart] force killing pid $pid"
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
}

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  stop_pid "$OLD_PID"
  rm -f "$PID_FILE"
fi

PORT_PIDS="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "$PORT_PIDS" ]]; then
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    stop_pid "$pid"
  done <<< "$PORT_PIDS"
fi

touch "$LOG_FILE"
nohup npm start >> "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"
echo "[restart] started pid $NEW_PID"

READY=0
for _ in {1..40}; do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.5
done

if [[ "$READY" != "1" ]]; then
  echo "[restart] service failed to become ready"
  echo "[restart] last log lines:"
  tail -n 40 "$LOG_FILE" || true
  exit 1
fi

echo "[restart] service is ready: $SERVER_URL"
curl -fsS "$HEALTH_URL"
printf '\n[restart] done\n'
