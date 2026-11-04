# Shared helpers for ./setup.sh and ./start.sh — not meant to be run directly.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$ROOT/.tools"                      # everything setup.sh downloads lives here
CONFIG="$ROOT/backend/config/config.env"
COMPOSE_FILE="$ROOT/docker-compose.yml"
MONGO_MODE_FILE="$TOOLS/mongo-mode"       # docker | native | existing | external
MONGOD_PATH_FILE="$TOOLS/mongod-path"
MONGO_DATA="$TOOLS/mongo-data"
MONGO_CONTAINER=cubank-mongo
LOCAL_MONGO_URI="mongodb://127.0.0.1:27017/cubank"

NODE_MAJOR=24          # installed when no Node 20–25 is found (backend requires >=20 <26)
MONGO_VERSION=8.0.34   # portable mongod used when Docker is unavailable

BACKEND_PORT=4000
FRONTEND_PORT=3000
MONGO_PORT=27017

if [ -t 1 ]; then
  BOLD=$'\033[1m' DIM=$'\033[2m' RED=$'\033[31m' GREEN=$'\033[32m' YELLOW=$'\033[33m'
  CYAN=$'\033[36m' MAGENTA=$'\033[35m' RESET=$'\033[0m'
else
  BOLD= DIM= RED= GREEN= YELLOW= CYAN= MAGENTA= RESET=
fi

step() { printf '\n%s==> %s%s\n' "$BOLD" "$*" "$RESET"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
die()  { printf '\n  %s✗ %s%s\n\n' "$RED" "$*" "$RESET" >&2; exit 1; }

# Prefer the project-local Node that setup.sh installs, if there is one.
if [ -x "$TOOLS/node/bin/node" ]; then
  PATH="$TOOLS/node/bin:$PATH"
  export PATH
fi

node_ok() {
  command -v node >/dev/null 2>&1 &&
    node -e 'const m = +process.versions.node.split(".")[0]; process.exit(m >= 20 && m <= 25 ? 0 : 1)'
}

# wait_for <tcp|http> <port> <seconds>: succeed once 127.0.0.1:<port> accepts a
# connection (tcp) or answers any HTTP response (http). 0 seconds = check once.
wait_for() {
  node -e '
    const [mode, port, secs] = [process.argv[1], +process.argv[2], +process.argv[3]];
    const deadline = Date.now() + secs * 1000;
    const retry = () => (Date.now() >= deadline ? process.exit(1) : setTimeout(poll, 500));
    function poll() {
      if (mode === "tcp") {
        const s = require("net").connect(port, "127.0.0.1");
        s.on("connect", () => process.exit(0)).on("error", retry);
      } else {
        require("http")
          .get({ host: "127.0.0.1", port, path: "/", timeout: 10000 }, (res) => { res.resume(); process.exit(0); })
          .on("timeout", function () { this.destroy(); })
          .on("error", retry);
      }
    }
    poll();' "$1" "$2" "$3"
}

port_open() { wait_for tcp "$1" 0; }

docker_ready() {
  command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

mac_app_installed() { [ -d "/Applications/$1.app" ] || [ -d "$HOME/Applications/$1.app" ]; }

# On macOS, launch the Docker runtime if it is installed but not running:
# whichever the current docker context points at, else OrbStack, else Docker Desktop.
start_docker_runtime() {
  [ "$(uname -s)" = Darwin ] && command -v docker >/dev/null 2>&1 || return 1
  local app
  case "$(docker context show 2>/dev/null)" in
    orbstack) app=OrbStack ;;
    desktop-linux) app=Docker ;;
    *) if mac_app_installed OrbStack; then app=OrbStack; else app=Docker; fi ;;
  esac
  mac_app_installed "$app" || return 1
  open -ga "$app" >/dev/null 2>&1 || return 1
  info "Starting $app (up to 90s)..."
  local i
  for i in $(seq 1 90); do
    docker_ready && return 0
    sleep 1
  done
  return 1
}

docker_mongo_running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$MONGO_CONTAINER" 2>/dev/null)" = true ]
}

native_mongo_pids() { pgrep -f -- "--dbpath $MONGO_DATA" 2>/dev/null; }

mongo_uri() {
  sed -n 's/^MONGO_URI[[:space:]]*=[[:space:]]*//p' "$CONFIG" 2>/dev/null | tr -d '\r' | head -n 1
}

uri_is_local() {
  case "$1" in *127.0.0.1*|*localhost*) return 0 ;; *) return 1 ;; esac
}

# Hide credentials when printing a connection string.
redact_uri() { printf '%s' "$1" | sed -E 's#//[^/@]*@#//***@#'; }

# kill_pids <timeout-seconds> <pid...>: SIGTERM, then SIGKILL whatever is left.
kill_pids() {
  local timeout=$1 pid alive i=0
  shift
  [ $# -gt 0 ] || return 0
  kill "$@" 2>/dev/null
  while [ $i -lt $((timeout * 10)) ]; do
    alive=0
    for pid in "$@"; do kill -0 "$pid" 2>/dev/null && alive=1; done
    [ $alive = 0 ] && return 0
    sleep 0.1
    i=$((i + 1))
  done
  kill -9 "$@" 2>/dev/null
  return 0
}
