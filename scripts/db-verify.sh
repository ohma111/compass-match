#!/usr/bin/env bash
# ローカルのPostgres(16以上)でマイグレーションとRLSを検証するスクリプト。
# Supabase には接続しない。使い方: PGBIN=/usr/lib/postgresql/16/bin bash scripts/db-verify.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN="${PGBIN:-$(dirname "$(command -v pg_ctl || echo /usr/lib/postgresql/16/bin/pg_ctl)")}"
TMP="$(mktemp -d)"
PORT="${PGPORT_VERIFY:-54329}"
RUNAS=()
if [ "$(id -u)" = "0" ]; then chown -R postgres "$TMP"; RUNAS=(runuser -u postgres --); fi
"${RUNAS[@]}" "$PGBIN/initdb" -D "$TMP/data" -U postgres -A trust -E UTF8 --locale=C >/dev/null
"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -w start >/dev/null
trap '"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null; rm -rf "$TMP"' EXIT
PSQL=("$PGBIN/psql" -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f supabase/tests/00_supabase_shim.sql
for f in supabase/migrations/*.sql; do echo "apply $f"; "${PSQL[@]}" -f "$f"; done
echo "apply seed"; "${PSQL[@]}" -f supabase/seed.sql
echo "run rls tests"; "${PSQL[@]}" -f supabase/tests/10_rls_test.sql
echo "DB VERIFY OK"
