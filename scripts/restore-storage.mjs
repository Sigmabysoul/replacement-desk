#!/usr/bin/env node
/**
 * Utility script to restore/upload all backed-up storage files (photos, labels, PODs)
 * from a local directory into a target Supabase instance (e.g. your VPS).
 *
 * Usage:
 *   node scripts/restore-storage.mjs <targetSupabaseUrl> <targetServiceRoleKey> [backupDir]
 *
 * Example:
 *   node scripts/restore-storage.mjs https://api.yourdomain.com your-new-service-key ./storage_backup
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const [, , targetUrlArg, targetKeyArg, backupDirArg] = process.argv;

const targetUrl = targetUrlArg || process.env.TARGET_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const targetKey = targetKeyArg || process.env.TARGET_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const backupDir = resolve(backupDirArg || "./storage_backup");

if (!targetUrl || !targetKey) {
  console.error("\n❌ Error: Missing target Supabase credentials.\n");
  console.log("Usage:\n  node scripts/restore-storage.mjs <targetSupabaseUrl> <targetServiceRoleKey> [backupDir]\n");
  console.log("Example:\n  node scripts/restore-storage.mjs https://supabase-api.yourvps.com eyJhb... ./storage_backup\n");
  process.exit(1);
}

if (!existsSync(backupDir)) {
  console.error(`\n❌ Error: Backup directory not found at: ${backupDir}`);
  console.error("Run `npm run backup-storage` first to download files from Supabase Cloud.\n");
  process.exit(1);
}

const supabase = createClient(targetUrl, targetKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Recursively find all files in a local directory
function getAllFilesLocally(dir, fileList = []) {
  const items = readdirSync(dir);
  for (const item of items) {
    const fullPath = join(dir, item);
    if (statSync(fullPath).isDirectory()) {
      getAllFilesLocally(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

// Simple MIME detection
function getMimeType(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

async function main() {
  console.log("==================================================");
  console.log("🚀 SUPABASE STORAGE RESTORE UTILITY");
  console.log("==================================================");
  console.log(`📡 Target Supabase URL: ${targetUrl}`);
  console.log(`📁 Source Backup Dir:   ${backupDir}\n`);

  // Buckets are top-level directories in backupDir
  const bucketDirs = readdirSync(backupDir).filter((item) =>
    statSync(join(backupDir, item)).isDirectory()
  );

  if (bucketDirs.length === 0) {
    console.log("ℹ️ No bucket folders found in backup directory.");
    return;
  }

  // Ensure target buckets exist
  const { data: existingBuckets, error: listBucketsError } = await supabase.storage.listBuckets();
  if (listBucketsError) {
    console.error("❌ Failed to list buckets on target Supabase:", listBucketsError.message);
    process.exit(1);
  }

  const existingBucketNames = new Set((existingBuckets || []).map((b) => b.name));

  for (const bucketName of bucketDirs) {
    if (!existingBucketNames.has(bucketName)) {
      console.log(`✨ Creating bucket [${bucketName}] on target Supabase...`);
      const { error: createBucketError } = await supabase.storage.createBucket(bucketName, {
        public: false,
        fileSizeLimit: 26214400, // 25MB
      });
      if (createBucketError) {
        console.warn(`⚠️ Warning: Could not create bucket [${bucketName}]:`, createBucketError.message);
      }
    }
  }

  let totalUploaded = 0;

  for (const bucketName of bucketDirs) {
    const localBucketDir = join(backupDir, bucketName);
    const localFiles = getAllFilesLocally(localBucketDir);

    console.log(`\n📂 Restoring bucket [${bucketName}] (${localFiles.length} files)...`);

    for (const fullPath of localFiles) {
      const storagePath = relative(localBucketDir, fullPath).replace(/\\/g, "/");
      const fileBuffer = readFileSync(fullPath);
      const contentType = getMimeType(fullPath);

      process.stdout.write(`   ⬆️ Uploading: ${storagePath}... `);

      const { error: uploadError } = await supabase.storage.from(bucketName).upload(storagePath, fileBuffer, {
        contentType,
        upsert: true,
      });

      if (uploadError) {
        console.log(`❌ Failed: ${uploadError.message}`);
      } else {
        console.log(`✅ OK (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
        totalUploaded++;
      }
    }
  }

  console.log("\n==================================================");
  console.log(`🎉 RESTORE COMPLETE! Uploaded ${totalUploaded} file(s) into:`);
  console.log(`   ${targetUrl}`);
  console.log("==================================================\n");
}

main().catch((err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});

