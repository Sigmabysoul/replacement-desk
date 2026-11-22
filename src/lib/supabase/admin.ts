import "server-only";
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
  adminCreateUser,
  adminGetUserById,
  adminUpdateUserById,
  adminDeleteUser,
} from "@/lib/auth/auth-service";
import { sql } from "@/lib/db";

/**
 * Creates an administrative database and storage client for server-side management.
 * Connects directly to vanilla PostgreSQL with full table and storage access.
 */
export function createAdminClient() {
  return {
    from: <T = Record<string, unknown>>(tableName: string) => new QueryBuilder<T>(tableName, null),

    rpc: <T = unknown>(funcName: string, params: Record<string, unknown> = {}) =>
      executeRpc<T>(funcName, params, null),

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
          if (error) return { data: null, error: { message: error.message } };

          try {
            await sql`
              DELETE FROM storage.objects WHERE bucket_id = ${bucket} AND name = ${path}
            `;
            await sql`
              INSERT INTO storage.objects (
                id, bucket_id, name, owner, owner_id, metadata, created_at, updated_at
              ) VALUES (
                gen_random_uuid(),
                ${bucket},
                ${path},
                NULL,
                NULL,
                ${JSON.stringify({
                  size: buffer.length,
                  mimetype: options?.contentType || "application/octet-stream",
                })}::jsonb,
                NOW(),
                NOW()
              )
            `;
          } catch (dbErr: unknown) {
            console.error(`[Storage] Failed to record storage object in database for ${bucket}/${path}:`, dbErr);
          }

          return { data: { path }, error: null };
        },

        remove: async (paths: string[]) => {
          const { error } = await removeFiles(bucket, paths);
          if (error) return { data: null, error: { message: error.message } };
          try {
            if (paths.length > 0) {
              await sql`
                DELETE FROM storage.objects WHERE bucket_id = ${bucket} AND name = ANY(${paths})
              `;
            }
          } catch (dbErr: unknown) {
            console.error(`[Storage] Failed to delete storage objects from database:`, dbErr);
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

        getPublicUrl: (path: string) => ({
          data: { publicUrl: getFileUrl(bucket, path) },
        }),
      }),
    },

    auth: {
      admin: {
        createUser: adminCreateUser,
        getUserById: adminGetUserById,
        updateUserById: adminUpdateUserById,
        deleteUser: adminDeleteUser,
      },
    },
  };
}
