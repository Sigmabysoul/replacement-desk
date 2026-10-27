import { sql } from "@/lib/db";

export async function executeRpc<T = unknown>(
  funcName: string,
  params: Record<string, unknown> = {},
  activeUserId: string | null = null,
): Promise<{ data: T | null; error: { message: string } | null }> {
  try {
    const paramKeys = Object.keys(params);
    let queryStr = "";

    if (paramKeys.length === 0) {
      queryStr = `SELECT * FROM public.${funcName}()`;
    } else {
      const namedArgs = paramKeys
        .map((k) => {
          const val = params[k];
          let formattedVal = "NULL";
          if (val !== null && val !== undefined) {
            if (typeof val === "boolean" || typeof val === "number") {
              formattedVal = String(val);
            } else if (typeof val === "object") {
              formattedVal = `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
            } else {
              formattedVal = `'${String(val).replace(/'/g, "''")}'`;
            }
          }
          return `${k} => ${formattedVal}`;
        })
        .join(", ");

      queryStr = `SELECT * FROM public.${funcName}(${namedArgs})`;
    }

    const runRpc = async (executor: { unsafe: (q: string) => Promise<Record<string, unknown>[]> }) => {
      if (activeUserId) {
        await executor.unsafe(`SET LOCAL request.jwt.claim.sub = '${activeUserId.replace(/'/g, "''")}'`);
      }
      return await executor.unsafe(queryStr);
    };

    const rows = activeUserId
      ? await sql.begin((tx) => runRpc(tx))
      : await runRpc(sql);

    if (!rows || rows.length === 0) {
      return { data: null, error: null };
    }

    const firstRow = rows[0];
    const rowKeys = Object.keys(firstRow);

    // If function returns a single scalar value (e.g. get_next_order_number returning number, or funcName returning UUID)
    if (
      rowKeys.length === 1 &&
      (rowKeys[0] === funcName ||
        rowKeys[0].toLowerCase().includes(funcName.toLowerCase()) ||
        rowKeys[0] === "result")
    ) {
      return { data: firstRow[rowKeys[0]] as T, error: null };
    }

    if (rows.length === 1) {
      return { data: firstRow as unknown as T, error: null };
    }

    return { data: rows as unknown as T, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: { message } };
  }
}
