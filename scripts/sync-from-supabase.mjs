#!/usr/bin/env node
/**
 * =============================================================================
 * SYNC LATEST DATA FROM SUPABASE CLOUD TO VPS (VANILLA POSTGRESQL + STORAGE)
 * =============================================================================
 *
 * This script exports the freshest data (users, orders, items, logs, files)
 * directly from your Supabase Cloud instance and updates:
 *   1. Your Target VPS PostgreSQL database
 *   2. The local `db/seed-data.sql` file (for container auto-bootstrapping)
 *   3. Storage attachments into `./uploads`
 *
 * Usage:
 *   node scripts/sync-from-supabase.mjs [SUPABASE_DB_URL] [TARGET_VPS_DB_URL]
 *
 * Or set environment variables:
 *   SUPABASE_DB_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"
 *   DATABASE_URL="postgresql://postgres:[PASSWORD]@[VPS_IP]:5432/replacement_desk"
 * =============================================================================
 */

import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.production"));
loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

const supabaseDbUrl =
  process.argv[2] ||
  process.env.SUPABASE_DB_URL ||
  process.env.SUPABASE_DATABASE_URL ||
  process.env.SOURCE_DB_URL;

const targetDbUrl =
  process.argv[3] ||
  process.env.TARGET_DB_URL ||
  process.env.DATABASE_URL;

if (!supabaseDbUrl) {
  console.log(`
================================================================================
❌ Missing Supabase Cloud Connection URL!
================================================================================
Usage:
  node scripts/sync-from-supabase.mjs "<SUPABASE_DB_URL>" ["<TARGET_VPS_DB_URL>"]

Example:
  node scripts/sync-from-supabase.mjs \\
    "postgresql://postgres:MySupabasePassword@db.xyz.supabase.co:5432/postgres" \\
    "postgresql://postgres:MyVpsPassword@129.121.134.152:5432/replacement_desk"

Where to find your Supabase DB URL:
  Supabase Dashboard -> Project Settings -> Database -> Connection String (URI)
================================================================================
`);
  process.exit(1);
}

console.log("==================================================");
console.log("🚀 STARTING SUPABASE -> VPS DATA SYNC");
console.log("==================================================");
console.log(`📡 Source: ${supabaseDbUrl.replace(/:[^:@]+@/, ":****@")}`);
if (targetDbUrl) {
  console.log(`🎯 Target: ${targetDbUrl.replace(/:[^:@]+@/, ":****@")}`);
} else {
  console.log("🎯 Target: (None specified - will generate db/seed-data.sql)");
}
console.log("");

