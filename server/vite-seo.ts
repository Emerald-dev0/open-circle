import type { Plugin } from "vite";
import { DEFAULT_SITE_URL } from "../shared/brand";
import { applySeo, llmsTxt, robotsTxt, seoDocument, siteOrigin, sitemapXml } from "../shared/seo";

/**
 * Link previews need absolute URLs, so index.html carries %SITE_URL%
 * placeholders filled from the public site origin. Each known route then gets
 * its own title, description, canonical and robots tags. The build also emits
 * robots.txt, sitemap.xml and llms.txt.
 */
export function seo(siteUrl: string | undefined): Plugin {
  const origin = siteOrigin(siteUrl || DEFAULT_SITE_URL);
  return {
    name: "opencircle:seo",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const ready = html.replaceAll("%SITE_URL%", origin);
        const pathname = new URL(ctx.originalUrl ?? "/", origin).pathname;
        return applySeo(ready, seoDocument(pathname, origin));
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split("?")[0];
        const file = pathname === "/robots.txt" ? robotsTxt(origin) : pathname === "/sitemap.xml" ? sitemapXml(origin) : pathname === "/llms.txt" ? llmsTxt(origin) : "";
        if (!file) return next();
        res.setHeader("content-type", pathname === "/sitemap.xml" ? "application/xml; charset=utf-8" : "text/plain; charset=utf-8");
        res.end(file);
      });
    },
    generateBundle() {
      const lastmod = new Date().toISOString().slice(0, 10);
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robotsTxt(origin) });
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemapXml(origin, lastmod) });
      this.emitFile({ type: "asset", fileName: "llms.txt", source: llmsTxt(origin) });
    },
  };
}
