#!/usr/bin/env bash
set -euo pipefail
cluster_dir="$(mktemp -d /tmp/shamsy-pg-test.XXXXXX)"
pg_bindir="$(pg_config --bindir)"
if [[ ! -x "$pg_bindir/initdb" ]]; then
  pg_bindir="$(find /usr/lib/postgresql -maxdepth 3 -name initdb -type f -print -quit | xargs dirname)"
fi
port=55433
cleanup() { "$pg_bindir/pg_ctl" -D "$cluster_dir" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$cluster_dir"; }
trap cleanup EXIT
"$pg_bindir/initdb" -D "$cluster_dir" -A trust --no-instructions >/dev/null
"$pg_bindir/pg_ctl" -D "$cluster_dir" -o "-p $port" -l "$cluster_dir/server.log" start >/dev/null
psql -p "$port" -d postgres -v ON_ERROR_STOP=1 -q -c "create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';"
psql -p "$port" -d postgres -v ON_ERROR_STOP=1 -q -f supabase/migrations/202609220001_order_foundation.sql -f supabase/migrations/202609220002_demo_catalog.sql -f supabase/migrations/202609240001_invalidate_price_approvals.sql -f supabase/migrations/202609240002_lock_financial_inputs.sql -f tests/sql/rls.sql
printf 'PostgreSQL RLS and finance checks passed.\n'
