#!/usr/bin/env node
/**
 * Utility script to back up all storage files (photos, labels, PODs)
 * from Supabase Cloud to a local directory.
 *
 * Usage:
 *   node scripts/backup-storage.mjs [outputDir]
 *
 * Requirements:
 *   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in environment or .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(resolve(process.cwd(), ".env.production"));
loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("❌ Error: Missing Supabase credentials.");
  console.error("Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.\n");
  process.exit(1);
}

const targetDir = resolve(process.argv[2] || "./storage_backup");

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Recursively list all files in a bucket folder
async function listAllFiles(bucketName, folder = "") {
  let files = [];
  const { data, error } = await supabase.storage.from(bucketName).list(folder, {
    limit: 1000,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) {
    console.warn(`⚠️ Warning: Error listing ${bucketName}/${folder}:`, error.message);
    return files;
  }

  if (!data || data.length === 0) return files;

  for (const item of data) {
    const itemPath = folder ? `${folder}/${item.name}` : item.name;
    // In Supabase storage, folders usually have no id or metadata is null
    if (!item.id && !item.metadata) {
      const subFiles = await listAllFiles(bucketName, itemPath);
      files = files.concat(subFiles);
    } else {
      files.push(itemPath);
    }
  }

  return files;
}

async function main() {
  console.log("==================================================");
  console.log("📦 SUPABASE STORAGE BACKUP UTILITY");
  console.log("==================================================");
  console.log(`📡 Connecting to: ${supabaseUrl}`);
  console.log(`📁 Saving backup to: ${targetDir}\n`);

  mkdirSync(targetDir, { recursive: true });

  // 1. Fetch all buckets
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  if (bucketError) {
    console.error("❌ Failed to list buckets:", bucketError.message);
    process.exit(1);
  }

  if (!buckets || buckets.length === 0) {
    console.log("ℹ️ No storage buckets found.");
    return;
  }

  console.log(`Found ${buckets.length} bucket(s): ${buckets.map((b) => b.name).join(", ")}\n`);

  let totalDownloaded = 0;

  for (const bucket of buckets) {
    const bucketName = bucket.name;
    console.log(`📂 Inspecting bucket [${bucketName}]...`);

    const files = await listAllFiles(bucketName);
    console.log(`   Found ${files.length} file(s) in [${bucketName}]`);

    const bucketDir = join(targetDir, bucketName);
    mkdirSync(bucketDir, { recursive: true });

    for (const filePath of files) {
      process.stdout.write(`   ⬇️ Downloading: ${filePath}... `);
      const { data, error } = await supabase.storage.from(bucketName).download(filePath);
      if (error) {
        console.log(`❌ Failed: ${error.message}`);
        continue;
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      const localFilePath = join(bucketDir, filePath);
      const localDir = resolve(localFilePath, "..");
      mkdirSync(localDir, { recursive: true });
      writeFileSync(localFilePath, buffer);
      console.log(`✅ OK (${(buffer.length / 1024).toFixed(1)} KB)`);
      totalDownloaded++;
    }
    console.log("");
  }

  console.log("==================================================");
  console.log(`🎉 BACKUP COMPLETE! Downloaded ${totalDownloaded} file(s) into:`);
  console.log(`   ${targetDir}`);
  console.log("==================================================\n");
}

main().catch((err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});

