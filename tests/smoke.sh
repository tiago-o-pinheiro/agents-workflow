#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY=0
KEEP=0
SELECTED=()

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --keep) KEEP=1 ;;
    -*) echo "unknown option: $arg" >&2; exit 2 ;;
    *) SELECTED+=("$arg") ;;
  esac
done

COMBOS=(
  "single-fastify-typebox|none|fastify|typebox|auto|[]"
  "single-hono-typebox|none|hono|typebox|auto|[]"
  "single-express-zod|none|express|zod|auto|[]"
  "single-next-typebox|next|next|typebox|auto|[\"claude-hooks\"]"
  "single-next-zod|next|next|zod|auto|[]"
  "single-vite|vite|none|typebox|auto|[\"i18n\"]"
  "turbo-next-fastify-typebox|next|fastify|typebox|turbo|[\"i18n\",\"ci\",\"git-hooks\"]"
  "turbo-vite-hono-zod|vite|hono|zod|turbo|[]"
  "bun-next-express-typebox|next|express|typebox|bun|[]"
  "bun-vite-fastify-zod|vite|fastify|zod|bun|[\"git-hooks\",\"claude-hooks\"]"
)

if [ -n "${SMOKE_DIR:-}" ]; then
  mkdir -p "$SMOKE_DIR"
else
  SMOKE_DIR="$(mktemp -d)"
fi

SERVER_PID=""
RESULTS=()
FAILED=0

free_ports() {
  local port pids
  for port in 3000 3001; do
    pids="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
    [ -n "$pids" ] && kill $pids 2>/dev/null || true
  done
}

stop_server() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
  fi
  free_ports
  sleep 1
}

cleanup() {
  stop_server
  if [ "$KEEP" -eq 0 ]; then
    rm -rf "$SMOKE_DIR"
  else
    echo "kept: $SMOKE_DIR"
  fi
}
trap cleanup EXIT

record() {
  RESULTS+=("$1|$2|$3")
  if [ "$3" = "FAIL" ]; then FAILED=1; fi
}

wait_for() {
  local url="$1" i
  for i in $(seq 1 20); do
    if curl -sf "$url" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

serve_check() {
  local dir="$1" log="$2" url="$3"
  shift 3
  free_ports
  (cd "$dir" && "$@" >"$log" 2>&1) &
  SERVER_PID=$!
  local ok=0
  wait_for "$url" && ok=1
  [ "$ok" -eq 0 ] && tail -n 20 "$log" >&2 || true
  stop_server
  [ "$ok" -eq 1 ]
}

run_combo() {
  local name="$1" frontend="$2" backend="$3" validation="$4" layout="$5" extras="$6"
  local dir="$SMOKE_DIR/$name"
  local pm="pnpm" scope="@$name" answers
  [ "$layout" = "bun" ] && pm="bun"
  answers="{\"name\":\"smoke-$name\",\"frontend\":\"$frontend\",\"backend\":\"$backend\",\"validation\":\"$validation\",\"layout\":\"$layout\",\"extras\":$extras}"
  scope="@smoke-$name"

  echo "== $name"
  local dry_flag=()
  [ "$DRY" -eq 1 ] && dry_flag=(--dry-run)

  if node "$ROOT/skills/start/scripts/scaffold.mjs" --answers "$answers" --target "$dir" ${dry_flag[@]+"${dry_flag[@]}"}; then
    record "$name" scaffold PASS
  else
    record "$name" scaffold FAIL
    return 0
  fi
  if [ "$DRY" -eq 1 ]; then return 0; fi

  if (cd "$dir" && node scripts/check.mjs --full); then
    record "$name" check PASS
  else
    record "$name" check FAIL
    return 0
  fi

  local log="$SMOKE_DIR/$name.server.log" result="PASS"
  if [ "$frontend" = "next" ] && [ "$backend" = "next" ]; then
    serve_check "$dir" "$log" "http://localhost:3000/api/health" "$pm" exec next start -p 3000 || result="FAIL"
    record "$name" serve "$result"
  elif [ "$backend" != "none" ]; then
    local cmd=()
    if [ "$layout" = "single" ] || [ "$layout" = "auto" ]; then
      cmd=("$pm" run start)
    elif [ "$layout" = "turbo" ]; then
      cmd=(pnpm --filter "$scope/api" start)
    else
      cmd=(bun run --filter "$scope/api" start)
    fi
    serve_check "$dir" "$log" "http://localhost:3001/health" "${cmd[@]}" || result="FAIL"
    record "$name" serve "$result"
  fi
}

for entry in "${COMBOS[@]}"; do
  IFS='|' read -r name frontend backend validation layout extras <<<"$entry"
  if [ ${#SELECTED[@]} -gt 0 ]; then
    match=0
    for s in "${SELECTED[@]}"; do [ "$s" = "$name" ] && match=1; done
    [ "$match" -eq 0 ] && continue
  fi
  run_combo "$name" "$frontend" "$backend" "$validation" "$layout" "$extras"
  stop_server
done

echo
printf '%-34s %-10s %s\n' COMBO STAGE RESULT
for row in ${RESULTS[@]+"${RESULTS[@]}"}; do
  IFS='|' read -r a b c <<<"$row"
  printf '%-34s %-10s %s\n' "$a" "$b" "$c"
done

if [ ${#RESULTS[@]} -eq 0 ]; then echo "no combos matched" >&2; exit 2; fi
exit "$FAILED"
