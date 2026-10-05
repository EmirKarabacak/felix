#!/usr/bin/env bash
# Fresh local database + local stack + the app on http://127.0.0.1:5173
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
KEY="$("$HERE/local-reset.sh" | sed -n 's/^ANON_KEY=//p')"
OLD="$(lsof -ti tcp:5173 -sTCP:LISTEN 2>/dev/null | head -1 || true)"
[ -n "$OLD" ] && kill "$OLD" 2>/dev/null || true
cd "$HERE/.."
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY="$KEY" FELIX_API_PROXY=http://127.0.0.1:54321 \
  nohup npx vite --port 5173 --strictPort --host 127.0.0.1 > /tmp/felix-local-vite.log 2>&1 &
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:5173/ && break; sleep 0.25; done
echo "app on http://127.0.0.1:5173"
