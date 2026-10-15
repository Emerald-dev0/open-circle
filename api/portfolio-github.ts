import { handle, HttpError, json } from "../server/http.js";
import { listPortfolioRepositories, portfolioGitHubDetails, portfolioRepositoryReadme } from "../server/portfolio-github.js";
import { PORTFOLIO_HEADERS, portfolioRateLimit, requirePortfolioOwner } from "../server/portfolio.js";

export function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const profile = await requirePortfolioOwner(req);
    await portfolioRateLimit(req, String(profile.id), "github");
    const params = new URL(req.url).searchParams;
    if (params.get("view") === "profile") return json(await portfolioGitHubDetails(profile), 200, PORTFOLIO_HEADERS);
    const readme = params.get("readme");
    if (readme !== null) {
      const id = Number(readme);
      if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "repository_id", "Choose a repository to import.");
      return json({ readme: await portfolioRepositoryReadme(id, profile.id) }, 200, PORTFOLIO_HEADERS);
    }
    const page = Number(params.get("page") ?? "1");
    if (!Number.isSafeInteger(page) || page < 1 || page > 100) throw new HttpError(400, "repository_page", "Choose a valid repository page.");
    return json(await listPortfolioRepositories(profile, page), 200, PORTFOLIO_HEADERS);
  });
}
