import "server-only";
import { cookies } from "next/headers";
import { QueryBuilder } from "@/lib/db/query-builder";
import { executeRpc } from "@/lib/db/rpc";
import {
  uploadFile,
  removeFiles,
  createSignedUrl,
  createSignedUrls,
  getFileUrl,
} from "@/lib/storage";
import {
  signInWithPassword,
  verifySessionToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/auth-service";
import { sql } from "@/lib/db";
import bcrypt from "bcryptjs";

/**
 * Checks whether database is configured.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL || (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
}

/**
 * Creates a server-side PostgreSQL client compatible with the Supabase client interface.
 * Connects directly to vanilla PostgreSQL and local file storage with zero external services.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const activeUserId = sessionToken ? await verifySessionToken(sessionToken) : null;

  return {
    from: <T = Record<string, unknown>>(tableName: string) => new QueryBuilder<T>(tableName, activeUserId),

    rpc: <T = unknown>(funcName: string, params: Record<string, unknown> = {}) =>
      executeRpc<T>(funcName, params, activeUserId),

    storage: {
      from: (bucket: string) => ({
        upload: async (
          path: string,
          file: File | Blob | Buffer | Uint8Array | ArrayBuffer,
          options?: { contentType?: string; upsert?: boolean },
        ) => {
          void options;
          let buffer: Buffer;

          if (
            file instanceof Blob ||
            (typeof file === "object" &&
              file !== null &&
              "arrayBuffer" in file &&
              typeof (file as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer === "function")
          ) {
            const ab = await (file as Blob).arrayBuffer();
            buffer = Buffer.from(ab);
          } else if (Buffer.isBuffer(file)) {
            buffer = file;
          } else {
            buffer = Buffer.from(file as ArrayBuffer);
          }

          const { error } = await uploadFile(bucket, path, buffer);
          if (error) {
            return { data: null, error: { message: error.message } };
          }
          return { data: { path }, error: null };
        },

        remove: async (paths: string[]) => {
          const { error } = await removeFiles(bucket, paths);
          if (error) {
            return { data: null, error: { message: error.message } };
          }
          return { data: null, error: null };
        },

        createSignedUrl: async (path: string, expiresIn?: number) => {
          void expiresIn;
          return createSignedUrl(bucket, path);
        },

        createSignedUrls: async (paths: string[], expiresIn?: number) => {
          void expiresIn;
          return createSignedUrls(bucket, paths);
        },

        getPublicUrl: (path: string) => {
          return { data: { publicUrl: getFileUrl(bucket, path) } };
        },
      }),
    },

    auth: {
      getUser: async () => {
        if (!activeUserId) {
          return { data: { user: null }, error: { message: "No active session" } };
        }
        try {
          const users = await sql`
            SELECT id, email, raw_user_meta_data
            FROM auth.users
            WHERE id = ${activeUserId}
            LIMIT 1
          `;
          if (!users || users.length === 0) {
            return { data: { user: null }, error: { message: "User not found" } };
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
          const message = err instanceof Error ? err.message : "DB error";
          return { data: { user: null }, error: { message } };
        }
      },

      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        const result = await signInWithPassword(email, password);
        if (result.error || !result.data) {
          return { data: { user: null, session: null }, error: result.error };
        }
        cookieStore.set(SESSION_COOKIE_NAME, result.data.session.access_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 30 * 24 * 60 * 60,
          path: "/",
        });
        return { data: result.data, error: null };
      },

      signOut: async () => {
        cookieStore.delete(SESSION_COOKIE_NAME);
        return { error: null };
      },

      updateUser: async ({ password }: { password?: string }) => {
        if (!activeUserId) {
          return { error: { message: "Not logged in" } };
        }
        if (password) {
          const encrypted = bcrypt.hashSync(password, 10);
          await sql`UPDATE auth.users SET encrypted_password = ${encrypted}, updated_at = now() WHERE id = ${activeUserId}`;
        }
        return { error: null };
      },
    },
  };
}
