#!/usr/bin/env bash
# Serves one edge function in the background and waits until it answers
# through Kong. Logs to /tmp/funcs.log; CI dumps that file on failure.
set -euo pipefail

FUNC="${1:?usage: wait-for-function.sh <function-name>}"
LOG=/tmp/funcs.log

# Captured before the backgrounded serve starts: a concurrent
# `supabase status` hits the telemetry race and can empty API_URL.
# The runtime injects its own SUPABASE_* env; no env file needed.
API_URL="$(supabase status -o json | jq -r '.API_URL')"
nohup supabase functions serve "$FUNC" &>"$LOG" &
SERVE_PID=$!

# A 401 probe cannot tell the old edge runtime from the one
# `functions serve` swaps in, so probing alone raced the swap and
# the e2e step got a 502 (#477). Wait for the new runtime's own
# serving line before probing.
served=0
for _ in {1..60}; do
  if grep -q 'Serving functions on' "$LOG"; then
    served=1
    break
  fi
  if ! kill -0 "$SERVE_PID" 2>/dev/null; then
    echo "supabase functions serve exited before serving" >&2
    cat "$LOG" >&2 || true
    exit 1
  fi
  sleep 1
done
if [[ "$served" -ne 1 ]]; then
  echo "runtime did not log 'Serving functions on' within 60s" >&2
  cat "$LOG" >&2 || true
  exit 1
fi

# 401 through Kong proves the runtime answers; a 5xx means Kong
# does not reach it yet, and accepting one would run the e2e step
# against a stalled runtime. Require a 4xx.
ready=0
STATUS=000
for _ in {1..30}; do
  STATUS=$(curl -sS --max-time 2 -o /dev/null -w '%{http_code}' \
    -X POST -H 'Content-Type: application/json' --data '{}' \
    "$API_URL/functions/v1/$FUNC" || true)
  STATUS=${STATUS:-000}
  if [[ "$STATUS" =~ ^4[0-9][0-9]$ ]]; then
    echo "function ready (HTTP $STATUS)"
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  echo "function did not become ready within 30s (last HTTP $STATUS)" >&2
  cat "$LOG" >&2 || true
  exit 1
fi
