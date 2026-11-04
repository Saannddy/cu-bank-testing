#!/usr/bin/env bash
#
# Start CU Bank: MongoDB, backend API (:4000) and frontend (:3000), with both
# apps' logs streamed here. Ctrl+C stops everything.
#
# Running it again restarts the stack: a previous ./start.sh (in any terminal)
# or a backend/frontend started by hand from this folder is stopped first.
set -uo pipefail
source "$(cd "$(dirname "$0")" && pwd)/scripts/common.sh"

# Remembers the running ./start.sh for this folder, so a re-run can stop it.
LOCK_FILE="${TMPDIR:-/tmp}/cubank-start-$(printf '%s' "$ROOT" | cksum | cut -d' ' -f1).pid"

BACK_PID= FRONT_PID= MONGO_PID= WATCH_PID= RUN_DIR= MONGO_STARTED=

# PIDs of this folder's backend/frontend, however they were started.
app_pids() {
  ps -A -ww -o pid= -o command= 2>/dev/null | awk -v root="$ROOT" '
    index($0, root "/backend/server.js") ||
    index($0, root "/backend/node_modules/.bin/nodemon") ||
    index($0, root "/backend/node_modules/nodemon/") ||
    index($0, root "/frontend/node_modules/.bin/react-scripts") ||
    index($0, root "/frontend/node_modules/react-scripts/") { print $1 }'
  # Plus anything listening on our ports from inside this folder (e.g. `node server.js`).
  command -v lsof >/dev/null 2>&1 || return 0
  local port pid cwd
  for port in $BACKEND_PORT $FRONTEND_PORT; do
    for pid in $(lsof -nP -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null); do
      cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
      case "$cwd" in "$ROOT" | "$ROOT"/*) echo "$pid" ;; esac
    done
  done
}

stop_previous() {
  local old pids stopped=
  old=$(cat "$LOCK_FILE" 2>/dev/null)
  if [ -n "$old" ] && [ "$old" != $$ ] && ps -p "$old" -o command= 2>/dev/null | grep -q 'start\.sh'; then
    kill_pids 30 "$old"   # its own cleanup stops its apps and MongoDB
    stopped=1
  fi
  pids=$(app_pids | sort -u)
  if [ -n "$pids" ]; then kill_pids 10 $pids; stopped=1; fi
  if [ "$MONGO_MODE" = native ]; then
    pids=$(native_mongo_pids)
    if [ -n "$pids" ]; then kill_pids 20 $pids; stopped=1; fi
  fi
  if [ -n "$stopped" ]; then ok "Stopped the previous run"; else ok "Nothing was running"; fi

  local port who
  for port in $BACKEND_PORT $FRONTEND_PORT; do
    port_open "$port" || continue
    who=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR == 2 { print $1 " (PID " $2 ")" }')
    die "Port $port is used by another program${who:+: $who}. Close it and re-run ./start.sh."
  done
}

read_pid() {
  local i=0
  while [ ! -s "$1" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
  cat "$1" 2>/dev/null
}

start_mongo() {
  case "$MONGO_MODE" in
    external)
      ok "Using the remote MongoDB from config.env"
      ;;
    existing)
      port_open "$MONGO_PORT" ||
        die "No MongoDB is running on 127.0.0.1:$MONGO_PORT. Start it, or re-run ./setup.sh."
      ok "Using MongoDB already running on 127.0.0.1:$MONGO_PORT"
      ;;
    docker)
      docker_ready || start_docker_runtime ||
        die "Docker is not running. Start OrbStack (or Docker Desktop) and re-run ./start.sh."
      local out
      out=$(docker compose -f "$COMPOSE_FILE" up -d --wait mongo 2>&1) ||
        die "MongoDB container failed to start:"$'\n'"$out"
      MONGO_STARTED=1
      ok "MongoDB running in Docker ($MONGO_CONTAINER)"
      ;;
    native)
      local mongod
      mongod=$(cat "$MONGOD_PATH_FILE" 2>/dev/null)
      [ -x "$mongod" ] || die "Portable MongoDB is missing. Run ./setup.sh."
      ! port_open "$MONGO_PORT" ||
        die "Port $MONGO_PORT is already used by another MongoDB. Stop it, or re-run ./setup.sh to use that one."
      mkdir -p "$MONGO_DATA"
      sh -c 'echo $$ > "$0"; exec "$@"' "$RUN_DIR/mongo.pid" "$mongod" \
        --dbpath "$MONGO_DATA" --port "$MONGO_PORT" --bind_ip 127.0.0.1 \
        </dev/null >"$TOOLS/mongod.log" 2>&1 &
      disown
      MONGO_PID=$(read_pid "$RUN_DIR/mongo.pid")
      { wait_for tcp "$MONGO_PORT" 30 && kill -0 "$MONGO_PID" 2>/dev/null; } ||
        die "MongoDB failed to start. See .tools/mongod.log"
      ok "MongoDB $MONGO_VERSION running from .tools/ (log: .tools/mongod.log)"
      ;;
    *)
      die "MongoDB is not set up. Run ./setup.sh first."
      ;;
  esac
}

# launch <log-prefix> <name> <dir> <command...>: run in the background, prefix
# each output line, and record the command's PID in $RUN_DIR/<name>.pid.
launch() {
  local label=$1 name=$2 dir=$3
  shift 3
  sh -c 'echo $$ > "$0"; cd "$1" || exit 1; shift; exec "$@"' "$RUN_DIR/$name.pid" "$dir" "$@" </dev/null 2>&1 |
    awk -v p="$label" '{ print p $0; fflush() }' &
  disown   # we track PIDs ourselves; keeps bash from printing "Terminated" job notices
}

cleanup() {
  trap - INT TERM EXIT
  if [ -n "$WATCH_PID" ]; then
    pkill -P "$WATCH_PID" 2>/dev/null
    kill "$WATCH_PID" 2>/dev/null
  fi
  if [ -n "$BACK_PID$FRONT_PID$MONGO_PID$MONGO_STARTED" ]; then
    step "Stopping CU Bank"
    kill_pids 10 $BACK_PID $FRONT_PID
    [ -n "$BACK_PID$FRONT_PID" ] && ok "Backend and frontend stopped"
    if [ -n "$MONGO_PID" ]; then
      kill_pids 20 "$MONGO_PID"
      ok "MongoDB stopped"
    elif [ -n "$MONGO_STARTED" ]; then
      docker compose -f "$COMPOSE_FILE" stop mongo >/dev/null 2>&1
      ok "MongoDB stopped"
    fi
  fi
  [ -n "$RUN_DIR" ] && rm -rf "$RUN_DIR"
  [ "$(cat "$LOCK_FILE" 2>/dev/null)" = "$$" ] && rm -f "$LOCK_FILE"
}

# --- Preflight ------------------------------------------------------------------
printf '%sCU Bank%s\n' "$BOLD" "$RESET"
node_ok || die "Node.js 20–25 not found. Run ./setup.sh first."
[ -d "$ROOT/backend/node_modules" ] && [ -d "$ROOT/frontend/node_modules" ] ||
  die "Dependencies are not installed. Run ./setup.sh first."
MONGO_MODE=$(cat "$MONGO_MODE_FILE" 2>/dev/null)
[ -n "$MONGO_MODE" ] && [ -n "$(mongo_uri)" ] || die "MongoDB is not set up. Run ./setup.sh first."

step "Stopping previous run"
stop_previous

echo $$ > "$LOCK_FILE"
RUN_DIR=$(mktemp -d "${TMPDIR:-/tmp}/cubank.XXXXXX")
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM
trap cleanup EXIT

# --- Services -------------------------------------------------------------------
step "MongoDB"
start_mongo

step "Backend :$BACKEND_PORT · Frontend :$FRONTEND_PORT"
[ -t 1 ] && export FORCE_COLOR=1
launch "${CYAN}[backend]${RESET}  " backend "$ROOT/backend" node "$ROOT/backend/server.js"
# BROWSER=none: don't open a new tab on every restart.
# CI=true: keep the dev server alive without a terminal on stdin.
launch "${MAGENTA}[frontend]${RESET} " frontend "$ROOT/frontend" \
  env BROWSER=none CI=true PORT="$FRONTEND_PORT" node "$ROOT/frontend/node_modules/react-scripts/scripts/start.js"
BACK_PID=$(read_pid "$RUN_DIR/backend.pid")
FRONT_PID=$(read_pid "$RUN_DIR/frontend.pid")
[ -n "$BACK_PID" ] && [ -n "$FRONT_PID" ] || die "Could not launch the backend/frontend."

(
  wait_for http "$BACKEND_PORT" 60 && wait_for http "$FRONTEND_PORT" 300 || exit 0
  printf '\n  %s%s✓ CU Bank is running%s\n' "$GREEN" "$BOLD" "$RESET"
  printf '    App  %shttp://localhost:%s%s\n' "$BOLD" "$FRONTEND_PORT" "$RESET"
  printf '    API  http://localhost:%s/api/v1\n' "$BACKEND_PORT"
  printf '    %sCtrl+C to stop · run ./start.sh again to restart%s\n\n' "$DIM" "$RESET"
) &
WATCH_PID=$!
disown

# Stay in the foreground; if any service dies, stop the rest.
while :; do
  kill -0 "$BACK_PID" 2>/dev/null || die "Backend stopped — see the [backend] logs above. Run ./start.sh to restart."
  kill -0 "$FRONT_PID" 2>/dev/null || die "Frontend stopped — see the [frontend] logs above. Run ./start.sh to restart."
  if [ -n "$MONGO_PID" ] && ! kill -0 "$MONGO_PID" 2>/dev/null; then
    die "MongoDB stopped — see .tools/mongod.log. Run ./start.sh to restart."
  fi
  sleep 1
done
