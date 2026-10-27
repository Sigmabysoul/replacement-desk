#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# IMPORT SUPABASE DATA DUMP INTO TARGET VPS POSTGRESQL
# =============================================================================
# Usage:
#   ./scripts/import-supabase-db.sh <TARGET_DB_URL> [backup_file.sql]
#
# Example:
#   ./scripts/import-supabase-db.sh "postgresql://postgres:NewPassword@123.45.67.89:5432/postgres" data_backup.sql
# =============================================================================

TARGET_DB_URL="${1:-}"
BACKUP_FILE="${2:-supabase_data_backup.sql}"

if [ -z "$TARGET_DB_URL" ]; then
  echo ""
  echo "❌ Error: Missing Target Database URL."
  echo ""
  echo "Usage:"
  echo "  ./scripts/import-supabase-db.sh <TARGET_DB_URL> [backup_file.sql]"
  echo ""
  echo "Example:"
  echo "  ./scripts/import-supabase-db.sh 'postgresql://postgres:NewPassword@your-vps-ip:5432/postgres' data_backup.sql"
  echo ""
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: Backup file not found at: $BACKUP_FILE"
  exit 1
fi

echo "=================================================="
echo "🚀 IMPORTING SUPABASE DATA INTO TARGET VPS"
echo "=================================================="
echo "Source File: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
echo "Target DB:   $TARGET_DB_URL"
echo ""

psql -X -v ON_ERROR_STOP=1 "$TARGET_DB_URL" -f "$BACKUP_FILE"

echo ""
echo "=================================================="
echo "✅ SUCCESS! All data, users, and records imported!"
echo "=================================================="

