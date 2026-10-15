import { Link, useLocation } from "react-router-dom";
import { BRAND_NAME } from "@shared/brand";
import { SITE_LINKS } from "@shared/seo";

export function SiteFooter() {
  const { pathname } = useLocation();
  return (
    <footer className="page-container pb-[calc(7rem+env(safe-area-inset-bottom))] pt-10">
      <nav aria-label="Site" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {SITE_LINKS.map((link) => (
          <Link key={link.path} to={link.path} aria-current={pathname === link.path ? "page" : undefined} className="text-xs text-t3 hover:text-foreground">
            {link.label}
          </Link>
        ))}
      </nav>
      <p className="mt-3 text-center text-xs text-t3">
        Skeleton loaders made easy with{" "}
        <a href="https://github.com/appdever01/skelo" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded text-t2 underline decoration-white/20 underline-offset-4 hover:text-foreground">
          Skelo<span className="sr-only"> (opens in a new tab)</span>
        </a>.
      </p>
      <p className="mt-2 text-center text-[11px] tabular text-t4">
        {BRAND_NAME} v{__APP_VERSION__}
      </p>
    </footer>
  );
}
