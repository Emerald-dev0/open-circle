import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../scripts/migrations";
import { PostgresPortfolioStore } from "../server/portfolio-store";
import { defaultPortfolio, publicPortfolio } from "../shared/portfolio";

const url = process.env.PORTFOLIO_TEST_DATABASE_URL;
describe.skipIf(!url)("portfolio Postgres integration", () => {
  let pool: Pool;
  let store: PostgresPortfolioStore;
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.startsWith("/opencircle_portfolio_test_")) throw new Error("Use a disposable local portfolio test database.");
    pool = new Pool({ connectionString: url, max: 2 });
    const client = await pool.connect();
    try {
      expect(await runMigrations(client)).toContain("005_portfolios.sql");
      expect(await runMigrations(client)).toEqual([]);
    } finally { client.release(); }
    store = new PostgresPortfolioStore(pool);
  });
  afterAll(async () => { await pool?.end(); });
  const content = () => ({ ...defaultPortfolio({ id: 42, login: "Alice", avatarUrl: "" }), displayName: "Alice Chen", readme: "## My work\n\nA useful project." });
  it("round-trips drafts and published snapshots without leaking private contacts", async () => {
    const draft = { ...content(), contacts: [{ kind: "whatsapp" as const, value: "+2348031234567", visible: false }] };
    expect((await store.write(42, "Alice", draft, 0, "save")).version).toBe(1);
    expect(publicPortfolio((await store.readSlug("alice"))!)).toBeNull();
    const published = await store.write(42, "Alice", draft, 1, "publish");
    expect(publicPortfolio(published)).toMatchObject({ displayName: "Alice Chen", contacts: [] });
    expect(published.publishedAt).toBeGreaterThan(0);
    const changed = await store.write(42, "Alice", { ...draft, displayName: "Private edit" }, 2, "save");
    expect(publicPortfolio(changed)?.displayName).toBe("Alice Chen");
    expect((await store.readOwner(42))?.draft.displayName).toBe("Private edit");
    expect(publicPortfolio(await store.write(42, "Alice", changed.draft, 3, "unpublish"))).toBeNull();
  });
  it("atomically rejects conflicting addresses and stale writes from competing editors", async () => {
    const claims = await Promise.allSettled([store.write(50, "First", { ...content(), slug: "claimed" }, 0, "save"), store.write(51, "Second", { ...content(), slug: "claimed" }, 0, "save")]);
    expect(claims.filter((claim) => claim.status === "fulfilled")).toHaveLength(1);
    expect(claims.filter((claim) => claim.status === "rejected")).toHaveLength(1);
    const updates = await Promise.allSettled([store.write(42, "AliceRenamed", content(), 4, "publish"), store.write(42, "Alice", content(), 4, "save")]);
    expect(updates.filter((update) => update.status === "fulfilled")).toHaveLength(1);
    expect(updates.filter((update) => update.status === "rejected")).toHaveLength(1);
    const persisted = await new PostgresPortfolioStore(pool).readOwner(42);
    expect(persisted).toMatchObject({ ownerId: 42, version: 5, draft: { slug: "alice" } });
  });
});
