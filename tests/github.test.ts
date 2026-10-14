import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GithubError, lookupMany, lookupOne } from "../server/github";
import { githubJson, githubOwner, githubRepository } from "./helpers/fixtures";

beforeEach(() => vi.stubEnv("GITHUB_TOKEN", "test-token"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GitHub profile and repository lookup", () => {
  it("loads every repository beyond the first 100 and sums all owned public stars", async () => {
    const first = Array.from({ length: 100 }, (_, i) => githubRepository(i + 1));
    const second = Array.from({ length: 25 }, (_, i) => githubRepository(i + 101));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(githubJson({ data: { u0: githubOwner({ repositories: { totalCount: 125, nodes: first, pageInfo: { hasNextPage: true, endCursor: "cursor-100" } } }) } }))
      .mockResolvedValueOnce(githubJson({ data: { user: { repositories: { totalCount: 125, nodes: second, pageInfo: { hasNextPage: false, endCursor: "cursor-125" } } } } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await lookupOne("octocat");

    expect(result.kind).toBe("user");
    if (result.kind !== "user") throw new Error("Expected a public GitHub user");
    expect(result.stats.projects).toHaveLength(125);
    expect(result.stats.stars).toBe(7875);
    expect(result.stats.repos).toBe(125);
    expect(result.stats.activity).toBe(9);
    expect(result.stats.projects?.at(-1)).toMatchObject({ id: "R_125", fullName: "Octocat/project-125", stars: 125 });
    const pageRequest = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(pageRequest.variables).toEqual({ login: "Octocat", after: "cursor-100" });
    expect(pageRequest.query).toContain("privacy: PUBLIC");
    expect(pageRequest.query).toContain("isFork: false");
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("bearer test-token");
  });

  it("excludes private projects, forks and null nodes from public repository results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJson({
      data: { u0: githubOwner({ repositories: {
        totalCount: 1,
        nodes: [githubRepository(3), githubRepository(1000, { isPrivate: true }), githubRepository(999, { isFork: true }), null],
        pageInfo: { hasNextPage: false, endCursor: null },
      } }) },
    })));

    const result = await lookupOne("Octocat");

    expect(result).toMatchObject({ kind: "user", stats: { stars: 3, repos: 1, projects: [{ id: "R_3" }] } });
  });

  it("does not publish incomplete repository totals when a later page fails", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(githubJson({ data: { u0: githubOwner({ repositories: {
        totalCount: 101,
        nodes: [githubRepository(100)],
        pageInfo: { hasNextPage: true, endCursor: "cursor-100" },
      } }) } }))
      .mockResolvedValueOnce(githubJson({ errors: [{ type: "RATE_LIMITED", message: "Try later" }] })));

    await expect(lookupOne("Octocat")).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("detects repeated pagination cursors instead of looping indefinitely", async () => {
    const connection = { totalCount: 101, nodes: [githubRepository(1)], pageInfo: { hasNextPage: true, endCursor: "repeated" } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(githubJson({ data: { u0: githubOwner({ repositories: connection }) } }))
      .mockResolvedValueOnce(githubJson({ data: { user: { repositories: connection } } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupOne("Octocat")).rejects.toMatchObject({ code: "upstream" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps valid members when one GraphQL alias fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJson({
      data: { u0: githubOwner(), u1: null, u2: { __typename: "Organization", login: "CircleOrg", avatarUrl: "" } },
      errors: [{ type: "INTERNAL", message: "Profile failed", path: ["u1"] }],
    })));

    const outcome = await lookupMany(["Octocat", "broken", "CircleOrg"]);

    expect(outcome.results.get("octocat")?.kind).toBe("user");
    expect(outcome.results.get("broken")?.kind).toBe("error");
    expect(outcome.results.get("circleorg")?.kind).toBe("organization");
    expect(outcome.error).toBeInstanceOf(GithubError);
  });

  it.each([[401, "unauthorized"], [403, "rate_limited"], [429, "rate_limited"], [502, "upstream"]])(
    "reports GitHub HTTP %i without returning invented stats",
    async (status, code) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJson({}, Number(status))));
      await expect(lookupOne("Octocat")).rejects.toMatchObject({ code });
    },
  );

  it("fails clearly without a server GitHub token", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupOne("Octocat")).rejects.toMatchObject({ code: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
