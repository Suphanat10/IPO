import { Pool } from "pg";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

const DB_QUERY_RETRIES = Number(process.env.DB_QUERY_RETRIES ?? 2);
const DB_RETRY_BASE_DELAY_MS = Number(process.env.DB_RETRY_BASE_DELAY_MS ?? 250);

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      allowExitOnIdle: true,
      ssl: process.env.DATABASE_URL.includes("supabase.com")
        ? { rejectUnauthorized: false }
        : undefined,
    })
  : new Pool({
      host: process.env.POSTGRES_HOST || "localhost",
      port: Number(process.env.POSTGRES_PORT) || 5432,
      database: process.env.POSTGRES_DB || "postgres",
      user: process.env.POSTGRES_USER || "postgres",
      password: process.env.POSTGRES_PASSWORD || "",
      max: 10,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
    });

pool.on("error", (err) => {
  console.error("[db] Idle client error:", err.message);
});

export default pool;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableConnectionError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  if ([
    "ENOTFOUND",
    "EAI_AGAIN",
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "57P01",
    "57P02",
    "57P03",
  ].includes(code)) return true;
  const msg = "message" in error ? String(error.message) : "";
  return /Connection terminated|terminating connection/i.test(msg);
}

function describeDbTarget() {
  if (process.env.DATABASE_URL) {
    try {
      const parsed = new URL(process.env.DATABASE_URL);
      return parsed.hostname;
    } catch {
      return "DATABASE_URL";
    }
  }
  return process.env.POSTGRES_HOST || "localhost";
}

export function isDatabaseConfigured(): boolean {
  return !!(
    process.env.DATABASE_URL ||
    (process.env.POSTGRES_HOST && process.env.POSTGRES_DB)
  );
}

const READ_ONLY_PREFIX = /^(?:select|explain|show|values|table)\b/i;

/**
 * Best-effort read-only detection so we only auto-retry statements that are
 * safe to run more than once. A connection can drop *after* the server applied
 * a write but *before* we receive the ack; retrying that write would duplicate
 * its side effects. So writes (INSERT/UPDATE/DELETE, or CTEs that wrap them)
 * are not retried unless the caller opts in via `{ retry: true }` because it
 * knows the statement is idempotent (e.g. an upsert).
 */
function isReadOnlyStatement(text: string): boolean {
  // Strip leading line/block comments and whitespace before sniffing the verb.
  const sql = text.replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)+/, "");
  if (READ_ONLY_PREFIX.test(sql)) return true;
  // A CTE is read-only only when none of its parts perform DML.
  if (/^with\b/i.test(sql)) return !/\b(?:insert|update|delete|merge)\b/i.test(sql);
  return false;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
  opts?: { retry?: boolean },
): Promise<T[]> {
  const maxRetries = (opts?.retry ?? isReadOnlyStatement(text)) ? DB_QUERY_RETRIES : 0;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result: QueryResult<T> = await pool.query(text, params);
      return result.rows;
    } catch (error) {
      lastError = error;
      if (!isRetryableConnectionError(error) || attempt >= maxRetries) {
        throw error;
      }

      const delay = DB_RETRY_BASE_DELAY_MS * (attempt + 1);
      console.warn(
        `Database connection retry ${attempt + 1}/${maxRetries} for ${describeDbTarget()}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await sleep(delay);
    }
  }
  throw lastError;
}

export function buildInsert(
  table: string,
  data: Record<string, unknown>,
): { text: string; values: unknown[] } {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  const columns = entries.map(([k]) => `"${k}"`);
  const placeholders = entries.map((_, i) => `$${i + 1}`);
  const values = entries.map(([, v]) => v);
  return {
    text: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`,
    values,
  };
}

export function buildInsertReturning(
  table: string,
  data: Record<string, unknown>,
  returning: string,
): { text: string; values: unknown[] } {
  const { text, values } = buildInsert(table, data);
  return { text: `${text} RETURNING ${returning}`, values };
}

export function buildUpdate(
  table: string,
  data: Record<string, unknown>,
  where: string,
  whereValues: unknown[],
): { text: string; values: unknown[] } {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  const offset = whereValues.length;
  const setClauses = entries.map(([k], i) => `"${k}" = $${offset + i + 1}`);
  const values = [...whereValues, ...entries.map(([, v]) => v)];
  return {
    text: `UPDATE ${table} SET ${setClauses.join(", ")} WHERE ${where}`,
    values,
  };
}

export function buildUpdateReturning(
  table: string,
  data: Record<string, unknown>,
  where: string,
  whereValues: unknown[],
  returning: string,
): { text: string; values: unknown[] } {
  const { text, values } = buildUpdate(table, data, where, whereValues);
  return { text: `${text} RETURNING ${returning}`, values };
}

export type TransactionClient = PoolClient;

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    // Rolling back is itself most likely to fail when the connection is dead —
    // swallow that so the original error (the real cause) is what propagates.
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error(
        "[db] ROLLBACK failed:",
        rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
      );
    }
    throw err;
  } finally {
    client.release();
  }
}

export function buildUpsert(
  table: string,
  data: Record<string, unknown>,
  conflictColumn: string,
  updateColumns?: string[],
): { text: string; values: unknown[] } {
  const { text: insertText, values } = buildInsert(table, data);
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  const cols = updateColumns ?? entries.map(([k]) => k).filter((k) => k !== conflictColumn);
  const setClauses = cols.map((k) => {
    const idx = entries.findIndex(([ek]) => ek === k);
    if (idx >= 0) return `"${k}" = $${idx + 1}`;
    return `"${k}" = EXCLUDED."${k}"`;
  });
  return {
    text: `${insertText} ON CONFLICT ("${conflictColumn}") DO UPDATE SET ${setClauses.join(", ")}`,
    values,
  };
}
