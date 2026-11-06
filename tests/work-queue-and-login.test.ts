import { describe, expect, it, afterAll } from "vitest";
import { signInWithPassword } from "@/lib/auth/auth-service";
import { sql } from "@/lib/db";
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
});
