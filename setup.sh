#!/usr/bin/env bash
#
# One-time setup for CU Bank (macOS / Linux / WSL). Safe to re-run.
#
#   1. Node.js   — uses yours if it is 20–25, otherwise downloads Node 24 into .tools/
#   2. Config    — makes sure backend/config/config.env has a MONGO_URI
#   3. MongoDB   — Docker if available, an already-running MongoDB on :27017,
#                  or a portable mongod downloaded into .tools/
#   4. npm install for backend and frontend
#
# Nothing is installed system-wide and no sudo is needed. Then run ./start.sh
set -euo pipefail
source "$(cd "$(dirname "$0")" && pwd)/scripts/common.sh"

install_local_node() {
  local os arch base file= sum= actual
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux)  os=linux ;;
    *) die "Unsupported OS '$(uname -s)'. On Windows, run this inside WSL (Ubuntu)." ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) arch=arm64 ;;
    x86_64|amd64)  arch=x64 ;;
    *) die "Unsupported CPU '$(uname -m)'. Install Node $NODE_MAJOR yourself from https://nodejs.org" ;;
  esac
  command -v curl >/dev/null 2>&1 || die "curl is required to download Node.js."

  base="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
  read -r sum file < <(curl -fsSL "$base/SHASUMS256.txt" |
    awk -v want="-$os-$arch.tar.gz" 'substr($2, length($2) - length(want) + 1) == want { print $1, $2 }') || true
  [ -n "$file" ] || die "Could not find a Node $NODE_MAJOR download for $os-$arch."

  info "Downloading $file ..."
  mkdir -p "$TOOLS"
  curl -fL --progress-bar "$base/$file" -o "$TOOLS/node.tar.gz"
  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$TOOLS/node.tar.gz" | cut -d' ' -f1)
  else
    actual=$(shasum -a 256 "$TOOLS/node.tar.gz" | cut -d' ' -f1)
  fi
  [ "$actual" = "$sum" ] || { rm -f "$TOOLS/node.tar.gz"; die "Node download failed its checksum. Re-run ./setup.sh."; }

  rm -rf "$TOOLS/node" && mkdir -p "$TOOLS/node"
  tar -xzf "$TOOLS/node.tar.gz" -C "$TOOLS/node" --strip-components 1
  rm -f "$TOOLS/node.tar.gz"
  PATH="$TOOLS/node/bin:$PATH"
  export PATH
}

install_portable_mongod() {
  local dir="$TOOLS/mongodb"
  info "Downloading MongoDB $MONGO_VERSION (~80 MB) into .tools/ ..."
  mkdir -p "$dir" "$MONGO_DATA"
  [ -f "$dir/package.json" ] || echo '{ "private": true }' > "$dir/package.json"
  (cd "$dir" && npm install --no-audit --no-fund --loglevel=error mongodb-memory-server-core@11 >/dev/null)
  (cd "$dir" && MONGOMS_DOWNLOAD_DIR="$dir/bin" MONGOMS_VERSION="$MONGO_VERSION" node -e '
    require("mongodb-memory-server-core").MongoBinary.getPath()
      .then((p) => require("fs").writeFileSync(process.argv[1], p))
      .catch((e) => { console.error(e.message); process.exit(1); });' "$MONGOD_PATH_FILE") ||
    die "MongoDB download failed. Check your internet connection, or install OrbStack (https://orbstack.dev) and re-run ./setup.sh."
}

printf '%sCU Bank setup%s\n' "$BOLD" "$RESET"

# --- 1. Node.js ---------------------------------------------------------------
step "Node.js"
if node_ok; then
  ok "Using Node $(node -v) ($(command -v node))"
else
  if command -v node >/dev/null 2>&1; then
    warn "Node $(node -v) is not supported (need 20–25) — installing Node $NODE_MAJOR for this project only"
  else
    warn "Node.js not found — installing Node $NODE_MAJOR for this project only"
  fi
  install_local_node
  node_ok || die "Node install failed."
  ok "Installed Node $(node -v) into .tools/node"
fi

# --- 2. Backend config ----------------------------------------------------------
step "Backend config"
if [ ! -f "$CONFIG" ]; then
  cat > "$CONFIG" <<EOF
PORT = $BACKEND_PORT
NODE_ENV = development
MONGO_URI = $LOCAL_MONGO_URI
JWT_SECRET = system_testing
JWT_EXPIRE = 30d
JWT_COOKIE_EXPIRE = 30
EOF
  ok "Created backend/config/config.env"
elif [ -z "$(mongo_uri)" ]; then
  if grep -q '^MONGO_URI' "$CONFIG"; then
    sed "s|^MONGO_URI.*|MONGO_URI = $LOCAL_MONGO_URI|" "$CONFIG" > "$CONFIG.tmp" && mv "$CONFIG.tmp" "$CONFIG"
  else
    printf '\nMONGO_URI = %s\n' "$LOCAL_MONGO_URI" >> "$CONFIG"
  fi
  ok "Set MONGO_URI in backend/config/config.env"
fi
MONGO_URI=$(mongo_uri)
ok "MONGO_URI = $(redact_uri "$MONGO_URI")"

# --- 3. MongoDB -----------------------------------------------------------------
step "MongoDB"
mkdir -p "$TOOLS"
if ! uri_is_local "$MONGO_URI"; then
  mode=external
  ok "Using the remote MongoDB from config.env"
elif docker_ready && docker_mongo_running; then
  mode=docker
  ok "Docker container '$MONGO_CONTAINER' is already running"
elif [ -n "$(native_mongo_pids)" ] && [ -s "$MONGOD_PATH_FILE" ]; then
  mode=native
  ok "Portable MongoDB in .tools/ is already running"
elif port_open "$MONGO_PORT"; then
  mode=existing
  ok "Found a MongoDB already running on 127.0.0.1:$MONGO_PORT — using it"
elif docker_ready || start_docker_runtime; then
  mode=docker
  info "Pulling MongoDB image..."
  docker compose -f "$COMPOSE_FILE" pull --quiet mongo
  ok "MongoDB will run in Docker ('$MONGO_CONTAINER')"
else
  mode=native
  if [ -s "$MONGOD_PATH_FILE" ] && [ -x "$(cat "$MONGOD_PATH_FILE")" ]; then
    ok "Portable MongoDB already installed in .tools/"
  else
    warn "Docker not available — using a portable MongoDB instead"
    install_portable_mongod
    ok "Installed MongoDB $MONGO_VERSION into .tools/mongodb"
  fi
fi
echo "$mode" > "$MONGO_MODE_FILE"

# --- 4. npm dependencies --------------------------------------------------------
step "Backend dependencies"
(cd "$ROOT/backend" && npm install --no-audit --no-fund --loglevel=error)
ok "backend/node_modules ready"

step "Frontend dependencies (first run takes a few minutes)"
(cd "$ROOT/frontend" && npm install --no-audit --no-fund --loglevel=error)
ok "frontend/node_modules ready"

chmod +x "$ROOT/setup.sh" "$ROOT/start.sh" 2>/dev/null || true
printf '\n%s%sSetup complete.%s Run %s./start.sh%s to start CU Bank.\n\n' "$GREEN" "$BOLD" "$RESET" "$BOLD" "$RESET"
