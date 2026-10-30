#!/bin/bash
# Kör alla migrationer och SQL-prov mot en lokal Postgres (14 eller senare),
# utan Supabase: databasen byggsite_prov skapas om från noll med skalet i
# shim.sql, migrationerna läggs på i ordning och varje prov i supabase/tests
# körs. Proven rullar tillbaka sig själva.
#
#   PGHOST=/tmp PGPORT=5432 PGUSER=postgres supabase/tests/local/run.sh [prov ...]
#
# Utan argument körs alla prov; annars bara de namngivna (t.ex. 0035_rls).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../../.." && pwd)
DB=${PGDATABASE_PROV:-byggsite_prov}
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
"${PSQL[@]}" -d "$DB" -c "alter database $DB set search_path = \"\$user\", public, extensions" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$HERE/shim.sql" >/dev/null
for f in "$REPO"/supabase/migrations/*.sql; do
  "${PSQL[@]}" -d "$DB" -f "$f" >/dev/null 2>"$HERE/.last-error" || { echo "Migrationen $(basename "$f") gick inte: $(cat "$HERE/.last-error")"; exit 1; }
done
rm -f "$HERE/.last-error"
echo "Migrationerna gick igenom."

tests=("$@")
[ ${#tests[@]} -eq 0 ] && tests=($(cd "$REPO/supabase/tests" && ls *.sql | sed 's/\.sql$//'))
failed=0
for t in "${tests[@]}"; do
  out=$("${PSQL[@]}" -d "$DB" -f "$REPO/supabase/tests/$t.sql" 2>&1 >/dev/null) || { echo "$t: FEL"; echo "$out" | grep -E "ERROR" | head -3; failed=1; continue; }
  echo "$t: $(echo "$out" | grep -oE '(Prov|RLS-prov) [^:]*: alla gick igenom' | tail -1)"
done
exit $failed
