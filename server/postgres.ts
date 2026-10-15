import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

export function createPostgresPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 15_000,
    statement_timeout: 15_000,
    allowExitOnIdle: true,
  });
  pool.on("error", (error) => console.error("Postgres idle connection failed", error.message));
  if (process.env.VERCEL) attachDatabasePool(pool);
  return pool;
}
