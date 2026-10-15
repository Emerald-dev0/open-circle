import { apiHandler } from "../server/api-security.js";
import { json } from "../server/http.js";
import { PORTFOLIO_HEADERS, portfolioRateLimit, requirePortfolioOrigin, requirePortfolioOwner } from "../server/portfolio.js";
import { uploadPortfolioImage } from "../server/portfolio-upload.js";

export function POST(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    requirePortfolioOrigin(req);
    const profile = await requirePortfolioOwner(req);
    await portfolioRateLimit(req, String(profile.id), "upload");
    return json({ url: await uploadPortfolioImage(req, profile.id) }, 201, PORTFOLIO_HEADERS);
  });
}
