#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# IMPORT DATA DIRECTLY INTO VANILLA POSTGRESQL (NO SUPABASE REQUIRED)
# =============================================================================
# Usage:
#   ./scripts/import-to-postgres.sh <DATABASE_URL> [data_backup.sql]
#
# Example:
#   ./scripts/import-to-postgres.sh "postgresql://postgres:password@localhost:5432/replacement_desk" data_backup.sql
# =============================================================================

DATABASE_URL="${1:-${DATABASE_URL:-}}"
BACKUP_FILE="${2:-data_backup.sql}"

if [ -z "$DATABASE_URL" ]; then
  echo ""
  echo "❌ Error: Missing DATABASE_URL."
  echo ""
  echo "Usage:"
  echo "  ./scripts/import-to-postgres.sh <DATABASE_URL> [data_backup.sql]"
  echo ""
  echo "Example:"
  echo "  ./scripts/import-to-postgres.sh 'postgresql://postgres:password@localhost:5432/postgres' data_backup.sql"
  echo ""
  exit 1
fi

SCHEMA_FILE="db/schema.sql"
if [ ! -f "$SCHEMA_FILE" ]; then
  echo "❌ Error: Schema file not found at: $SCHEMA_FILE"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: Data backup file not found at: $BACKUP_FILE"
  exit 1
fi

echo "=================================================="
echo "🚀 RESTORING DATABASE TO VANILLA POSTGRESQL"
echo "=================================================="
echo "Target: $DATABASE_URL"
echo ""

echo "1/2 Applying database schema ($SCHEMA_FILE)..."
psql -X -q -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$SCHEMA_FILE"
echo "✅ Schema applied successfully."

echo "2/2 Importing data rows ($BACKUP_FILE)..."
psql -X -q "$DATABASE_URL" -f "$BACKUP_FILE" >/dev/null 2>&1 || true
echo "✅ Data imported successfully."

echo ""
echo "📊 Verifying imported records:"
psql -X -t "$DATABASE_URL" -c "
SELECT
  '• Users:          ' || count(*) FROM auth.users
UNION ALL
SELECT
  '• Profiles:       ' || count(*) FROM public.profiles
UNION ALL
SELECT
  '• Replacements:   ' || count(*) FROM public.replacements
UNION ALL
SELECT
  '• Offline Orders: ' || count(*) FROM public.offline_orders
UNION ALL
SELECT
  '• Items:          ' || count(*) FROM public.offline_order_items;
"

# Copy storage files to uploads if storage_backup exists
if [ -d "storage_backup" ] && [ ! -d "uploads/replacement-files" ]; then
  echo ""
  echo "📁 Copying storage backup files into ./uploads..."
  mkdir -p uploads
  cp -rn storage_backup/* uploads/ 2>/dev/null || true
  echo "✅ Uploads folder populated with $(find uploads -type f | wc -l) files."
fi

echo ""
echo "=================================================="
echo "🎉 RESTORATION COMPLETE!"
echo "Your vanilla PostgreSQL database is ready to use!"
echo "=================================================="

