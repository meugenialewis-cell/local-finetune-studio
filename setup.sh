#!/bin/bash
# ============================================================================
# Local Fine-Tuning Studio — one-shot setup & launch script for macOS
#
# What this does, in order:
#   1. Makes sure Node.js 20+ is available (downloads a private copy if not —
#      nothing is installed system-wide, no admin password needed)
#   2. Makes sure pnpm (the package manager) is available
#   3. Installs the app's dependencies (first run only)
#   4. Builds the app (first run only)
#   5. Offers to install the optional MLX training engine (Apple Silicon only)
#   6. Starts the app and opens it in your browser
#
# Running it again later skips the steps that are already done and just
# starts the app. It is always safe to re-run.
# ============================================================================

set -u

cd "$(dirname "$0")"

APP_PORT="${APP_PORT:-3939}"
TOOLS_DIR=".local-tools"
LOG_FILE="$TOOLS_DIR/setup.log"
NODE_VERSION="22.14.0"
MIN_NODE_MAJOR=20

mkdir -p "$TOOLS_DIR"
: > "$LOG_FILE"

say()  { printf "\n\033[1m%s\033[0m\n" "$1"; }
info() { printf "   %s\n" "$1"; }

fail() {
  printf "\n\033[1;31mSomething went wrong: %s\033[0m\n" "$1"
  printf "\nDon't worry — nothing is broken. A detailed log was saved to:\n"
  printf "   %s\n" "$(pwd)/$LOG_FILE"
  printf "\nTry running this script again. If it keeps failing, the log file\n"
  printf "above has the details someone technical (or an AI assistant) can use\n"
  printf "to help you.\n\n"
  read -r -p "Press Enter to close this window..." _ 2>/dev/null || true
  exit 1
}

say "🧠  Local Fine-Tuning Studio"
info "Setting things up. The first run can take a few minutes;"
info "after that, starting the app only takes a few seconds."

# ----------------------------------------------------------------------------
# Step 1: Node.js
# ----------------------------------------------------------------------------
node_ok() {
  local bin="$1"
  [ -x "$bin" ] || command -v "$bin" >/dev/null 2>&1 || return 1
  local major
  major="$("$bin" -p 'process.versions.node.split(".")[0]' 2>/dev/null)" || return 1
  [ "${major:-0}" -ge "$MIN_NODE_MAJOR" ]
}

NODE_BIN=""
if node_ok node; then
  NODE_BIN="$(command -v node)"
elif node_ok "$TOOLS_DIR/node/bin/node"; then
  NODE_BIN="$TOOLS_DIR/node/bin/node"
fi

if [ -z "$NODE_BIN" ]; then
  say "⬇️   Downloading Node.js (a one-time helper this app runs on)..."
  ARCH="$(uname -m)"
  case "$ARCH" in
    arm64) NODE_ARCH="darwin-arm64" ;;
    x86_64) NODE_ARCH="darwin-x64" ;;
    *) fail "Unsupported processor type: $ARCH" ;;
  esac
  NODE_TAR="node-v$NODE_VERSION-$NODE_ARCH.tar.gz"
  NODE_URL="https://nodejs.org/dist/v$NODE_VERSION/$NODE_TAR"
  curl -fL --progress-bar "$NODE_URL" -o "$TOOLS_DIR/$NODE_TAR" \
    || fail "Could not download Node.js. Are you connected to the internet?"
  rm -rf "$TOOLS_DIR/node"
  tar -xzf "$TOOLS_DIR/$NODE_TAR" -C "$TOOLS_DIR" >>"$LOG_FILE" 2>&1 \
    || fail "Could not unpack Node.js."
  mv "$TOOLS_DIR/node-v$NODE_VERSION-$NODE_ARCH" "$TOOLS_DIR/node"
  rm -f "$TOOLS_DIR/$NODE_TAR"
  NODE_BIN="$TOOLS_DIR/node/bin/node"
  node_ok "$NODE_BIN" || fail "The downloaded Node.js copy doesn't work on this Mac."
fi

# Make sure the chosen node (and its npm) are first on PATH for everything below.
NODE_DIR="$(cd "$(dirname "$NODE_BIN")" && pwd)"
export PATH="$NODE_DIR:$PATH"
info "Using Node.js $(node -v)"

# ----------------------------------------------------------------------------
# Step 2: pnpm
# ----------------------------------------------------------------------------
export PATH="$(pwd)/$TOOLS_DIR/pnpm/bin:$PATH"
pnpm_ok() {
  command -v pnpm >/dev/null 2>&1 || return 1
  local major
  major="$(pnpm -v 2>/dev/null | cut -d. -f1)"
  # This project's lockfile needs pnpm 9 or newer.
  [ "${major:-0}" -ge 9 ]
}
if ! pnpm_ok; then
  say "⬇️   Getting the package manager (pnpm)..."
  npm_config_prefix="$(pwd)/$TOOLS_DIR/pnpm" npm install -g pnpm@10 >>"$LOG_FILE" 2>&1 \
    || fail "Could not install pnpm."
  pnpm_ok || fail "pnpm was installed but isn't working."
fi
info "Using pnpm $(pnpm -v)"

