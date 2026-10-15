import type { Plugin } from "vite";

/**
 * Link previews (WhatsApp, X, LinkedIn…) need absolute URLs, so index.html
 * carries %SITE_URL% placeholders filled from the SITE_URL env at build time.
 * Also emits robots.txt and, when SITE_URL is known, sitemap.xml.
 */
export function seo(siteUrl: string | undefined): Plugin {
  const base = (siteUrl ?? "").trim().replace(/\/+$/, "");
  return {
    name: "opencircle:seo",
    transformIndexHtml(html) {
      return html.replaceAll("%SITE_URL%", base);
    },
    generateBundle() {
      const robots = ["User-agent: *", "Allow: /", "Disallow: /admin", "Disallow: /portfolio", "Disallow: /api/"];
      if (base) robots.push("", `Sitemap: ${base}/sitemap.xml`);
      this.emitFile({ type: "asset", fileName: "robots.txt", source: `${robots.join("\n")}\n` });

      if (!base) {
        this.warn("SITE_URL is not set: link previews get relative image URLs and no sitemap is written.");
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      // One entry: the SPA serves every tab from the same canonical page.
      const pages = ["/"];
      const urls = pages
        .map((p) => `  <url><loc>${base}${p}</loc><lastmod>${today}</lastmod><changefreq>hourly</changefreq></url>`)
        .join("\n");
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      });
    },
  };
}
