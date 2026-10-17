#!/usr/bin/env bash
# Starts a throwaway local Postgres with Felix's migrations applied, for use
# with scripts/local-stack.ts. Data lives in a temp folder and is lost on stop.
#   scripts/local-db.sh start | stop
# FELIX_MIGRATIONS_UNTIL=0005 stops after that migration, to test the app
# before Emir has run a newer one.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v initdb || echo /usr/lib/postgresql/16/bin/initdb)")}"
DATA="${FELIX_LOCAL_DB:-/tmp/felix-local-db}"
PORT="${PGPORT_LOCAL:-54329}"
RUNAS=""
[ "$(id -u)" = "0" ] && RUNAS="runuser -u postgres --"

if [ "${1:-start}" = "stop" ]; then
  $RUNAS "$PGBIN/pg_ctl" -D "$DATA" -m fast stop || true
  rm -rf "$DATA"
  exit 0
fi

rm -rf "$DATA" && mkdir -p "$DATA"
[ -n "$RUNAS" ] && chown postgres "$DATA"
$RUNAS "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
$RUNAS "$PGBIN/pg_ctl" -D "$DATA" -l "$DATA/log" -o "-p $PORT -c listen_addresses=127.0.0.1 -k $DATA" -w start >/dev/null

PSQL="psql -h 127.0.0.1 -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text unique not null,
  password text not null,
  banned boolean not null default false
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  owner_id text,
  metadata jsonb,
  created_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert on storage.objects to authenticated;
grant all on storage.objects, storage.buckets to service_role;
SQL
for f in "$HERE"/../supabase/migrations/*.sql; do
  if [ -n "${FELIX_MIGRATIONS_UNTIL:-}" ] && [[ "$(basename "$f")" > "${FELIX_MIGRATIONS_UNTIL}~" ]]; then continue; fi
  $PSQL -f "$f"
done
echo "local db on postgres://postgres@127.0.0.1:$PORT/postgres"
