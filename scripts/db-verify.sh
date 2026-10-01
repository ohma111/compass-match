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

# アプリが profiles を読むときの列リスト (src/lib/profile-columns.ts) をSQLテストに渡す
PROFILE_COLS="$(node --experimental-strip-types --no-warnings -e "import('./src/lib/profile-columns.ts').then((m) => console.log(m.PROFILE_SELECT))")"
if [ -z "$PROFILE_COLS" ]; then echo "PROFILE_SELECT を読み込めませんでした" >&2; exit 1; fi

"${PSQL[@]}" -f supabase/tests/00_supabase_shim.sql
for f in supabase/migrations/*.sql; do echo "apply $f"; "${PSQL[@]}" -f "$f"; done
# 本番には手で1回貼る運用なので、最新のマイグレーションは2回流しても壊れないことを確認する
LATEST="$(ls supabase/migrations/*.sql | tail -1)"
echo "re-apply $LATEST (idempotency)"; "${PSQL[@]}" -f "$LATEST"
echo "apply seed"; "${PSQL[@]}" -f supabase/seed.sql
echo "run rls tests"; "${PSQL[@]}" -v profile_cols="$PROFILE_COLS" -f supabase/tests/10_rls_test.sql
echo "DB VERIFY OK"
