import type { Pool, PoolClient } from "pg";
import type { CommunityTool, GitHubProfile, ToolVoteResult, VoteResult, VoteValue } from "../shared/community.js";
import { CURATED_TOOLS } from "../shared/tools.js";
import type { CommunityStore } from "./community-contract.js";
import { HttpError } from "./http.js";

export class PostgresCommunityStore implements CommunityStore {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await run(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listTools(): Promise<CommunityTool[]> {
    const { rows } = await this.pool.query<{ record: CommunityTool }>(
      "SELECT record FROM opencircle_tools ORDER BY id",
    );
    return rows.map((row) => row.record);
  }

  async readVotes(actor: string) {
    const { rows } = await this.pool.query<{ target: string; count: number; voted: boolean }>(
      `SELECT target, COUNT(*)::integer AS count, BOOL_OR(actor = $1) AS voted
       FROM opencircle_votes GROUP BY target ORDER BY target`,
      [actor],
    );
    const counts: Record<string, number> = {};
    const voted: string[] = [];
    for (const row of rows) {
      counts[row.target] = row.count;
      if (row.voted) voted.push(row.target);
    }
    return { counts, voted };
  }

  async setVote(target: string, actor: string, active: boolean): Promise<VoteResult> {
    return this.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 1868784501))", [target]);
      if (target.startsWith("tool:") && !CURATED_TOOLS.some((tool) => target === `tool:${tool.id}`)) {
        const { rowCount } = await client.query(
          "SELECT id FROM opencircle_tools WHERE id = $1 AND record ->> 'status' = 'approved' FOR UPDATE",
          [target.slice(5)],
        );
        if (rowCount !== 1) throw new HttpError(404, "not_found", "That tool is no longer available.");
      }
      if (active) {
        await client.query(
          "INSERT INTO opencircle_votes (target, actor) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [target, actor],
        );
      } else {
        await client.query("DELETE FROM opencircle_votes WHERE target = $1 AND actor = $2", [target, actor]);
      }
      const { rows } = await client.query<{ count: number }>(
        "SELECT COUNT(*)::integer AS count FROM opencircle_votes WHERE target = $1",
        [target],
      );
      return { target, active, count: rows[0].count };
    });
  }

  async createTool(tool: CommunityTool): Promise<boolean> {
    if (CURATED_TOOLS.some((existing) => existing.id === tool.id || existing.url === tool.url)) return false;
    return this.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(1868784502)");
      const existing = await client.query("SELECT id FROM opencircle_tools WHERE id = $1 OR url = $2", [tool.id, tool.url]);
      if (existing.rowCount) return false;
      const { rows } = await client.query<{ count: number }>("SELECT COUNT(*)::integer AS count FROM opencircle_tools");
      if (rows[0].count >= 1_000) throw new HttpError(409, "tools_full", "The tools directory is full.");
      const { rowCount } = await client.query(
        "INSERT INTO opencircle_tools (id, url, record) VALUES ($1, $2, $3::jsonb) ON CONFLICT DO NOTHING",
        [tool.id, tool.url, JSON.stringify(tool)],
      );
      return rowCount === 1;
    });
  }

  async removeTool(id: string): Promise<void> {
    await this.transaction(async (client) => {
      const target = `tool:${id}`;
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 1868784501))", [target]);
      const { rowCount } = await client.query("SELECT id FROM opencircle_tools WHERE id = $1 FOR UPDATE", [id]);
      if (!rowCount) return;
      await client.query("DELETE FROM opencircle_votes WHERE target = $1", [target]);
      await client.query("DELETE FROM opencircle_profile_votes WHERE target = $1", [target]);
      await client.query("DELETE FROM opencircle_tools WHERE id = $1", [id]);
    });
  }

  async approveTool(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE opencircle_tools SET record = jsonb_set(record, '{status}', '"approved"'::jsonb)
       WHERE id = $1 RETURNING id`,
      [id],
    );
    return rowCount === 1;
  }

  async readProfileVotes(actor: string | null) {
    const { rows } = await this.pool.query<{ target: string; count: number; value: VoteValue | null }>(
      `SELECT target, SUM(value)::integer AS count,
       MAX(value) FILTER (WHERE actor = $1)::smallint AS value
       FROM opencircle_profile_votes GROUP BY target ORDER BY target`, [actor],
    );
    const counts: Record<string, number> = {};
    const votes: Record<string, VoteValue> = {};
    for (const row of rows) {
      counts[row.target] = row.count;
      if (row.value !== null) votes[row.target] = row.value;
    }
    return { counts, votes };
  }

  async setProfileVote(target: string, actor: string, value: VoteValue): Promise<ToolVoteResult> {
    return this.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 1868784501))", [target]);
      if (!CURATED_TOOLS.some((tool) => target === `tool:${tool.id}`)) {
        const { rowCount } = await client.query("SELECT id FROM opencircle_tools WHERE id = $1 AND record ->> 'status' = 'approved' FOR UPDATE", [target.slice(5)]);
        if (rowCount !== 1) throw new HttpError(404, "not_found", "That tool is no longer available.");
      }
      if (value === 0) await client.query("DELETE FROM opencircle_profile_votes WHERE target = $1 AND actor = $2", [target, actor]);
      else await client.query("INSERT INTO opencircle_profile_votes (target, actor, value) VALUES ($1, $2, $3) ON CONFLICT (target, actor) DO UPDATE SET value = EXCLUDED.value", [target, actor, value]);
      const { rows } = await client.query<{ count: number }>("SELECT COALESCE(SUM(value), 0)::integer AS count FROM opencircle_profile_votes WHERE target = $1", [target]);
      return { target, value, count: rows[0].count };
    });
  }

  async createSession(hash: string, profile: GitHubProfile, expiresAt: number): Promise<void> {
    await this.pool.query("DELETE FROM opencircle_github_sessions WHERE expires_at <= NOW()");
    await this.pool.query("INSERT INTO opencircle_github_sessions (token_hash, profile, expires_at) VALUES ($1, $2::jsonb, $3)", [hash, JSON.stringify(profile), new Date(expiresAt)]);
  }

  async readSession(hash: string): Promise<GitHubProfile | null> {
    const { rows } = await this.pool.query<{ profile: GitHubProfile }>("SELECT profile FROM opencircle_github_sessions WHERE token_hash = $1 AND expires_at > NOW()", [hash]);
    return rows[0]?.profile ?? null;
  }

  async removeSession(hash: string): Promise<void> {
    await this.pool.query("DELETE FROM opencircle_github_sessions WHERE token_hash = $1", [hash]);
  }
}