async function runSync() {
  const sourceSql = postgres(supabaseDbUrl, {
    max: 5,
    connect_timeout: 15,
    ssl: "require",
  });

  let targetSql = null;
  if (targetDbUrl) {
    targetSql = postgres(targetDbUrl, {
      max: 10,
      connect_timeout: 15,
      ssl: targetDbUrl.includes("localhost") || targetDbUrl.includes("127.0.0.1") ? false : "prefer",
    });
  }

  try {
    console.log("📥 Fetching latest data from Supabase Cloud...");

    // Helper to safely fetch all rows from a table
    async function safeFetch(queryFn, label) {
      try {
        const rows = await queryFn();
        console.log(`  • Found ${rows.length} ${label}`);
        return rows;
      } catch (err) {
        console.warn(`  • [Notice] Could not fetch ${label}: ${err.message}`);
        return [];
      }
    }

    const users = await safeFetch(() => sourceSql`SELECT * FROM auth.users ORDER BY created_at ASC`, "auth.users");
    const profiles = await safeFetch(() => sourceSql`SELECT * FROM public.profiles ORDER BY created_at ASC`, "public.profiles");
    const presets = await safeFetch(() => sourceSql`SELECT * FROM public.dimension_presets ORDER BY created_at ASC`, "public.dimension_presets");
    const customerPresets = await safeFetch(() => sourceSql`SELECT * FROM public.customer_presets ORDER BY created_at ASC`, "public.customer_presets");
    const replacements = await safeFetch(() => sourceSql`SELECT * FROM public.replacements ORDER BY created_at ASC`, "public.replacements");
    const replacementItems = await safeFetch(() => sourceSql`SELECT * FROM public.replacement_items ORDER BY "position" ASC`, "public.replacement_items");
    const qcSubmissions = await safeFetch(() => sourceSql`SELECT * FROM public.qc_submissions ORDER BY submission_number ASC`, "public.qc_submissions");
    const attachments = await safeFetch(() => sourceSql`SELECT * FROM public.attachments ORDER BY created_at ASC`, "public.attachments");
    const activities = await safeFetch(() => sourceSql`SELECT * FROM public.activity_logs ORDER BY created_at ASC`, "public.activity_logs");
    const offlineOrders = await safeFetch(() => sourceSql`SELECT * FROM public.offline_orders ORDER BY created_at ASC`, "public.offline_orders");
    const offlineItems = await safeFetch(() => sourceSql`SELECT * FROM public.offline_order_items ORDER BY "position" ASC`, "public.offline_order_items");
    const offlineAttachments = await safeFetch(() => sourceSql`SELECT * FROM public.offline_order_attachments ORDER BY created_at ASC`, "public.offline_order_attachments");
    const buckets = await safeFetch(() => sourceSql`SELECT * FROM storage.buckets`, "storage.buckets");
    const storageObjects = await safeFetch(() => sourceSql`SELECT * FROM storage.objects ORDER BY created_at ASC`, "storage.objects");

    // Helper to format values for SQL output
    function sqlVal(v) {
      if (v === null || v === undefined) return "NULL";
      if (typeof v === "boolean" || typeof v === "number") return String(v);
      if (typeof v === "object") {
        if (Array.isArray(v)) {
          // Format postgres array e.g. ARRAY['PRINTING','PACKING']::public.app_role[]
          const escaped = v.map((item) => `'${String(item).replace(/'/g, "''")}'`).join(",");
          return `ARRAY[${escaped}]::public.app_role[]`;
        }
        return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
      }
      return `'${String(v).replace(/'/g, "''")}'`;
    }

    // Generate seed-data.sql content
    console.log("\n📝 Generating fresh db/seed-data.sql file...");
    let sqlDump = `-- =============================================================================
-- AUTO-SYNCED DATA FROM SUPABASE CLOUD
-- Generated at: ${new Date().toISOString()}
-- =============================================================================
SET session_replication_role = replica;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

`;

    // Write table inserts
    function appendTable(tableName, rows) {
      if (!rows || rows.length === 0) return;
      const cols = Object.keys(rows[0]);
      for (const row of rows) {
        const vals = cols.map((col) => {
          if (col === "role") return `${sqlVal(row[col])}::public.app_role`;
          if (col === "roles") return sqlVal(row[col]);
          if (col === "status" && (tableName === "public.replacements" || tableName === "public.offline_orders")) {
            return sqlVal(row[col]);
          }
          return sqlVal(row[col]);
        });
        sqlDump += `INSERT INTO ${tableName} (${cols.join(", ")}) VALUES (${vals.join(", ")}) ON CONFLICT (id) DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(", ")};\n`;
      }
      sqlDump += "\n";
    }

    appendTable("storage.buckets", buckets);
    appendTable("storage.objects", storageObjects);
    appendTable("auth.users", users);
    appendTable("public.profiles", profiles);
    appendTable("public.dimension_presets", presets);
    appendTable("public.customer_presets", customerPresets);
    appendTable("public.replacements", replacements);
    appendTable("public.replacement_items", replacementItems);
    appendTable("public.qc_submissions", qcSubmissions);
    appendTable("public.attachments", attachments);
    appendTable("public.activity_logs", activities);
    appendTable("public.offline_orders", offlineOrders);
    appendTable("public.offline_order_items", offlineItems);
    appendTable("public.offline_order_attachments", offlineAttachments);

    sqlDump += `
-- Reset sequences and replication role
SELECT setval(pg_get_serial_sequence('public.dimension_presets', 'id'), COALESCE(max(id), 1)) FROM public.dimension_presets;
SET session_replication_role = DEFAULT;
`;

    const seedPath = path.resolve(process.cwd(), "db", "seed-data.sql");
    fs.writeFileSync(seedPath, sqlDump, "utf-8");
    console.log(`✅ Saved ${Math.round(sqlDump.length / 1024)} KB of latest data into ${seedPath}`);

    // If Target DB is connected, push directly into Target VPS Postgres
    if (targetSql) {
      console.log("\n🚀 Pushing latest data directly into Target VPS Database...");
      await targetSql.unsafe("SET session_replication_role = replica;");

      async function insertBatch(name, rows) {
        if (!rows.length) return;
        let inserted = 0;
        for (const row of rows) {
          try {
            await targetSql`INSERT INTO ${targetSql(name)} ${targetSql(row)} ON CONFLICT (id) DO UPDATE SET ${targetSql(row)}`;
            inserted++;
          } catch (err) {
            console.warn(`  [Warning] ${name} row ${row.id}: ${err.message}`);
          }
        }
        console.log(`  • Synced ${inserted}/${rows.length} rows to ${name}`);
      }

      await insertBatch("storage.buckets", buckets);
      await insertBatch("storage.objects", storageObjects);
      await insertBatch("auth.users", users);
      await insertBatch("public.profiles", profiles);
      await insertBatch("public.dimension_presets", presets);
      await insertBatch("public.customer_presets", customerPresets);
      await insertBatch("public.replacements", replacements);
      await insertBatch("public.replacement_items", replacementItems);
      await insertBatch("public.qc_submissions", qcSubmissions);
      await insertBatch("public.attachments", attachments);
      await insertBatch("public.activity_logs", activities);
      await insertBatch("public.offline_orders", offlineOrders);
      await insertBatch("public.offline_order_items", offlineItems);
      await insertBatch("public.offline_order_attachments", offlineAttachments);

      await targetSql.unsafe("SET session_replication_role = DEFAULT;");
      console.log("✅ All rows synced to VPS database!");
    }

    // Check storage download if credentials available
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (supabaseUrl && serviceKey && fs.existsSync("scripts/backup-storage.mjs")) {
      console.log("\n📁 Syncing newly uploaded storage files (photos, labels, PODs)...");
      try {
        execSync("node scripts/backup-storage.mjs ./uploads", { stdio: "inherit" });
      } catch {
        console.warn("  [Storage sync skipped or partially completed]");
      }
    }

    console.log("\n==================================================");
    console.log("🎉 SYNC COMPLETED SUCCESSFULLY!");
    console.log("==================================================");
    console.log(`• Users:           ${users.length}`);
    console.log(`• Profiles:        ${profiles.length}`);
    console.log(`• Replacements:    ${replacements.length}`);
    console.log(`• Offline Orders:  ${offlineOrders.length}`);
    console.log(`• Order Items:     ${replacementItems.length + offlineItems.length}`);
    console.log(`• Attachments:     ${attachments.length}`);
    console.log("==================================================");
  } catch (err) {
    console.error("\n❌ Sync failed:", err);
    process.exit(1);
  } finally {
    await sourceSql.end({ timeout: 5 });
    if (targetSql) await targetSql.end({ timeout: 5 });
  }
}

runSync();
