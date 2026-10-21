#!/usr/bin/env sh
# Serve the game locally and expose it through a Cloudflare quick tunnel.
# Requires: python3 (or any static server) and cloudflared
# (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
set -e
cd "$(dirname "$0")"
PORT="${PORT:-8080}"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT INT TERM
echo "Serving on http://127.0.0.1:$PORT — starting Cloudflare tunnel (look for the trycloudflare.com URL below)…"
cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate
