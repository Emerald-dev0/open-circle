import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Pool } from "pg";
import type { PortfolioContent, PortfolioRecord } from "../shared/portfolio.js";
import { HttpError } from "./http.js";
import { createPostgresPool } from "./postgres.js";

export type PortfolioAction = "save" | "publish" | "unpublish";
export interface PortfolioStore {
  readOwner(ownerId: number): Promise<PortfolioRecord | null>;
  readSlug(slug: string): Promise<PortfolioRecord | null>;
  write(ownerId: number, githubLogin: string, content: PortfolioContent, version: number, action: PortfolioAction): Promise<PortfolioRecord>;
}

function stale(): never { throw new HttpError(409, "portfolio_conflict", "This portfolio changed in another tab. Reload before saving again."); }
function taken(): never { throw new HttpError(409, "address_taken", "That address is already reserved. Choose another.", "slug"); }
function storageError(error: unknown): never {
  if ((error as { code?: string }).code === "42P01") throw new HttpError(503, "portfolio_migration", "Portfolio storage is being set up. Please try again shortly.");
  throw error;
}

export class MemoryPortfolioStore implements PortfolioStore {
  private records = new Map<number, PortfolioRecord>();
  constructor(private readonly file: string | null = path.resolve(".data/portfolios.json")) {
    if (file && existsSync(file)) {
      const data: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (!Array.isArray(data)) throw new Error("The portfolio store is invalid.");
      this.records = new Map((data as PortfolioRecord[]).map((record) => [record.ownerId, record]));
    }
  }
  async readOwner(ownerId: number) { return structuredClone(this.records.get(ownerId) ?? null); }
  async readSlug(slug: string) { return structuredClone([...this.records.values()].find((record) => record.draft.slug === slug) ?? null); }
  async write(ownerId: number, githubLogin: string, content: PortfolioContent, version: number, action: PortfolioAction) {
    const saved = this.records.get(ownerId);
    if ((saved?.version ?? 0) !== version) stale();
    if (saved && saved.draft.slug !== content.slug) throw new HttpError(400, "address_locked", "Your saved address cannot be changed.", "slug");
    if ([...this.records.values()].some((record) => record.ownerId !== ownerId && record.draft.slug === content.slug)) taken();
    const now = Date.now();
    const record: PortfolioRecord = {
      ownerId, githubLogin, draft: structuredClone(content), version: version + 1, updatedAt: now,
      published: action === "publish" ? structuredClone(content) : action === "unpublish" ? null : saved?.published ?? null,
      publishedAt: action === "publish" ? now : action === "unpublish" ? null : saved?.publishedAt ?? null,
    };
    const next = new Map(this.records).set(ownerId, record);
    if (this.file) {
      mkdirSync(path.dirname(this.file), { recursive: true });
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temporary, JSON.stringify([...next.values()]), { mode: 0o600 });
        renameSync(temporary, this.file);
      } finally { rmSync(temporary, { force: true }); }
    }
    this.records = next;
    return structuredClone(record);
  }
}

interface PortfolioRow {
  owner_id: string; github_login: string; draft: PortfolioContent; published: PortfolioContent | null;
  version: number; published_at: string | null; updated_at: string;
}
function decode(row: PortfolioRow): PortfolioRecord {
  return { ownerId: Number(row.owner_id), githubLogin: row.github_login, draft: row.draft, published: row.published, version: row.version, publishedAt: row.published_at === null ? null : Number(row.published_at), updatedAt: Number(row.updated_at) };
}

export class PostgresPortfolioStore implements PortfolioStore {
  constructor(private readonly pool: Pool) {}
  async readOwner(ownerId: number) {
    const { rows } = await this.pool.query<PortfolioRow>("SELECT * FROM opencircle_portfolios WHERE owner_id = $1", [ownerId]).catch(storageError);
    return rows[0] ? decode(rows[0]) : null;
  }
  async readSlug(slug: string) {
    const { rows } = await this.pool.query<PortfolioRow>("SELECT * FROM opencircle_portfolios WHERE slug = $1", [slug]).catch(storageError);
    return rows[0] ? decode(rows[0]) : null;
  }
  async write(ownerId: number, githubLogin: string, content: PortfolioContent, version: number, action: PortfolioAction) {
    const now = Date.now();
    const draft = JSON.stringify(content);
    try {
      if (version === 0) {
        const { rows } = await this.pool.query<PortfolioRow>(
          `INSERT INTO opencircle_portfolios (owner_id, slug, github_login, draft, published, published_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [ownerId, content.slug, githubLogin, draft, action === "publish" ? draft : null, action === "publish" ? now : null, now],
        );
        return decode(rows[0]);
      }
      const { rows } = await this.pool.query<PortfolioRow>(
        `UPDATE opencircle_portfolios SET github_login = $2, draft = $3, version = version + 1, updated_at = $4,
           published = CASE WHEN $5 = 'publish' THEN $3::jsonb WHEN $5 = 'unpublish' THEN NULL ELSE published END,
           published_at = CASE WHEN $5 = 'publish' THEN $4::bigint WHEN $5 = 'unpublish' THEN NULL ELSE published_at END
         WHERE owner_id = $1 AND version = $6 AND slug = $7 RETURNING *`,
        [ownerId, githubLogin, draft, now, action, version, content.slug],
      );
      if (!rows[0]) stale();
      return decode(rows[0]);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        if ((error as { constraint?: string }).constraint === "opencircle_portfolios_pkey") stale();
        taken();
      }
      storageError(error);
    }
  }
}

const globals = globalThis as typeof globalThis & { __openCirclePortfolioStore?: PortfolioStore };
let store: PortfolioStore | undefined;
export function getPortfolioStore(): PortfolioStore {
  if (store) return store;
  if (process.env.DATABASE_URL) store = new PostgresPortfolioStore(createPostgresPool(process.env.DATABASE_URL));
  else if (process.env.VERCEL || process.env.NODE_ENV === "production") throw new HttpError(503, "portfolio_storage", "Portfolio storage isn't configured yet. Connect Postgres and apply the portfolio migration.");
  else store = globals.__openCirclePortfolioStore ??= new MemoryPortfolioStore();
  return store;
}
