import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { usePageMeta } from "@/hooks/use-page-meta";
import { BrandMark } from "@/components/site-header";
import { TextureButton } from "@/components/ui/texture-button";

const NotFound = () => {
  const location = useLocation();
  usePageMeta();

  useEffect(() => {
    console.error("404: no route for", location.pathname);
  }, [location.pathname]);

  return (
    <div className="page-container relative flex min-h-dvh items-center justify-center py-8">
      <div className="app-backdrop" aria-hidden />
      <div className="relative z-10 flex flex-col items-center text-center">
        <BrandMark className="size-10" />
        <h1 className="text-gradient mt-6 text-5xl font-light tracking-[-0.04em]">404</h1>
        <p className="mt-2 text-sm text-t3">Nothing ranks here.</p>
        <TextureButton asChild className="mt-6 w-auto">
          <Link to="/">Back to the board</Link>
        </TextureButton>
      </div>
    </div>
  );
};

export default NotFound;
