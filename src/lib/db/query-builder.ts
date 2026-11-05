import { sql } from "@/lib/db";

export interface QueryResult<T> {
  data: T | null;
  error: { message: string; details?: string; hint?: string; code?: string } | null;
  count: number | null;
}

export class QueryBuilder<T = Record<string, unknown>> implements PromiseLike<QueryResult<T>> {
  private tableName: string;
  private action: "select" | "insert" | "update" | "delete" = "select";
  private selectCols: string = "*";
  private selectOptions?: { count?: "exact" | "planned" | "estimated"; head?: boolean };
  private insertData: unknown = null;
  private updateData: Record<string, unknown> | null = null;
  private whereClauses: string[] = [];
  private orderClauses: string[] = [];
  private limitCount: number | null = null;
  private offsetCount: number | null = null;
  private isSingle: boolean = false;
  private isMaybeSingle: boolean = false;
  private activeUserId: string | null = null;

  constructor(tableName: string, activeUserId: string | null = null) {
    this.tableName = tableName;
    this.activeUserId = activeUserId;
  }

  select(
    columns: string = "*",
    options?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
  ): this {
    this.selectCols = columns;
    this.selectOptions = options;
    return this;
  }

  insert(data: unknown): this {
    this.action = "insert";
    this.insertData = data;
    return this;
  }

  update(data: Record<string, unknown>): this {
    this.action = "update";
    this.updateData = data;
    return this;
  }

  delete(): this {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: unknown): this {
    if (value === null || value === undefined) {
      this.whereClauses.push(`${this.tableName}.${column} IS NULL`);
    } else {
      this.whereClauses.push(`${this.tableName}.${column} = '${this.escape(value)}'`);
    }
    return this;
  }

  neq(column: string, value: unknown): this {
    if (value === null || value === undefined) {
      this.whereClauses.push(`${this.tableName}.${column} IS NOT NULL`);
    } else {
      this.whereClauses.push(`${this.tableName}.${column} != '${this.escape(value)}'`);
    }
    return this;
  }

  in(column: string, values: unknown[]): this {
    if (!values || values.length === 0) {
      this.whereClauses.push("1=0");
    } else {
      const list = values.map((v) => `'${this.escape(v)}'`).join(", ");
      this.whereClauses.push(`${this.tableName}.${column} IN (${list})`);
    }
    return this;
  }

  is(column: string, value: unknown): this {
    if (value === null) {
      this.whereClauses.push(`${this.tableName}.${column} IS NULL`);
    } else {
      this.whereClauses.push(`${this.tableName}.${column} IS ${String(value)}`);
    }
    return this;
  }

  ilike(column: string, pattern: string): this {
    this.whereClauses.push(`${this.tableName}.${column} ILIKE '${this.escape(pattern)}'`);
    return this;
  }

  gte(column: string, value: unknown): this {
    this.whereClauses.push(`${this.tableName}.${column} >= '${this.escape(value)}'`);
    return this;
  }

  lte(column: string, value: unknown): this {
    this.whereClauses.push(`${this.tableName}.${column} <= '${this.escape(value)}'`);
    return this;
  }

  gt(column: string, value: unknown): this {
    this.whereClauses.push(`${this.tableName}.${column} > '${this.escape(value)}'`);
    return this;
  }

  lt(column: string, value: unknown): this {
    this.whereClauses.push(`${this.tableName}.${column} < '${this.escape(value)}'`);
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    if (operator === "is" && value === null) {
      this.whereClauses.push(`${this.tableName}.${column} IS NOT NULL`);
    } else if (operator === "eq") {
      this.whereClauses.push(`${this.tableName}.${column} != '${this.escape(value)}'`);
    } else if (operator === "in" && Array.isArray(value)) {
      const list = value.map((v) => `'${this.escape(v)}'`).join(", ");
      this.whereClauses.push(`${this.tableName}.${column} NOT IN (${list})`);
    } else {
      this.whereClauses.push(`NOT (${this.tableName}.${column} ${operator} '${this.escape(value)}')`);
    }
    return this;
  }

