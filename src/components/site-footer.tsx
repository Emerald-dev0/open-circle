import { BRAND_NAME } from "@shared/brand";

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-3xl px-4 pb-28 pt-10">
      <p className="text-center text-[11px] tabular text-t4">
        {BRAND_NAME} v{__APP_VERSION__}
      </p>
    </footer>
  );
}
