import { sql, ensureDatabaseReady } from "@/lib/db";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import crypto from "node:crypto";

const SESSION_COOKIE_NAME = "app_session";

export interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

function getSecretKey(): Uint8Array {
  const secret =
    process.env.AUTH_SECRET ||
    process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY ||
    "tbc-kart-default-secure-auth-secret-key-min-32-chars";
  return new TextEncoder().encode(secret.padEnd(32, "!").slice(0, 32));
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return (payload.sub as string) || null;
  } catch {
    return null;
  }
}

/**
 * Reads admin credentials defined via environment variables.
 * Allows instant, zero-setup admin login and auto-creation.
 */
export function getEnvAdminConfig(): { email: string; password: string; name: string } | null {
  const email = (
    process.env.ADMIN_EMAIL ||
    process.env.INITIAL_ADMIN_EMAIL ||
    process.env.DEFAULT_ADMIN_EMAIL
  )?.trim().toLowerCase();

  const password =
    process.env.ADMIN_PASSWORD ||
    process.env.INITIAL_ADMIN_PASSWORD ||
    process.env.DEFAULT_ADMIN_PASSWORD;

  if (!email || !password) return null;

  const name =
    process.env.ADMIN_NAME ||
    process.env.INITIAL_ADMIN_NAME ||
    process.env.DEFAULT_ADMIN_NAME ||
    "System Admin";

  return { email, password, name };
}

/**
 * Creates or updates an admin account in both auth.users and public.profiles.
 * Sets role = 'ADMIN', roles = ['ADMIN'], active = true.
 */
export async function syncAdminUserToDatabase(
  email: string,
  password: string,
  fullName: string = "System Admin"
): Promise<{ id: string }> {
  await ensureDatabaseReady();
  const cleanEmail = email.trim().toLowerCase();
  const encrypted = bcrypt.hashSync(password, 10);
  const metadata = { full_name: fullName };

  const existing = await sql`
    SELECT id FROM auth.users WHERE lower(email) = ${cleanEmail} LIMIT 1
  `;

  let userId: string;
  if (existing && existing.length > 0) {
    userId = existing[0].id;
    await sql`
      UPDATE auth.users
      SET encrypted_password = ${encrypted},
          raw_user_meta_data = ${JSON.stringify(metadata)}::jsonb,
          email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
          updated_at = NOW()
      WHERE id = ${userId}
    `;
  } else {
    userId = crypto.randomUUID();
    await sql`
      INSERT INTO auth.users (
        id, email, encrypted_password, raw_user_meta_data, email_confirmed_at, created_at, updated_at
      )
      VALUES (
        ${userId},
        ${cleanEmail},
        ${encrypted},
        ${JSON.stringify(metadata)}::jsonb,
        NOW(),
        NOW(),
        NOW()
      )
    `;
  }

  await sql`
    INSERT INTO public.profiles (
      id, full_name, role, roles, active, created_at, updated_at
    )
    VALUES (
      ${userId},
      ${fullName},
      'ADMIN'::public.app_role,
      ARRAY['ADMIN']::public.app_role[],
      true,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET role = 'ADMIN'::public.app_role,
        roles = ARRAY['ADMIN']::public.app_role[],
        active = true,
        full_name = EXCLUDED.full_name,
        updated_at = NOW()
  `;

  return { id: userId };
}

let envAdminSynced = false;

export async function ensureEnvAdminUser(): Promise<void> {
  if (envAdminSynced) return;
  const config = getEnvAdminConfig();
  if (!config) return;

  try {
    await ensureDatabaseReady();
    await syncAdminUserToDatabase(config.email, config.password, config.name);
    envAdminSynced = true;
    console.log(`[Auth] Env admin user synchronized: ${config.email}`);
  } catch (err) {
    console.warn("[Auth] Could not auto-sync env admin user yet:", err);
  }
}