  or(expr: string): this {
    const parts = this.splitOrExpressions(expr);
    const conditions: string[] = [];

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      if (trimmed.includes(".ilike.")) {
        const [col, ...rest] = trimmed.split(".ilike.");
        const val = rest.join(".ilike.");
        conditions.push(`${this.tableName}.${col} ILIKE '${this.escape(val)}'`);
      } else if (trimmed.includes(".eq.")) {
        const [col, ...rest] = trimmed.split(".eq.");
        const val = rest.join(".eq.");
        conditions.push(`${this.tableName}.${col} = '${this.escape(val)}'`);
      } else if (trimmed.includes(".in.(")) {
        const [col, ...rest] = trimmed.split(".in.(");
        const inside = rest.join(".in.(").replace(/\)$/, "");
        const vals = inside.split(",").map((v) => `'${this.escape(v.trim())}'`).join(", ");
        conditions.push(`${this.tableName}.${col} IN (${vals})`);
      } else {
        conditions.push(trimmed);
      }
    }

    if (conditions.length > 0) {
      this.whereClauses.push(`(${conditions.join(" OR ")})`);
    }
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    const dir = options?.ascending === false ? "DESC" : "ASC";
    this.orderClauses.push(`${this.tableName}.${column} ${dir}`);
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number): this {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }

  single(): this {
    this.isSingle = true;
    this.limitCount = 1;
    return this;
  }

  maybeSingle(): this {
    this.isMaybeSingle = true;
    this.limitCount = 1;
    return this;
  }

  private splitOrExpressions(str: string): string[] {
    const parts: string[] = [];
    let current = "";
    let parenDepth = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (char === "(") parenDepth++;
      else if (char === ")") parenDepth--;

      if (char === "," && parenDepth === 0) {
        parts.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    if (current) parts.push(current);
    return parts;
  }

  private escape(val: unknown): string {
    if (val === null || val === undefined) return "";
    return String(val).replace(/'/g, "''");
  }

  private parseSelectColumns(): string {
    let raw = this.selectCols.trim();

    if (raw.includes("items:replacement_items(")) {
      const match = raw.match(/items:replacement_items\(([^)]+)\)/);
      if (match) {
        const subquery = `(SELECT COALESCE(json_agg(json_build_object(${this.jsonBuildPairs(match[1], "ri")}) ORDER BY ri.position), '[]'::json) FROM public.replacement_items ri WHERE ri.replacement_id = ${this.tableName}.id) AS items`;
        raw = raw.replace(match[0], subquery);
      }
    }

    if (raw.includes("items:offline_order_items(")) {
      const match = raw.match(/items:offline_order_items\(([^)]+)\)/);
      if (match) {
        const subquery = `(SELECT COALESCE(json_agg(json_build_object(${this.jsonBuildPairs(match[1], "oi")}) ORDER BY oi.position), '[]'::json) FROM public.offline_order_items oi WHERE oi.offline_order_id = ${this.tableName}.id) AS items`;
        raw = raw.replace(match[0], subquery);
      }
    }

    return raw;
  }

  private jsonBuildPairs(fieldsStr: string, alias: string): string {
    return fieldsStr
      .split(",")
      .map((f) => f.trim())
      .map((f) => `'${f}', ${alias}.${f}`)
      .join(", ");
  }

  private formatValue(column: string, val: unknown): string {
    if (val === null || val === undefined) return "NULL";
    if (typeof val === "boolean" || typeof val === "number") return String(val);

    // PostgreSQL native array columns (e.g. profiles.roles: app_role[])
    if (column === "roles" || column === "allowedFields" || column === "visibleColumns") {
      if (Array.isArray(val)) {
        const escaped = val.map((item) => `"${String(item).replace(/"/g, '\\"')}"`).join(",");
        return `'${`{${escaped}}`}'`;
      }
      if (typeof val === "string") {
        return `'${this.escape(val)}'`;
      }
    }

    if (typeof val === "object") {
      return `'${this.escape(JSON.stringify(val))}'::jsonb`;
    }

    return `'${this.escape(val)}'`;
  }

  async execute(): Promise<QueryResult<T>> {
    try {
      const runQuery = async (executor: { unsafe: (q: string) => Promise<Record<string, unknown>[]> }) => {
        if (this.activeUserId) {
          await executor.unsafe(`SET LOCAL request.jwt.claim.sub = '${this.escape(this.activeUserId)}'`);
        }

        let queryStr = "";

        if (this.action === "select") {
          if (this.selectOptions?.head) {
            let countQuery = `SELECT count(*) as count FROM public.${this.tableName}`;
            if (this.whereClauses.length > 0) {
              countQuery += ` WHERE ${this.whereClauses.join(" AND ")}`;
            }
            const countRows = await executor.unsafe(countQuery);
            const countVal = countRows && countRows.length > 0 ? Number(countRows[0].count) : 0;
            return { data: null, count: countVal, error: null };
          }

          const columns = this.parseSelectColumns();
          queryStr = `SELECT ${columns} FROM public.${this.tableName}`;

          if (this.whereClauses.length > 0) {
            queryStr += ` WHERE ${this.whereClauses.join(" AND ")}`;
          }

          if (this.orderClauses.length > 0) {
            queryStr += ` ORDER BY ${this.orderClauses.join(", ")}`;
          }

          if (this.limitCount !== null) {
            queryStr += ` LIMIT ${this.limitCount}`;
          }

          if (this.offsetCount !== null) {
            queryStr += ` OFFSET ${this.offsetCount}`;
          }

          const rows = await executor.unsafe(queryStr);
          const countVal = rows ? rows.length : 0;

          if (this.isSingle) {
            if (!rows || rows.length === 0) {
              return { data: null, count: 0, error: { message: "No rows found" } };
            }
            return { data: rows[0] as unknown as T, count: 1, error: null };
          }

          if (this.isMaybeSingle) {
            return { data: (rows && rows.length > 0 ? rows[0] : null) as unknown as T, count: rows?.length ?? 0, error: null };
          }

          return { data: rows as unknown as T, count: countVal, error: null };
        }

        if (this.action === "insert") {
          const rawItems = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
          const items = rawItems as Record<string, unknown>[];
          if (items.length === 0) {
            return { data: [] as unknown as T, count: 0, error: null };
          }

          const columns = Object.keys(items[0]);
          const colsFormatted = columns.map((c) => `"${c}"`).join(", ");

          const valuesClauses = items.map((item) => {
            const vals = columns.map((col) => this.formatValue(col, item[col]));
            return `(${vals.join(", ")})`;
          });

          queryStr = `INSERT INTO public.${this.tableName} (${colsFormatted}) VALUES ${valuesClauses.join(", ")} RETURNING *`;
          const rows = await executor.unsafe(queryStr);

          if (this.isSingle) {
            return { data: rows[0] as unknown as T, count: 1, error: null };
          }
          return { data: (Array.isArray(this.insertData) ? rows : rows[0]) as unknown as T, count: rows.length, error: null };
        }

        if (this.action === "update") {
          const updateObj = this.updateData ?? {};
          const keys = Object.keys(updateObj);
          if (keys.length === 0) {
            return { data: null, count: 0, error: null };
          }

          const setClauses = keys.map((key) => {
            return `"${key}" = ${this.formatValue(key, updateObj[key])}`;
          });

          queryStr = `UPDATE public.${this.tableName} SET ${setClauses.join(", ")}`;
          if (this.whereClauses.length > 0) {
            queryStr += ` WHERE ${this.whereClauses.join(" AND ")}`;
          }
          queryStr += " RETURNING *";

          const rows = await executor.unsafe(queryStr);
          if (this.isSingle) {
            return { data: (rows[0] || null) as unknown as T, count: rows.length, error: null };
          }
          return { data: rows as unknown as T, count: rows.length, error: null };
        }

        if (this.action === "delete") {
          queryStr = `DELETE FROM public.${this.tableName}`;
          if (this.whereClauses.length > 0) {
            queryStr += ` WHERE ${this.whereClauses.join(" AND ")}`;
          }
          queryStr += " RETURNING *";

          const rows = await executor.unsafe(queryStr);
          return { data: rows as unknown as T, count: rows.length, error: null };
        }

        return { data: null, count: null, error: { message: "Unknown query action" } };
      };

      if (this.activeUserId) {
        return await sql.begin((tx) => runQuery(tx));
      }
      return await runQuery(sql);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        data: null,
        count: null,
        error: { message },
      };
    }
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}
