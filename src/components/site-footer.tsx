import { BRAND_NAME } from "@shared/brand";
import { Link } from "react-router-dom";

export function SiteFooter() {
  return (
    <footer className="page-container pb-[calc(7rem+env(safe-area-inset-bottom))] pt-10">
      <p className="mb-4 text-center text-sm text-t3"><Link to="/participation" className="inline-flex min-h-11 items-center hover:text-foreground">Group participation</Link></p>
      <p className="text-center text-[11px] tabular text-t4">
        {BRAND_NAME} v{__APP_VERSION__}
      </p>
    </footer>
  );
}
