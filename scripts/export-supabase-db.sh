#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# EXPORT SUPABASE CLOUD DATA (auth, public, storage)
# =============================================================================
# Usage:
#   ./scripts/export-supabase-db.sh <SUPABASE_DB_URL> [output_file.sql]
#
# To find your SUPABASE_DB_URL:
#   Supabase Dashboard -> Project Settings -> Database -> Connection string (URI)
#   e.g. postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
# =============================================================================

DB_URL="${1:-}"
OUTPUT_FILE="${2:-supabase_data_backup.sql}"

if [ -z "$DB_URL" ]; then
  echo ""
  echo "❌ Error: Missing Database Connection URL."
  echo ""
  echo "Usage:"
  echo "  ./scripts/export-supabase-db.sh <SUPABASE_DB_URL> [output_file.sql]"
  echo ""
  echo "Example:"
  echo "  ./scripts/export-supabase-db.sh 'postgresql://postgres:MySecretPassword@db.xyzcompany.supabase.co:5432/postgres' data_backup.sql"
  echo ""
  exit 1
fi

echo "=================================================="
echo "📦 EXPORTING DATA FROM SUPABASE CLOUD"
echo "=================================================="
echo "Schemas: auth, public, storage"
echo "Output:  $OUTPUT_FILE"
echo ""

TMP_FILE="$(mktemp)"

pg_dump "$DB_URL" \
  --data-only \
  --schema=auth \
  --schema=public \
  --schema=storage \
  --no-owner \
  --no-privileges \
  --file="$TMP_FILE"

{
  echo "-- ============================================================================="
  echo "-- SUPABASE DATA BACKUP"
  echo "-- Disable foreign keys & triggers during import to prevent constraint issues"
  echo "-- ============================================================================="
  echo "SET session_replication_role = replica;"
  echo ""
  cat "$TMP_FILE"
  echo ""
  echo "-- Restore default trigger behavior"
  echo "SET session_replication_role = DEFAULT;"
} > "$OUTPUT_FILE"

rm -f "$TMP_FILE"

echo ""
echo "=================================================="
echo "✅ SUCCESS! Data exported to: $OUTPUT_FILE"
echo "File size: $(du -h "$OUTPUT_FILE" | cut -f1)"
echo "=================================================="