# ----------------------------------------------------------------------------
# Step 3: install dependencies (skipped when nothing changed)
# ----------------------------------------------------------------------------
LOCK_HASH="$(shasum -a 256 pnpm-lock.yaml 2>/dev/null | cut -d' ' -f1)"
STAMP_FILE="$TOOLS_DIR/install.stamp"
if [ -d node_modules ] && [ -f "$STAMP_FILE" ] && [ "$(cat "$STAMP_FILE")" = "$LOCK_HASH" ]; then
  info "Dependencies already installed — skipping."
else
  say "📦  Installing the app's dependencies (first run only, takes a few minutes)..."
  pnpm install --frozen-lockfile >>"$LOG_FILE" 2>&1 \
    || pnpm install >>"$LOG_FILE" 2>&1 \
    || fail "Dependency installation failed."
  printf "%s" "$LOCK_HASH" > "$STAMP_FILE"
  # Dependencies changed, so any previous build is stale.
  rm -f "$TOOLS_DIR/build.stamp"
fi

# ----------------------------------------------------------------------------
# Step 4: build the app (skipped when nothing changed since the last build)
# ----------------------------------------------------------------------------
# The stamp stores a fingerprint of the app's source files, so replacing
# files with a newer version automatically triggers a rebuild on next start.
BUILD_STAMP="$TOOLS_DIR/build.stamp"
SRC_HASH="$( (find artifacts lib -type d \( -name node_modules -o -name dist -o -name storage -o -name ".local-tools" \) -prune -o -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.css" -o -name "*.html" -o -name "*.json" -o -name "*.py" -o -name "*.mjs" \) -print 2>/dev/null | LC_ALL=C sort | xargs shasum -a 256 2>/dev/null; ) | shasum -a 256 | cut -d' ' -f1)"
if [ -f "$BUILD_STAMP" ] && [ "$(cat "$BUILD_STAMP" 2>/dev/null)" = "$SRC_HASH" ] \
  && [ -f artifacts/api-server/dist/index.mjs ] \
  && [ -f artifacts/finetune-studio/dist/public/index.html ]; then
  info "App already built — skipping."
else
  say "🔨  Building the app (takes a minute the first time or after an update)..."
  NODE_ENV=production pnpm --filter @workspace/api-server run build >>"$LOG_FILE" 2>&1 \
    || fail "Building the server failed."
  NODE_ENV=production BASE_PATH=/ pnpm --filter @workspace/finetune-studio run build >>"$LOG_FILE" 2>&1 \
    || fail "Building the interface failed."
  printf "%s" "$SRC_HASH" > "$BUILD_STAMP"
fi

# ----------------------------------------------------------------------------
# Step 5: optional MLX training engine (Apple Silicon only)
# ----------------------------------------------------------------------------
if [ "$(uname -s)" = "Darwin" ] && [ "$(uname -m)" = "arm64" ]; then
  if command -v python3 >/dev/null 2>&1; then
    if ! python3 -c "import mlx_lm" >/dev/null 2>&1; then
      say "🍏  Optional: real on-device training"
      info "Your Mac has Apple Silicon, so it can run REAL model downloads and"
      info "training with Apple's MLX engine. Without it, the app still works"
      info "but simulates training instead."
      printf "\n   Install the MLX training engine now? It's about 500 MB. [y/N] "
      REPLY=""
      read -r -t 60 REPLY 2>/dev/null || true
      if [ "$REPLY" = "y" ] || [ "$REPLY" = "Y" ]; then
        say "⬇️   Installing MLX (this can take a few minutes)..."
        if python3 -m pip install --user mlx-lm huggingface_hub >>"$LOG_FILE" 2>&1; then
          info "MLX installed. Training will run for real on this Mac."
        else
          info "MLX installation didn't finish — the app will run in simulation"
          info "mode. You can try again later with:"
          info "   python3 -m pip install --user mlx-lm huggingface_hub"
        fi
      else
        info "Skipped. You can install it any time with:"
        info "   python3 -m pip install --user mlx-lm huggingface_hub"
      fi
    fi
  else
    info "Note: Python 3 wasn't found, so real training is unavailable."
    info "The app will run in simulation mode. (Installing Xcode Command"
    info "Line Tools or python.org's Python 3 enables real training.)"
  fi
fi

# ----------------------------------------------------------------------------
# Step 6: start the app
# ----------------------------------------------------------------------------
if curl -sf "http://localhost:$APP_PORT/api/healthz" >/dev/null 2>&1; then
  say "✅  The app is already running!"
  info "Opening it in your browser..."
  open "http://localhost:$APP_PORT" 2>/dev/null || true
  exit 0
fi

say "🚀  Starting Local Fine-Tuning Studio..."

cleanup() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  exit 0
}
trap cleanup INT TERM

(
  cd artifacts/api-server \
    && PORT="$APP_PORT" NODE_ENV=production exec node --enable-source-maps ./dist/index.mjs
) >>"$LOG_FILE" 2>&1 &
SERVER_PID=$!

STARTED=""
for _ in $(seq 1 60); do
  if curl -sf "http://localhost:$APP_PORT/api/healthz" >/dev/null 2>&1; then
    STARTED="yes"
    break
  fi
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

[ -n "$STARTED" ] || fail "The app didn't start properly."

say "✅  Local Fine-Tuning Studio is running!"
info "Opening http://localhost:$APP_PORT in your browser..."
info ""
info "Keep this window open while you use the app."
info "To stop the app, close this window or press Ctrl+C."
open "http://localhost:$APP_PORT" 2>/dev/null || true

wait "$SERVER_PID"
