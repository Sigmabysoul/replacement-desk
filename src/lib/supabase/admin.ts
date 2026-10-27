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
          return { data: { path }, error: null };
        },

        remove: async (paths: string[]) => {
          const { error } = await removeFiles(bucket, paths);
          if (error) return { data: null, error: { message: error.message } };
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
