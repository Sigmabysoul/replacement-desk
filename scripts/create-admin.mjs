#!/usr/bin/env node
/**
 * Utility script to create or update an Admin user in the PostgreSQL database.
 *
 * Usage:
 *   node scripts/create-admin.mjs <email> <password> [fullName]
 *
 * Example:
 *   DATABASE_URL="postgres://postgres:pass@localhost:5432/postgres" node scripts/create-admin.mjs admin@example.com Secret123 "System Admin"
 */

import postgres from "postgres";
import bcrypt from "bcryptjs";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "node:crypto";

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

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const email = process.argv[2];
const password = process.argv[3];
const fullName = process.argv[4] || "Administrator";
const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/replacement_desk";

if (!email || !password) {
  console.log(`
Usage:
  node scripts/create-admin.mjs <email> <password> [fullName]

Example:
  node scripts/create-admin.mjs admin@example.com AdminPass123 "Admin User"
`);
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 1 });

async function main() {
  console.log(`Connecting to database at ${dbUrl.replace(/:[^:@]+@/, ":***@")}...`);

  try {
    // 1. Check if auth.users table exists
    const [tableCheck] = await sql`
      SELECT to_regclass('auth.users') as exists;
    `;
    if (!tableCheck || !tableCheck.exists) {
      console.error("❌ Error: 'auth.users' table does not exist. Please apply 'db/schema.sql' first.");
      process.exit(1);
    }

    const cleanEmail = email.trim().toLowerCase();
    const encrypted = bcrypt.hashSync(password, 10);
    const metadata = { full_name: fullName };

    // 2. Check if user already exists in auth.users
    const existing = await sql`SELECT id FROM auth.users WHERE lower(email) = ${cleanEmail}`;

    let userId;
    if (existing.length > 0) {
      userId = existing[0].id;
      console.log(`Updating existing user ${cleanEmail} (ID: ${userId})...`);
      await sql`
        UPDATE auth.users
        SET encrypted_password = ${encrypted},
            raw_user_meta_data = ${JSON.stringify(metadata)}::jsonb,
            updated_at = NOW()
        WHERE id = ${userId}
      `;
    } else {
      userId = crypto.randomUUID();
      console.log(`Creating new user ${cleanEmail} (ID: ${userId})...`);
      await sql`
        INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
        VALUES (${userId}, ${cleanEmail}, ${encrypted}, ${JSON.stringify(metadata)}::jsonb, NOW(), NOW(), NOW())
      `;
    }

    // 3. Upsert profile in public.profiles
    console.log(`Ensuring profile has ADMIN role and active status...`);
    await sql`
      INSERT INTO public.profiles (id, full_name, role, roles, active, updated_at)
      VALUES (${userId}, ${fullName}, 'ADMIN', ARRAY['ADMIN']::public.app_role[], true, NOW())
      ON CONFLICT (id) DO UPDATE
      SET role = 'ADMIN',
          roles = ARRAY['ADMIN']::public.app_role[],
          active = true,
          full_name = EXCLUDED.full_name,
          updated_at = NOW()
    `;

    console.log(`
==================================================
✅ ADMIN USER READY!
Email:    ${cleanEmail}
Password: ${password}
Role:     ADMIN
ID:       ${userId}
==================================================
You can now log in at /login with these credentials!
`);
  } catch (err) {
    console.error("❌ Failed to create admin user:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
