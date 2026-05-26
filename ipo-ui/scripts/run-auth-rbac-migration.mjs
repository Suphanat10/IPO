import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(repoRoot, ".env.local") });
dotenv.config({ path: path.join(repoRoot, ".env") });

const sqlPath = path.join(repoRoot, "scripts", "migrations", "0007_auth_rbac_sessions.sql");
const sql = await fs.readFile(sqlPath, "utf8");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run auth/RBAC migration.");
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
});

try {
  await pool.query(sql);
  const result = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM admin_users WHERE role = 'super_admin' AND is_active = true) AS active_super_admins,
      (SELECT count(*)::int FROM admin_sessions) AS sessions,
      (SELECT count(*)::int FROM admin_permissions) AS permissions,
      (SELECT count(*)::int FROM admin_role_permissions) AS role_permissions
  `);
  console.log(JSON.stringify(result.rows[0], null, 2));
} finally {
  await pool.end();
}