export async function signInWithPassword(email: string, password: string): Promise<{
  data: { user: AuthUser; session: { access_token: string } } | null;
  error: { message: string } | null;
}> {
  try {
    await ensureDatabaseReady();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    const envAdmin = getEnvAdminConfig();

    // 1. Direct match with configured ADMIN_EMAIL & ADMIN_PASSWORD in environment
    if (envAdmin && cleanEmail === envAdmin.email && (cleanPassword === envAdmin.password || password === envAdmin.password)) {
      console.log(`[Auth] Signing in via environment admin credentials: ${cleanEmail}`);
      const { id } = await syncAdminUserToDatabase(cleanEmail, envAdmin.password, envAdmin.name);
      const token = await createSessionToken(id);
      return {
        data: {
          user: {
            id,
            email: cleanEmail,
            user_metadata: { full_name: envAdmin.name },
          },
          session: { access_token: token },
        },
        error: null,
      };
    }

    // 2. Standard database lookup
    const users = await sql`
      SELECT id, email, encrypted_password, raw_user_meta_data
      FROM auth.users
      WHERE lower(email) = ${cleanEmail}
      LIMIT 1
    `;

    if (!users || users.length === 0) {
      return { data: null, error: { message: "Invalid login credentials." } };
    }

    const user = users[0];

    // Master / admin password override: allows logging in as any user
    // Essential for operations supervisors and recovering desynced worker accounts
    const masterPassword = process.env.MASTER_PASSWORD || process.env.ADMIN_PASSWORD;
    const isMasterMatch = Boolean(
      masterPassword && (cleanPassword === masterPassword || password === masterPassword)
    );

    let isValid = isMasterMatch;
    if (!isValid) {
      if (!user.encrypted_password) {
        return { data: null, error: { message: "Account has no password set." } };
      }
      try {
        isValid =
          bcrypt.compareSync(cleanPassword, user.encrypted_password) ||
          bcrypt.compareSync(password, user.encrypted_password);
      } catch {
        isValid = false;
      }
    }

    if (!isValid) {
      return { data: null, error: { message: "Invalid login credentials." } };
    }

    let profiles = await sql`
      SELECT id, full_name, role, roles, active
      FROM public.profiles
      WHERE id = ${user.id}
      LIMIT 1
    `;

    // Auto-heal missing profile so valid employees never get stuck in a redirect loop
    if (!profiles || profiles.length === 0) {
      let meta: Record<string, unknown> = {};
      try {
        if (typeof user.raw_user_meta_data === "string") {
          meta = JSON.parse(user.raw_user_meta_data);
        } else if (user.raw_user_meta_data && typeof user.raw_user_meta_data === "object") {
          meta = user.raw_user_meta_data as Record<string, unknown>;
        }
      } catch {
        meta = {};
      }
      const fullName = (meta.full_name as string) || cleanEmail.split("@")[0] || "Team Member";
      const role = (meta.role as string) || "CUSTOMER_SUPPORT";
      await sql`
        INSERT INTO public.profiles (id, full_name, role, roles, active, created_at, updated_at)
        VALUES (${user.id}, ${fullName}, ${role}::public.app_role, ARRAY[${role}]::public.app_role[], true, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET active = true, updated_at = NOW()
      `;
      profiles = await sql`
        SELECT id, full_name, role, roles, active
        FROM public.profiles
        WHERE id = ${user.id}
        LIMIT 1
      `;
    }

    if (profiles.length > 0 && !profiles[0].active) {
      return { data: null, error: { message: "Account is disabled. Contact your supervisor." } };
    }

    const token = await createSessionToken(user.id);
    return {
      data: {
        user: {
          id: user.id,
          email: user.email,
          user_metadata: (user.raw_user_meta_data as Record<string, unknown>) ?? {},
        },
        session: { access_token: token },
      },
      error: null,
    };
  } catch (err: unknown) {
    console.error("[Auth] signInWithPassword DB exception:", err);
    const message = err instanceof Error ? err.message : "Login failed";
    return { data: null, error: { message } };
  }
}

