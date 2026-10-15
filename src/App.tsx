import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { MotionConfig } from "motion/react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import Participation from "./pages/Participation";
import { TrafficTracker } from "./components/traffic-tracker";
import { portfolioSlugFromHostname } from "@shared/portfolio";

const Portfolio = lazy(() => import("./pages/Portfolio"));
const PublicPortfolio = lazy(() => import("./pages/PublicPortfolio"));
const portfolioSlug = portfolioSlugFromHostname(window.location.hostname);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <Sonner />
        <BrowserRouter>
          {!portfolioSlug && <TrafficTracker />}
          <Suspense fallback={<p role="status" className="p-12 text-center text-sm text-t3">Loading…</p>}>
          {portfolioSlug ? <PublicPortfolio slug={portfolioSlug} /> : <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/repositories" element={<Index />} />
            <Route path="/tools" element={<Index />} />
            <Route path="/participation" element={<Participation />} />
            <Route path="/how-it-works" element={<Index />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/p/:slug" element={<PublicPortfolio />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>}
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </MotionConfig>
  </QueryClientProvider>
);

export default App;
