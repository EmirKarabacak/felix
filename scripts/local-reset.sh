#!/usr/bin/env bash
# Wipes the local test database and restarts the local stack on it.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
LOG="${FELIX_LOCAL_LOG:-/tmp/felix-local-stack.log}"
# Stop whatever is listening on the stack's port (the server runs as a child of npx).
OLD="$(lsof -ti tcp:54321 -sTCP:LISTEN 2>/dev/null | head -1 || true)"
[ -n "$OLD" ] && kill "$OLD" 2>/dev/null || true
"$HERE/local-db.sh" stop >/dev/null 2>&1 || true
"$HERE/local-db.sh" start
cd "$HERE/.."
PGURL=postgres://postgres@127.0.0.1:54329/postgres nohup npx tsx scripts/local-stack.ts > "$LOG" 2>&1 &
for i in $(seq 1 40); do grep -q ANON_KEY "$LOG" 2>/dev/null && break; sleep 0.25; done
grep ANON_KEY "$LOG"
