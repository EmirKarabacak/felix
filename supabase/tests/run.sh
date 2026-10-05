#!/usr/bin/env bash
# Runs the migrations and the access-rule tests against a throwaway local
# Postgres. Needs Postgres 15+ binaries; nothing here touches the real database.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v initdb || echo /usr/lib/postgresql/16/bin/initdb)")}"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
RUNAS=""
if [ "$(id -u)" = "0" ]; then
  chown postgres "$DATA"
  RUNAS="runuser -u postgres --"
fi

cleanup() { $RUNAS "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

$RUNAS "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
$RUNAS "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -c listen_addresses=127.0.0.1 -k $DATA" -w start >/dev/null

PSQL="psql -h 127.0.0.1 -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"

# Stand-in for the parts of Supabase the migrations rely on.
$PSQL <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
SQL

for f in "$HERE"/../migrations/*.sql; do
  echo "migration: $(basename "$f")"
  $PSQL -f "$f"
done

for f in "$HERE"/*.sql; do
  echo "test: $(basename "$f")"
  if ! out="$($PSQL -f "$f" 2>&1)"; then
    echo "$out" | grep -E "FAILED|ERROR" || echo "$out"
    exit 1
  fi
  echo "$out" | grep -E "ok:|PASSED"
done
