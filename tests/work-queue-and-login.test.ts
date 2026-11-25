import { describe, expect, it, afterAll } from "vitest";
import { signInWithPassword, adminGetUserById } from "@/lib/auth/auth-service";
import { sql, ensureDatabaseReady } from "@/lib/db";
import { executeRpc } from "@/lib/db/rpc";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";

describe("Login and Work Queue Verification", () => {
  const TEST_WORKER_EMAIL = `worker_${Date.now()}@example.com`;
  const WORKER_PASSWORD = "WorkerSecret123!";
  const MASTER_PASSWORD = "MasterOverridePassword999!";
  let workerUserId: string | null = null;

  afterAll(async () => {
    try {
      if (workerUserId) {
        await sql`DELETE FROM public.profiles WHERE id = ${workerUserId}`;
        await sql`DELETE FROM auth.users WHERE id = ${workerUserId}`;
      }
    } catch {
      // Ignore
    }
  });

  it("auto-heals a missing public.profiles record when auth.users logs in", async () => {
    workerUserId = crypto.randomUUID();
    const encrypted = bcrypt.hashSync(WORKER_PASSWORD, 10);
    const meta = { full_name: "Auto Healed Worker", role: "PRINTING" };

    // Insert into auth.users without creating a public.profiles row
    await sql`
      INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
      VALUES (${workerUserId}, ${TEST_WORKER_EMAIL}, ${encrypted}, ${JSON.stringify(meta)}::jsonb, NOW(), NOW(), NOW())
    `;

    // Delete profile to simulate desynced or missing profile
    await sql`DELETE FROM public.profiles WHERE id = ${workerUserId}`;
    const initialProfiles = await sql`SELECT id FROM public.profiles WHERE id = ${workerUserId}`;
    expect(initialProfiles.length).toBe(0);

    // Sign in should detect missing profile and auto-heal it
    const login = await signInWithPassword(TEST_WORKER_EMAIL, WORKER_PASSWORD);
    expect(login.error).toBeNull();
    expect(login.data?.user.id).toBe(workerUserId);

    // Verify profile was created and has active=true
    const healedProfiles = await sql`SELECT id, full_name, role, active FROM public.profiles WHERE id = ${workerUserId}`;
    expect(healedProfiles.length).toBe(1);
    expect(healedProfiles[0].full_name).toBe("Auto Healed Worker");
    expect(healedProfiles[0].active).toBe(true);
  });

  it("authenticates worker using MASTER_PASSWORD override", async () => {
    process.env.MASTER_PASSWORD = MASTER_PASSWORD;

    const loginWithMaster = await signInWithPassword(TEST_WORKER_EMAIL, MASTER_PASSWORD);
    expect(loginWithMaster.error).toBeNull();
    expect(loginWithMaster.data?.user.id).toBe(workerUserId);

    delete process.env.MASTER_PASSWORD;
  });

  it("rejects login when password does not match and master password is not provided", async () => {
    const failedLogin = await signInWithPassword(TEST_WORKER_EMAIL, "WrongPasswordTotally!");
    expect(failedLogin.data).toBeNull();
    expect(failedLogin.error?.message).toBe("Invalid login credentials.");
  });

  it("verifies 1-hour interval calculations for notifications", () => {
    const ONE_HOUR = 60 * 60 * 1000;
    const now = Date.now();
    const alertTimeOld = now - (65 * 60 * 1000); // 65 minutes ago
    const alertTimeRecent = now - (15 * 60 * 1000); // 15 minutes ago

    expect(now - alertTimeOld >= ONE_HOUR).toBe(true);
    expect(now - alertTimeRecent >= ONE_HOUR).toBe(false);
  });

  it("safely handles serialized string metadata in adminGetUserById without enumerating characters", async () => {
    const serializedUserId = crypto.randomUUID();
    const metaStr = JSON.stringify({ full_name: "String Metadata Worker", department: "Warehouse" });
    await sql`
      INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
      VALUES (${serializedUserId}, ${`str_${Date.now()}@example.com`}, 'hash', ${metaStr}::jsonb, NOW(), NOW(), NOW())
    `;

    try {
      const { data, error } = await adminGetUserById(serializedUserId);
      expect(error).toBeNull();
      expect(data?.user.user_metadata).toEqual({ full_name: "String Metadata Worker", department: "Warehouse" });

      // Spreading user_metadata must not enumerate string indexes
      const merged = { ...data?.user.user_metadata, full_name: "Updated Worker" };
      expect(merged.full_name).toBe("Updated Worker");
      expect((merged as Record<string, unknown>)["0"]).toBeUndefined();
    } finally {
      await sql`DELETE FROM auth.users WHERE id = ${serializedUserId}`;
    }
  });

  it("authorizes a multi-role worker (primary: PRINTING, secondary: PACKING) to submit QC photos", async () => {
    await ensureDatabaseReady();

    const multiRoleUserId = crypto.randomUUID();
    const orderId = crypto.randomUUID();
    const submissionId = crypto.randomUUID();
    const photoPath = `replacements/${orderId}/packing/${submissionId}/photos/test-qc.jpg`;

    try {
      // 1. Create worker with primary role PRINTING and roles array ['PRINTING', 'PACKING']
      await sql`
        INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
        VALUES (${multiRoleUserId}, ${`multirole_${Date.now()}@example.com`}, 'hash', NOW(), NOW(), NOW())
      `;
      await sql`
        INSERT INTO public.profiles (id, full_name, role, roles, active, created_at, updated_at)
        VALUES (${multiRoleUserId}, 'Dual Role Worker', 'PRINTING'::public.app_role, ARRAY['PRINTING'::public.app_role, 'PACKING'::public.app_role], true, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, roles = EXCLUDED.roles
      `;

      // 2. Create order at LABEL_PRINTED status
      await sql`
        INSERT INTO public.replacements (id, replacement_number, order_reference, product_name, quantity, status, created_by, created_at, updated_at)
        VALUES (${orderId}, 'REP-TEST-DUAL', 'REF-TEST-DUAL', 'Test Product', 1, 'LABEL_PRINTED', ${multiRoleUserId}, NOW(), NOW())
      `;

      // 3. Insert fake label attachment so QC prerequisite is satisfied
      const labelPath = `replacements/${orderId}/logistics/label.pdf`;
      await sql`
        INSERT INTO storage.objects (id, bucket_id, name, owner_id, metadata, created_at, updated_at)
        VALUES (gen_random_uuid(), 'replacement-files', ${labelPath}, ${multiRoleUserId}, '{"size":100}'::jsonb, NOW(), NOW())
      `;
      await sql`
        INSERT INTO public.attachments (id, replacement_id, attachment_type, storage_path, file_name, mime_type, uploaded_by, created_at)
        VALUES (gen_random_uuid(), ${orderId}, 'LABEL', ${labelPath}, 'label.pdf', 'application/pdf', ${multiRoleUserId}, NOW())
      `;

      // 4. Insert QC photo storage object owned by worker
      await sql`
        INSERT INTO storage.objects (id, bucket_id, name, owner_id, metadata, created_at, updated_at)
        VALUES (gen_random_uuid(), 'replacement-files', ${photoPath}, ${multiRoleUserId}, '{"size":100}'::jsonb, NOW(), NOW())
      `;

      // 5. Worker invokes submit_packing_qc as activeUserId
      const attachments = [
        {
          storage_path: photoPath,
          file_name: "test-qc.jpg",
          mime_type: "image/jpeg",
        },
      ];

      const { data, error } = await executeRpc(
        "submit_packing_qc",
        {
          p_replacement_id: orderId,
          p_submission_id: submissionId,
          p_attachments: attachments,
        },
        multiRoleUserId
      );

      // Must succeed without 'Only Packing can submit QC photos' error!
      expect(error).toBeNull();
      expect(data).toBeDefined();

      const [updatedOrder] = await sql`SELECT status FROM public.replacements WHERE id = ${orderId}`;
      expect(updatedOrder.status).toBe("QC_PENDING");
    } finally {
      await sql`DELETE FROM public.attachments WHERE replacement_id = ${orderId}`;
      await sql`DELETE FROM public.qc_submissions WHERE replacement_id = ${orderId}`;
      await sql`DELETE FROM public.activity_logs WHERE replacement_id = ${orderId}`;
      await sql`DELETE FROM public.replacements WHERE id = ${orderId}`;
      await sql`DELETE FROM storage.objects WHERE bucket_id = 'replacement-files' AND name IN (${photoPath}, ${`replacements/${orderId}/logistics/label.pdf`})`;
      await sql`DELETE FROM public.profiles WHERE id = ${multiRoleUserId}`;
      await sql`DELETE FROM auth.users WHERE id = ${multiRoleUserId}`;
    }
  });
});
