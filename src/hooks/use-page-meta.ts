import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { DEFAULT_SITE_URL } from "@shared/brand";
import { seoDocument } from "@shared/seo";

function currentOrigin() {
  const href = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
  if (href && URL.canParse(href)) return new URL(href).origin;
  return DEFAULT_SITE_URL;
}

function setMeta(attribute: "name" | "property", key: string, content: string) {
  let element = Array.from(document.head.querySelectorAll(`meta[${attribute}]`)).find((meta) => meta.getAttribute(attribute) === key);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

export function usePageMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const page = seoDocument(pathname, currentOrigin());
    document.title = page.title;
    setMeta("name", "description", page.description);
    setMeta("name", "robots", page.robots);
    setMeta("property", "og:title", page.title);
    setMeta("property", "og:description", page.description);
    setMeta("property", "og:url", page.url);
    setMeta("name", "twitter:title", page.title);
    setMeta("name", "twitter:description", page.description);
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", page.url);
  }, [pathname]);
}
