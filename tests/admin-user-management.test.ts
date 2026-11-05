import { describe, expect, it, afterAll } from "vitest";
import {
  adminCreateUser,
  adminUpdateUserById,
  adminDeleteUser,
  signInWithPassword,
} from "@/lib/auth/auth-service";
import { sql } from "@/lib/db";

const TEST_USER_EMAIL = "test_worker_mgmt@example.com";
const TEST_ADMIN_EMAIL = "test_reassign_admin@example.com";
const INITIAL_PASSWORD = "initialPassword123!";
const UPDATED_PASSWORD = "newUpdatedPassword456!";

describe("Admin User Management: Password Edit and User Deletion", () => {
  let createdUserId: string | null = null;
  let adminUserId: string | null = null;

  afterAll(async () => {
    try {
      if (createdUserId) {
        await sql`DELETE FROM public.profiles WHERE id = ${createdUserId}`;
        await sql`DELETE FROM auth.users WHERE id = ${createdUserId}`;
      }
      if (adminUserId) {
        await sql`DELETE FROM public.profiles WHERE id = ${adminUserId}`;
        await sql`DELETE FROM auth.users WHERE id = ${adminUserId}`;
      }
    } catch {
      // Ignore
    }
  });

  it("creates a test worker user", async () => {
    const { data, error } = await adminCreateUser({
      email: TEST_USER_EMAIL,
      password: INITIAL_PASSWORD,
      user_metadata: { full_name: "Test Worker" },
    });

    expect(error).toBeNull();
    expect(data?.user).toBeDefined();
    createdUserId = data!.user.id;

    // Create profile
    await sql`
      INSERT INTO public.profiles (id, full_name, role, roles, active)
      VALUES (${createdUserId}, 'Test Worker', 'PRINTING'::public.app_role, ARRAY['PRINTING']::public.app_role[], true)
      ON CONFLICT (id) DO NOTHING
    `;

    // Verify initial sign in works
    const login = await signInWithPassword(TEST_USER_EMAIL, INITIAL_PASSWORD);
    expect(login.error).toBeNull();
    expect(login.data?.user.id).toBe(createdUserId);
  });

  it("updates the worker's password and verifies login with new password", async () => {
    expect(createdUserId).toBeDefined();

    // Admin updates user password
    const updateResult = await adminUpdateUserById(createdUserId!, {
      password: UPDATED_PASSWORD,
    });
    expect(updateResult.error).toBeNull();

    // Old password should fail
    const oldLogin = await signInWithPassword(TEST_USER_EMAIL, INITIAL_PASSWORD);
    expect(oldLogin.error).not.toBeNull();

    // New password should succeed
    const newLogin = await signInWithPassword(TEST_USER_EMAIL, UPDATED_PASSWORD);
    expect(newLogin.error).toBeNull();
    expect(newLogin.data?.user.id).toBe(createdUserId);
  });

  it("deletes user and reassigns records cleanly", async () => {
    expect(createdUserId).toBeDefined();

    // Create a dummy admin to reassign records to
    const adminRes = await adminCreateUser({
      email: TEST_ADMIN_EMAIL,
      password: "AdminPassword123!",
      user_metadata: { full_name: "Admin Reassign Target" },
    });
    expect(adminRes.error).toBeNull();
    adminUserId = adminRes.data!.user.id;

    await sql`
      INSERT INTO public.profiles (id, full_name, role, roles, active)
      VALUES (${adminUserId}, 'Admin Reassign Target', 'ADMIN'::public.app_role, ARRAY['ADMIN']::public.app_role[], true)
      ON CONFLICT (id) DO NOTHING
    `;

    // Delete worker with reassignToId
    const deleteResult = await adminDeleteUser(createdUserId!, adminUserId);
    expect(deleteResult.error).toBeNull();

    // Verify worker no longer exists in auth.users or profiles
    const authCheck = await sql`SELECT id FROM auth.users WHERE id = ${createdUserId}`;
    expect(authCheck.length).toBe(0);

    const profileCheck = await sql`SELECT id FROM public.profiles WHERE id = ${createdUserId}`;
    expect(profileCheck.length).toBe(0);

    // Verify deleted worker cannot sign in
    const deletedLogin = await signInWithPassword(TEST_USER_EMAIL, UPDATED_PASSWORD);
    expect(deletedLogin.error).not.toBeNull();

    createdUserId = null;
  });
});
