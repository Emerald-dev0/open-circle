import { BRAND_NAME } from "@shared/brand";

export function SiteFooter() {
  return (
    <footer className="page-container pb-[calc(7rem+env(safe-area-inset-bottom))] pt-10">
      <p className="text-center text-[11px] tabular text-t4">
        {BRAND_NAME} v{__APP_VERSION__}
      </p>
    </footer>
  );
}
