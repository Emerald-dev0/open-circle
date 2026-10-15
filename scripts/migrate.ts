import { Client } from "pg";
import { loadLocalEnv } from "./env.js";
import { runMigrations } from "./migrations.js";

loadLocalEnv();
const connectionString = process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) throw new Error("Set DATABASE_URL_UNPOOLED before running database migrations.");
if (new URL(connectionString).hostname.includes("-pooler")) {
  throw new Error("DATABASE_URL_UNPOOLED must use the direct Neon endpoint.");
}

const client = new Client({ connectionString, connectionTimeoutMillis: 15_000, statement_timeout: 60_000 });
try {
  await client.connect();
  const applied = await runMigrations(client);
  console.log(applied.length ? `Applied migrations: ${applied.join(", ")}` : "Database migrations are up to date.");
} finally {
  await client.end();
}