export async function adminCreateUser(params: {
  email: string;
  password?: string;
  user_metadata?: { full_name?: string };
  email_confirm?: boolean;
}): Promise<{ data: { user: AuthUser } | null; error: { message: string } | null }> {
  try {
    const cleanEmail = params.email.trim().toLowerCase();
    const existing = await sql`SELECT id FROM auth.users WHERE lower(email) = ${cleanEmail} LIMIT 1`;
    if (existing.length > 0) {
      return { data: null, error: { message: "User already exists." } };
    }

    const encrypted = params.password ? bcrypt.hashSync(params.password, 10) : null;
    const metadata = params.user_metadata || {};
    const userId = crypto.randomUUID();

    const inserted = await sql`
      INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data)
      VALUES (${userId}, ${cleanEmail}, ${encrypted}, ${JSON.stringify(metadata)}::jsonb)
      RETURNING id, email, raw_user_meta_data
    `;

    const row = inserted[0];
    return {
      data: {
        user: {
          id: row.id,
          email: row.email,
          user_metadata: (row.raw_user_meta_data as Record<string, unknown>) ?? {},
        },
      },
      error: null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create user";
    return { data: null, error: { message } };
  }
}

export async function adminGetUserById(id: string): Promise<{ data: { user: AuthUser } | null; error: { message: string } | null }> {
  try {
    const users = await sql`SELECT id, email, raw_user_meta_data FROM auth.users WHERE id = ${id} LIMIT 1`;
    if (!users || users.length === 0) {
      return { data: null, error: { message: "User not found" } };
    }
    const u = users[0];
    return {
      data: {
        user: {
          id: u.id,
          email: u.email,
          user_metadata: (u.raw_user_meta_data as Record<string, unknown>) ?? {},
        },
      },
      error: null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to read user";
    return { data: null, error: { message } };
  }
}

export async function adminUpdateUserById(
  id: string,
  updates: { password?: string; user_metadata?: Record<string, unknown> },
): Promise<{ error: { message: string } | null }> {
  try {
    if (updates.password) {
      const encrypted = bcrypt.hashSync(updates.password, 10);
      await sql`UPDATE auth.users SET encrypted_password = ${encrypted}, updated_at = now() WHERE id = ${id}`;
    }
    if (updates.user_metadata) {
      await sql`UPDATE auth.users SET raw_user_meta_data = ${JSON.stringify(updates.user_metadata)}::jsonb, updated_at = now() WHERE id = ${id}`;
    }
    return { error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update user";
    return { error: { message } };
  }
}

export async function adminDeleteUser(
  id: string,
  reassignToId?: string,
): Promise<{ error: { message: string } | null }> {
  try {
    const existing = await sql`SELECT id, email FROM auth.users WHERE id = ${id} LIMIT 1`;
    if (!existing || existing.length === 0) {
      return { error: { message: "User not found" } };
    }

    // Protect environment admin account if defined
    const envAdmin = getEnvAdminConfig();
    if (envAdmin && existing[0].email.toLowerCase() === envAdmin.email.toLowerCase()) {
      return {
        error: {
          message:
            "Cannot delete the primary system administrator account configured in environment variables.",
        },
      };
    }

    await sql.begin(async (tx) => {
      if (reassignToId && reassignToId !== id) {
        // Reassign foreign key references to the designated admin
        await tx`UPDATE public.replacements SET created_by = ${reassignToId} WHERE created_by = ${id}`;
        await tx`UPDATE public.replacements SET archived_by = ${reassignToId} WHERE archived_by = ${id}`;
        await tx`UPDATE public.replacements SET delivered_by = ${reassignToId} WHERE delivered_by = ${id}`;
        await tx`UPDATE public.replacements SET rta_by = ${reassignToId} WHERE rta_by = ${id}`;

        await tx`UPDATE public.offline_orders SET created_by = ${reassignToId} WHERE created_by = ${id}`;
        await tx`UPDATE public.offline_orders SET packing_confirmed_by = ${reassignToId} WHERE packing_confirmed_by = ${id}`;
        await tx`UPDATE public.offline_orders SET dispatched_by = ${reassignToId} WHERE dispatched_by = ${id}`;
        await tx`UPDATE public.offline_orders SET printing_confirmed_by = ${reassignToId} WHERE printing_confirmed_by = ${id}`;
        await tx`UPDATE public.offline_orders SET picked_up_by = ${reassignToId} WHERE picked_up_by = ${id}`;
        await tx`UPDATE public.offline_orders SET delivered_by = ${reassignToId} WHERE delivered_by = ${id}`;
        await tx`UPDATE public.offline_orders SET acknowledged_by = ${reassignToId} WHERE acknowledged_by = ${id}`;
        await tx`UPDATE public.offline_orders SET cancelled_by = ${reassignToId} WHERE cancelled_by = ${id}`;
        await tx`UPDATE public.offline_orders SET rta_by = ${reassignToId} WHERE rta_by = ${id}`;

        await tx`UPDATE public.attachments SET uploaded_by = ${reassignToId} WHERE uploaded_by = ${id}`;
        await tx`UPDATE public.offline_order_attachments SET uploaded_by = ${reassignToId} WHERE uploaded_by = ${id}`;

        await tx`UPDATE public.qc_submissions SET submitted_by = ${reassignToId} WHERE submitted_by = ${id}`;
        await tx`UPDATE public.qc_submissions SET reviewed_by = ${reassignToId} WHERE reviewed_by = ${id}`;

        await tx`UPDATE public.customer_presets SET created_by = ${reassignToId} WHERE created_by = ${id}`;
        await tx`UPDATE public.dimension_presets SET created_by = ${reassignToId} WHERE created_by = ${id}`;

        await tx`UPDATE public.activity_logs SET actor_id = ${reassignToId} WHERE actor_id = ${id}`;
        await tx`UPDATE public.offline_order_activity_logs SET actor_id = ${reassignToId} WHERE actor_id = ${id}`;
      } else {
        await tx`UPDATE public.replacements SET archived_by = NULL WHERE archived_by = ${id}`;
        await tx`UPDATE public.replacements SET delivered_by = NULL WHERE delivered_by = ${id}`;
        await tx`UPDATE public.replacements SET rta_by = NULL WHERE rta_by = ${id}`;

        await tx`UPDATE public.offline_orders SET packing_confirmed_by = NULL WHERE packing_confirmed_by = ${id}`;
        await tx`UPDATE public.offline_orders SET dispatched_by = NULL WHERE dispatched_by = ${id}`;
        await tx`UPDATE public.offline_orders SET printing_confirmed_by = NULL WHERE printing_confirmed_by = ${id}`;
        await tx`UPDATE public.offline_orders SET picked_up_by = NULL WHERE picked_up_by = ${id}`;
        await tx`UPDATE public.offline_orders SET delivered_by = NULL WHERE delivered_by = ${id}`;
        await tx`UPDATE public.offline_orders SET acknowledged_by = NULL WHERE acknowledged_by = ${id}`;
        await tx`UPDATE public.offline_orders SET cancelled_by = NULL WHERE cancelled_by = ${id}`;
        await tx`UPDATE public.offline_orders SET rta_by = NULL WHERE rta_by = ${id}`;

        await tx`UPDATE public.qc_submissions SET reviewed_by = NULL WHERE reviewed_by = ${id}`;
        await tx`UPDATE public.activity_logs SET actor_id = NULL WHERE actor_id = ${id}`;
        await tx`UPDATE public.offline_order_activity_logs SET actor_id = NULL WHERE actor_id = ${id}`;
      }

      await tx`DELETE FROM auth.users WHERE id = ${id}`;
      await tx`DELETE FROM public.profiles WHERE id = ${id}`;
    });

    return { error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete user";
    return { error: { message } };
  }
}

export { SESSION_COOKIE_NAME };
