import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { ClientBase } from "pg";

export async function runMigrations(client: ClientBase): Promise<string[]> {
  const directory = new URL("../migrations/", import.meta.url);
  const files = (await readdir(directory)).filter((file) => /^\d+_.*\.sql$/.test(file)).sort();
  const applied: string[] = [];
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SELECT pg_advisory_xact_lock(1868784498)");
    await client.query(
      `CREATE TABLE IF NOT EXISTS opencircle_migrations (
         name text PRIMARY KEY,
         checksum text NOT NULL,
         applied_at timestamptz NOT NULL DEFAULT NOW()
       )`,
    );
    for (const file of files) {
      const sql = await readFile(new URL(file, directory), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const { rows } = await client.query<{ checksum: string }>(
        "SELECT checksum FROM opencircle_migrations WHERE name = $1",
        [file],
      );
      if (rows[0]) {
        if (rows[0].checksum !== checksum) throw new Error(`Applied migration ${file} was changed.`);
        continue;
      }
      await client.query(sql);
      await client.query("INSERT INTO opencircle_migrations (name, checksum) VALUES ($1, $2)", [file, checksum]);
      applied.push(file);
    }
    await client.query("COMMIT");
    return applied;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
