import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_URL } from "../shared/brand";
import { applySeo, llmsTxt, robotsTxt, seoDocument, sitemapXml, SITE_LINKS, structuredData } from "../shared/seo";

const template = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const origin = DEFAULT_SITE_URL;

function render(pathname: string) {
  return applySeo(template.replaceAll("%SITE_URL%", origin), seoDocument(pathname, origin));
}

describe("search documents", () => {
  it("gives each public board route a unique indexable document", () => {
    const home = seoDocument("/", origin);
    const repositories = seoDocument("/repositories", origin);
    const tools = seoDocument("/tools", origin);
    const rules = seoDocument("/how-it-works", origin);
    expect(new Set([home.title, repositories.title, tools.title, rules.title]).size).toBe(4);
    expect(home.url).toBe(`${origin}/`);
    expect(repositories.url).toBe(`${origin}/repositories`);
    expect([home, repositories, tools, rules].every((page) => page.index && page.status === 200)).toBe(true);
    for (const page of [home, repositories, tools, rules]) expect(page.description.length).toBeLessThan(180);
  });

  it("keeps admin, participation and unknown addresses out of the index", () => {
    expect(seoDocument("/participation", origin)).toMatchObject({ status: 200, index: false, robots: "noindex, nofollow" });
    expect(seoDocument("/admin", origin)).toMatchObject({ status: 200, index: false });
    expect(seoDocument("/portfolio", origin)).toMatchObject({ status: 200, index: false, title: "Your portfolio · OpenCircle" });
    expect(seoDocument("/missing", origin)).toMatchObject({ status: 404, index: false, heading: "404", url: `${origin}/missing` });
    expect(seoDocument("/repositories/", origin).url).toBe(`${origin}/repositories`);
  });

  it("lists only canonical public pages in the sitemap and points robots there", () => {
    const sitemap = sitemapXml(origin, "2026-10-15");
    expect(sitemap).toContain(`${origin}/`);
    expect(sitemap).toContain(`${origin}/repositories`);
    expect(sitemap).toContain(`${origin}/tools`);
    expect(sitemap).toContain(`${origin}/how-it-works`);
    expect(sitemap).not.toContain("/admin");
    expect(sitemap).not.toContain("/participation");
    expect(sitemap).not.toContain("/portfolio");
    expect(sitemap).toContain("<lastmod>2026-10-15</lastmod>");
    expect(robotsTxt(origin).split("\n").filter((line) => line.startsWith("Disallow:"))).toEqual(["Disallow: /admin", "Disallow: /portfolio", "Disallow: /api/"]);
    expect(robotsTxt(origin)).toContain("Allow: /");
    expect(robotsTxt(origin)).toContain("Allow: /api/forum-image");
    expect(robotsTxt(origin)).toContain(`Sitemap: ${origin}/sitemap.xml`);
  });

  it("describes the organization without retired search markup", () => {
    const data = structuredData(origin);
    expect(data["@graph"].map((entry) => entry["@type"])).toEqual(["Organization", "WebSite"]);
    const serialized = JSON.stringify(data);
    expect(serialized).toContain(`${origin}/#organization`);
    expect(serialized).not.toContain("SearchAction");
    expect(serialized).not.toContain("FAQPage");
    expect(serialized).not.toContain("aggregateRating");
  });

  it("rewrites the shell for the requested route and stays stable", () => {
    const repositories = render("/repositories");
    expect(repositories).toContain("<title>Spotlight · OpenCircle</title>");
    expect(repositories).toContain(`href="${origin}/repositories"`);
    expect(repositories).toContain('content="index, follow, max-image-preview:large"');
    expect(repositories).toContain("One repo per developer. At least 5 stars.");
    expect(repositories).toContain('"@type": "Organization"');
    expect(repositories).not.toContain("%SITE_URL%");
    expect(applySeo(repositories, seoDocument("/repositories", origin))).toBe(repositories);
    for (const link of SITE_LINKS) expect(repositories).toContain(`href="${link.path}"`);
  });

  it("tells agents where the public pages are", () => {
    const guide = llmsTxt(origin);
    expect(guide).toContain(`# OpenCircle`);
    expect(guide).toContain(`${origin}/repositories`);
    expect(guide).toContain(`${origin}/how-it-works`);
    expect(guide).not.toContain("/admin");
  });
});
