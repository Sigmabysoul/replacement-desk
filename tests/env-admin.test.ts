import { describe, expect, it, beforeEach, afterAll } from "vitest";
import {
  getEnvAdminConfig,
  syncAdminUserToDatabase,
  signInWithPassword,
} from "@/lib/auth/auth-service";
import { sql } from "@/lib/db";

const TEST_ADMIN_EMAIL = "testenvadmin@example.com";
const TEST_ADMIN_PASSWORD = "SuperAdminPassword123!";

describe("Environment Admin Credentials", () => {
  beforeEach(() => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_NAME;
  });

  afterAll(async () => {
    // Clean up test data
    try {
      const users = await sql`SELECT id FROM auth.users WHERE lower(email) = ${TEST_ADMIN_EMAIL}`;
      for (const u of users) {
        await sql`DELETE FROM public.profiles WHERE id = ${u.id}`;
        await sql`DELETE FROM auth.users WHERE id = ${u.id}`;
      }
    } catch {
      // Ignore if database is not available in pure unit test mode
    }
  });

  it("returns null when ADMIN_EMAIL or ADMIN_PASSWORD is not set", () => {
    expect(getEnvAdminConfig()).toBeNull();

    process.env.ADMIN_EMAIL = TEST_ADMIN_EMAIL;
    expect(getEnvAdminConfig()).toBeNull();

    delete process.env.ADMIN_EMAIL;
    process.env.ADMIN_PASSWORD = TEST_ADMIN_PASSWORD;
    expect(getEnvAdminConfig()).toBeNull();
  });

  it("reads admin configuration correctly when environment variables are set", () => {
    process.env.ADMIN_EMAIL = `  ${TEST_ADMIN_EMAIL.toUpperCase()}  `;
    process.env.ADMIN_PASSWORD = TEST_ADMIN_PASSWORD;
    process.env.ADMIN_NAME = "Lead Admin";

    const config = getEnvAdminConfig();
    expect(config).not.toBeNull();
    expect(config?.email).toBe(TEST_ADMIN_EMAIL);
    expect(config?.password).toBe(TEST_ADMIN_PASSWORD);
    expect(config?.name).toBe("Lead Admin");
  });

  it("creates and synchronizes admin user into postgres database", async () => {
    const { id } = await syncAdminUserToDatabase(
      TEST_ADMIN_EMAIL,
      TEST_ADMIN_PASSWORD,
      "Lead Admin"
    );
    expect(id).toBeDefined();

    // Verify user in auth.users
    const users = await sql`SELECT id, email FROM auth.users WHERE id = ${id}`;
    expect(users.length).toBe(1);
    expect(users[0].email).toBe(TEST_ADMIN_EMAIL);

    // Verify profile in public.profiles
    const profiles = await sql`SELECT id, full_name, role, roles, active FROM public.profiles WHERE id = ${id}`;
    expect(profiles.length).toBe(1);
    expect(profiles[0].role).toBe("ADMIN");
    expect(profiles[0].roles).toContain("ADMIN");
    expect(profiles[0].active).toBe(true);
    expect(profiles[0].full_name).toBe("Lead Admin");
  });

  it("logs in successfully with environment admin credentials", async () => {
    process.env.ADMIN_EMAIL = TEST_ADMIN_EMAIL;
    process.env.ADMIN_PASSWORD = TEST_ADMIN_PASSWORD;

    const result = await signInWithPassword(TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD);
    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    expect(result.data?.user.email).toBe(TEST_ADMIN_EMAIL);
    expect(result.data?.session.access_token).toBeDefined();
  });

  it("rejects login if password does not match", async () => {
    process.env.ADMIN_EMAIL = TEST_ADMIN_EMAIL;
    process.env.ADMIN_PASSWORD = TEST_ADMIN_PASSWORD;

    const result = await signInWithPassword(TEST_ADMIN_EMAIL, "WrongPassword999!");
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("Invalid login credentials.");
  });
});

