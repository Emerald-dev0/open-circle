# OpenCircle

OpenCircle keeps the Open Source Circle's GitHub profiles and projects in one place. Members start with their GitHub username, add their nickname and WhatsApp number, and join a shared leaderboard. The top three get a podium, everyone else appears in the table, and a separate repository board ranks members' public projects by stars.

This repository is where members of the group build OpenCircle together. Code, bug reports, tests and useful documentation changes are welcome.

[Join Open Source Circle on WhatsApp](https://chat.whatsapp.com/HanHO4T0w0kJGcipYZTB8q?mode=gi_t) · [Repository](https://github.com/Psybah/github-profile-rank)

## Contents

- [What the app does](#what-the-app-does)
- [Run it locally](#run-it-locally)
- [Environment variables](#environment-variables)
- [Commands and checks](#commands-and-checks)
- [How ranking works](#how-ranking-works)
- [Updates and storage](#updates-and-storage)
- [Project structure](#project-structure)
- [API](#api)
- [Admin and moderation](#admin-and-moderation)
- [Privacy and current limits](#privacy-and-current-limits)
- [Contributing](#contributing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## What the app does

The registration flow asks for a GitHub username first. It accepts a bare username, `@username`, `github.com/username` or a full GitHub profile URL. Repository URLs and organisation profiles are rejected.

After looking up the public profile, the app shows its projected position and asks for a nickname and the WhatsApp number used in the group. Registration adds the member to the board and highlights their row on that device. Looking up an existing member shows their current position instead of creating another entry.

The app includes:

- A developer leaderboard with the top three highlighted and rank movement shown for the last 24 hours.
- A repository leaderboard populated from visible members' owned, public, non-fork repositories.
- A group invite that organisers can replace or pause.
- An explanation of the current ranking weights.
- An admin page for moderation, invite settings and ranking weights.

| Route | Purpose |
| --- | --- |
| `/` | Join the board and browse developer rankings. |
| `/repositories` | Browse projects ranked by stars. |
| `/how-it-works` | Open the ranking explanation over the board. |
| `/admin` | Organiser controls, protected by the admin secret. |

## Run it locally

Use Node.js 22.13 or newer and pnpm 11.7.0. The pinned pnpm version requires Node.js 22.13+, so Node.js 20 is insufficient for this setup. See [pnpm's compatibility notes](https://pnpm.io/installation#compatibility).

If pnpm is not installed:

```bash
npm install --global pnpm@11.7.0
```

Clone the repository and install its locked dependencies:

```bash
git clone https://github.com/Psybah/github-profile-rank.git
cd github-profile-rank
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Edit `.env.local` and set `GITHUB_TOKEN` before testing profile lookup or registration. Set `ADMIN_SECRET` if you need the admin page. Leave the database variables empty to use the local development store.

To use Neon Postgres, link a development branch and pull its environment variables:

```bash
npx neon@latest init -y --org-id <org-id> --project-id <project-id> --branch <development-branch> --services postgres
npx neon@latest deploy
pnpm db:migrate
```

`neon deploy` provisions the services in `neon.ts` and pulls their variables into `.env.local` (or `.env` if it exists). It does not deploy the frontend or API. `pnpm db:migrate` applies the versioned SQL migrations through `DATABASE_URL_UNPOOLED`; the app uses the pooled `DATABASE_URL`.

```bash
pnpm dev
```

The default address is `http://localhost:5173`. If that port is busy, use the address printed by Vite. The development server runs the UI and API together; you do not need a second server.

The board starts empty on a fresh local store. You can load the UI without a GitHub token, but profile lookup and registration need one. Tests use fixtures and mocked GitHub responses, so they do not need a real token.

## Environment variables

Copy `.env.example` rather than starting from someone else's private environment file.

| Variable | Use | Required |
| --- | --- | --- |
| `GITHUB_TOKEN` | Server-side authentication for read-only GitHub GraphQL queries. | Profile lookup, registration and GitHub refreshes. |
| `ADMIN_SECRET` | Shared secret used to unlock `/admin`. | Admin access only. |
| `DATABASE_URL` | Pooled Neon Postgres connection string, used only by the server. | Production storage, unless using legacy Redis. |
| `DATABASE_URL_UNPOOLED` | Direct Neon connection string for migrations. | `pnpm db:migrate`. |
| `UPSTASH_REDIS_REST_URL` | HTTPS endpoint for the optional legacy Upstash Redis database. | Only when using Redis instead of Postgres. |
| `UPSTASH_REDIS_REST_TOKEN` | Credentials for that Redis endpoint. | Only when using Redis instead of Postgres. |
| `KV_REST_API_URL` | Alternative name for the Redis endpoint, supplied by some Vercel integrations. | Alternative to `UPSTASH_REDIS_REST_URL`. |
| `KV_REST_API_TOKEN` | Alternative name for the Redis token. | Alternative to `UPSTASH_REDIS_REST_TOKEN`. |

`DATABASE_URL` selects Postgres even if legacy Redis variables are also set. Otherwise, one complete Redis variable pair selects Redis. Leaving all database variables unset selects `.data/dev-store.json` in development; production requires durable storage.

### GitHub token

Create a fine-grained personal access token with public repository access only. OpenCircle reads public profile information and does not need permission to write repositories or access private code. GitHub documents that fine-grained tokens include public repository read access in its [GraphQL authentication guide](https://docs.github.com/en/graphql/guides/forming-calls-with-graphql#authenticating-with-a-personal-access-token).

Put the token in `GITHUB_TOKEN` on the server. Use your own development token and keep its expiry in mind. Never ask members to paste their GitHub token into the app.

### Admin secret

Choose a long, random value for `ADMIN_SECRET`. Share it only with organisers who should be able to see WhatsApp numbers, change settings and remove members. Leaving it unset disables admin access.

All of these values are server secrets. Do not prefix them with `VITE_`, put them in client code, include them in screenshots, or commit them. Restart the development server after changing environment variables.

## Commands and checks

pnpm is the canonical package manager. Commit `pnpm-lock.yaml` when a dependency change updates it.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the UI and local API on port 5173. |
| `pnpm test` | Run the automated tests once. |
| `pnpm db:migrate` | Apply pending Postgres migrations with the direct connection. |
| `pnpm test:postgres` | Verify migrations, storage concurrency and real HTTP registration on a disposable Neon branch. |
| `pnpm typecheck` | Check the app, API and shared TypeScript code. |
| `pnpm lint` | Run ESLint. |
| `pnpm build` | Type-check and build the frontend into `dist/`. |
| `pnpm preview` | Serve the built frontend on port 4173. This does not run the API. |

Before opening a pull request, run these checks in order:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

GitHub Actions runs the same checks on pushes and pull requests. The workflow in `.github/workflows/ci.yml` uses the pinned pnpm version and does not need application secrets.

The test configuration caps workers at two. Keep focused tests for the area you change, especially validation, scoring, repository pagination, registration conflicts, moderation and public-data privacy. Do not replace a failing check with a weaker one.

With `pnpm dev` running, these commands check the local HTTP path without browser automation:

```bash
curl --fail-with-body http://localhost:5173/api/board
curl --fail-with-body 'http://localhost:5173/api/preview?u=octocat'
```

The second request needs a working GitHub token and network access. Test registrations against your local store or a separate development database.

For Postgres verification, create a disposable Neon branch and supply its pooled and direct URLs as `POSTGRES_TEST_URL` and `POSTGRES_TEST_URL_UNPOOLED`, then run `pnpm test:postgres`. Keep `DATABASE_URL` pointing at the normal app branch. The check refuses to use that same endpoint, requires `GITHUB_TOKEN`, starts and stops a temporary app server, and registers `octocat` with a fictional phone number. Use a fresh test branch without an existing `octocat` member and delete the branch after verification.

## How ranking works

### Developer rankings

The default score is:

```text
score = (stars × 5)
      + (followers × 4)
      + min(public original repositories, 50)
      + min(public contributions in the last 30 days, 100)
```

| Metric | Points | Counted data |
| --- | --- | --- |
| Stars | 5 per star | Total stars across repositories the member owns that are public and not forks. |
| Followers | 4 per follower | The profile's follower count. |
| Repositories | 1 per repository, capped at 50 | Owned, public, non-fork repositories. |
| Activity | 1 per contribution, capped at 100 | GitHub contribution counts over the last 30 days. |

Activity includes commits, issues, pull requests, pull request reviews and repository contributions returned by GitHub's contribution collection. Counts follow GitHub's rules and can differ from what a member expects from their contribution graph.

Members sort by score, then total stars, then earliest registration. A preview uses the current board to estimate where a new member would land; registration fetches the profile again, so the final position can change.

The default weights live in `shared/ranking.ts`. Organisers can change them in `/admin`, and the ranking explanation reads the saved settings. Caps apply to repository and activity points, not the number of repositories listed or the total stars.

New-member labels last 24 hours. Movement indicators show places gained or lost within a 24-hour movement window; they are not a historical analytics report.

### Repository rankings

Repositories sort by stars, then forks, then full repository name (`owner/name`). This board uses repository counts directly and does not use the developer scoring formula.

Only repositories owned by visible members appear. Forks and private repositories are excluded. GitHub results are paginated in batches of 100, so a member's projects and star total are not limited to their first 100 repositories. Organisation-owned projects are outside the current member model.

Hiding a member also hides their repositories from the public board.

## Updates and storage

### Refresh behaviour

The client checks the board every 10 seconds while the page is active. It keeps whichever snapshot is newer, so a delayed response cannot overwrite the result returned immediately after registration.

GitHub stats refresh about once a minute. Refreshes are triggered by board requests, so there is no scheduled job running when nobody is reading the board. The server returns the stored snapshot first and refreshes in the background. Vercel's `waitUntil` keeps that work alive after the response.

Each refresh handles up to 48 visible members, starting with those whose stats are oldest. GitHub lookups batch four profiles per request and run up to three batches at a time. Larger groups take multiple cycles to refresh everyone.

If GitHub fails or rate-limits a request, the app retains the last known stats and marks updates as delayed. It does not erase the board. Renamed or deleted GitHub accounts retain their last known numbers until an organiser removes them. Changes can take longer than one minute during failures or large refresh queues.

### Local development

Without Postgres or Redis credentials, the development store writes member records, settings and the board snapshot to `.data/dev-store.json`. Restarting the server keeps local sign-ups. The file contains WhatsApp numbers and must stay out of Git.

To start with an empty local board, stop the server and move `.data/dev-store.json` outside the project. Restart the server to create a new store. Moving the file preserves any test data you may want later.

### Postgres

Neon Postgres stores member records, settings and public board snapshots. Database constraints reserve GitHub logins, phone numbers and case-insensitive nicknames atomically. Partial updates preserve other fields, and a refresh cannot recreate a deleted member. Refresh locks and fixed-window request limits are shared across server instances, with expired entries cleaned up during requests.

The Node API uses `pg`, a small shared connection pool and Vercel's `attachDatabasePool` helper. Migrations live in `migrations/`; the runner applies them in a transaction, records their checksums and serializes concurrent migration runs. Run `pnpm db:migrate` before starting an app against a new database. Keep a separate Neon branch for development and test migrations there before applying them to production.

The setup does not copy existing members or settings from Redis or `.data/dev-store.json`. Keep those stores available if you need to migrate their data separately.

### Legacy Redis

When Redis credentials are present, both development and deployed handlers use Upstash Redis. Registration claims the GitHub login, normalised phone number and nickname together, so concurrent requests cannot create duplicate identities. GitHub logins and nicknames are compared without case sensitivity.

The store also keeps the public board snapshot, invite settings, scoring weights and a short-lived refresh lock. Vercel and other production environments refuse to fall back to local file storage when durable storage is missing, because separate server instances cannot safely share that file.

Use separate Redis databases for local work, preview deployments and production. Connecting a development environment to production Redis gives it access to real members and moderation settings.

## Project structure

```text
api/                         HTTP request handlers
  admin.ts                   Protected admin reads and actions
  board.ts                   Public board snapshot
  preview.ts                 GitHub profile preview
  register.ts                Member registration
server/                      Server-only logic
  admin.ts                   Admin authorization and settings validation
  board.ts                   Registration, scoring and snapshot refreshes
  db.ts                      Storage selection
  postgres.ts                Shared Node Postgres pool and Vercel lifecycle
  github.ts                  GitHub GraphQL queries and repository pagination
  http.ts                    JSON responses and error handling
  rate-limit.ts              Preview and registration request limits
  store.ts                   Storage contract and record encoding
  store-memory.ts            Local file-backed development store
  store-postgres.ts          Neon Postgres store
  store-redis.ts             Upstash Redis store
  vite-dev-api.ts            API integration for Vite development
shared/                      Contracts used by the UI and server
  brand.ts                   Product name and default group invite
  ranking.ts                 Score calculation and tie-breaks
  types.ts                   Public, registration and admin data types
  validation.ts              GitHub, nickname and phone validation
src/
  components/board/          Registration, podium and ranking tables
  components/ui/             Shared UI primitives
  hooks/                     Board polling
  lib/                       API client, formatting and device identity
  pages/                     Community board, admin and missing-page views
  App.tsx                    Providers and client routes
  index.css                  Original design tokens and surface treatments
public/fonts/                Aspekta font and its license
migrations/                  Versioned Postgres schema
neon.ts                      Neon service configuration
scripts/                     Migrations and live Postgres verification
tests/                       Server and UI regression coverage
vitest.config.ts             Test environments and worker limits
```

`@/` resolves to `src/` and `@shared/` resolves to `shared/`. Keep server secrets and Node-only imports inside `server/` or `api/`. Shared modules must be safe to import into the browser.

The frontend uses React 19, Vite 6, TypeScript, Tailwind CSS 3, Radix-based UI primitives and TanStack Query. The API uses Web `Request`/`Response` handlers and Node.js features; it is not an edge-only backend.

## API

The frontend calls same-origin API routes. Vite serves these during development and Vercel serves them after deployment.

| Method and path | Input | Result |
| --- | --- | --- |
| `GET /api/board` | None. | Public members, repositories, timestamps, invite settings and weights. |
| `GET /api/preview?u=username` | GitHub username or profile input in `u`. | Public profile stats and its score. |
| `POST /api/register` | JSON with `github`, `nickname` and `whatsapp`. | Registered login and the updated public board. |
| `GET /api/admin` | `Authorization: Bearer` with the admin secret. | Members including WhatsApp numbers, plus settings. |
| `POST /api/admin` | Same authorization, plus an admin action. | Updated admin state. |

Admin actions are `hide`, `unhide` and `remove`, with a `login`, or `config`, with complete invite and weight settings. The exact request and response types live in `shared/types.ts`.

Errors have a consistent shape:

```json
{
  "error": {
    "code": "invalid_github",
    "message": "That isn't a valid GitHub username.",
    "field": "github"
  }
}
```

The `field` property is optional. Validation failures return 400, missing profiles return 404, identity conflicts return 409, organisation profiles return 422, throttled requests return 429, and unavailable GitHub or storage returns 503. JSON request bodies are limited to 4 KiB. Unexpected failures return 500 without exposing their internal details to the client.

Profile previews and registration have one-minute request limits:

| Operation | Per client IP | Per GitHub username |
| --- | --- | --- |
| Preview | 30 | 10 |
| Registration | 10 | 5 |

These limits protect the lookup and registration paths from repeated requests. They do not verify identity or group membership.

## Admin and moderation

Set `ADMIN_SECRET` and visit `/admin`. The page sends the entered secret in the authorization header. The server verifies it before returning private member data or accepting changes. The page remembers the secret in session storage for that tab; use the Lock button when finished.

Organisers can:

- Hide a member while preserving their record and reserved identity. Hidden members cannot register again until restored or removed.
- Restore a hidden member to the public board.
- Remove a member and release their GitHub login, phone number and nickname. Removal allows them to register again; it is not a permanent ban.
- Replace the group invite, pause it, or edit the message shown when the invite is unavailable.
- Change ranking weights and caps. The board is rebuilt after a settings change.

The admin route asks search engines not to index it, but this is not an access control. Its protection comes from the server's secret check.

## Privacy and current limits

Public board and registration responses include GitHub details, nicknames and rankings. They do not include WhatsApp numbers. Numbers are stored in the private member record and are returned only through the authorized admin API. People with database access or the local development file can also read those records.

Registration asks members to use their group number. It validates format and uniqueness, but does not verify WhatsApp ownership or group membership. International numbers need a `+` country code; Nigerian local mobile numbers are also accepted and normalised to `+234`. Nicknames must be 2 to 24 characters, use the supported letters, numbers and punctuation, and contain no links.

GitHub lookup confirms that a personal profile exists. It does not prove that the person submitting it owns the account. There is no GitHub sign-in or member account system in the current flow, and the browser's remembered username only highlights a row. Organisers must handle disputed registrations.

Members cannot currently edit their nickname or number themselves. An organiser can remove the record so they can register again. Repeating a registration with the same GitHub login and phone returns the existing entry; it does not update its nickname.

Do not post tokens, real phone numbers, admin responses or data-store exports in issues or pull requests. Report sensitive security or privacy problems privately to a group organiser before sharing details publicly.

## Contributing

Start with an issue or a short discussion in the group. Describe the problem, the expected behaviour and the part of the app affected. For larger changes, agree on the scope before several members start editing the same files.

For a first contribution, fork this repository on GitHub, clone your fork, and follow the local setup above. Create a branch for the change, keep commits focused, and open a pull request against `main`. Members with direct repository access can create their branch here instead.

A pull request should explain what changed and why, include relevant checks, and call out anything that remains unverified. Add regression coverage when fixing a bug. Use fixture data rather than real member details. Keep generated builds, local environments and local data out of the patch.

### Keep the existing UI tone

The black background, Aspekta typography, soft white gradients, metal buttons and glass surfaces are part of OpenCircle's design. Build new features with the existing primitives. Reuse `.field`, the shared surface styles, `MetalButton`, `TextureButton` and the available Radix components before creating another visual system.

Do not replace the font, brighten the theme, add a new accent palette, or change global tokens as a side effect of a feature. A visual direction change needs its own agreed scope. Keep copy short and name the action directly.

Make new controls work with the keyboard and touch, associate inputs with labels, keep loading and error states readable, and respect reduced-motion settings. Check narrow layouts and long names. Use icons from the existing packages rather than drawing duplicates or adding another icon library for one feature.

### Keep shared behaviour consistent

Put cross-client data contracts and pure validation in `shared/`. Put GitHub calls and persistence in `server/`. Both the frontend and API must enforce the registration rules; client validation is a convenience, not a trust boundary.

If you change scoring, update its explanation and tests together. If you change storage, check uniqueness, deletion and stale-refresh behaviour. A feature must not expose private fields in the public board or replace good data with an older snapshot.

Use pnpm for dependency changes and include the updated lockfile. Remove code only after checking its callers and the shared primitives that still depend on it. Keep unrelated refactors out of feature pull requests.

## Deployment

Vercel is the supported deployment target for the included API handlers.

1. Import the repository into Vercel and choose a Node.js runtime compatible with the project's requirements.
2. Use `pnpm install --frozen-lockfile` for installation, `pnpm build` for the build, and `dist` for the frontend output directory.
3. Set Neon `DATABASE_URL` in the Vercel environment, and apply `pnpm db:migrate` using the matching `DATABASE_URL_UNPOOLED` before accepting sign-ups. A complete legacy Redis variable pair is also supported when `DATABASE_URL` is unset.
4. Set `GITHUB_TOKEN`, and set `ADMIN_SECRET` if organisers need admin access.
5. Give preview deployments their own Neon branch (or legacy Redis database) and environment values.
6. Deploy, then check the board API, a GitHub preview, registration and moderation using development data first.

`vercel.json` keeps `/api/` requests out of the client-route fallback, sets API function duration to 60 seconds and adds cache headers for the font. Board responses use short Vercel CDN caching while browsers revalidate; registration and admin responses are not cached.

A static upload of `dist/` only serves the UI. It does not provide registration, GitHub queries or storage. To use another host, provide a Node.js backend for the existing handlers, preserve the same API paths and background-refresh behaviour, and configure durable storage before accepting sign-ups.

## Troubleshooting

| Problem | Check |
| --- | --- |
| pnpm refuses to start. | Use Node.js 22.13+ and the pinned pnpm version. |
| Frozen installation fails after a dependency edit. | Run `pnpm install` in the branch, inspect the changes and commit `package.json` with `pnpm-lock.yaml`. |
| Profile lookup says GitHub is unavailable. | Check `GITHUB_TOKEN`, its expiry, connectivity and server logs. Restart after changing the token. |
| The UI works in preview but API calls fail. | `pnpm preview` serves only built assets. Use `pnpm dev` for the local API or a full deployed backend. |
| Production reports storage is missing. | Set `DATABASE_URL` for Neon, or both parts of a legacy Redis variable pair, in that deployment environment and redeploy. |
| Postgres reports that an `opencircle_` table is missing. | Run `pnpm db:migrate` with that branch's direct `DATABASE_URL_UNPOOLED`. |
| A username is rejected. | Submit a personal profile, not a repository, organisation or GitHub navigation URL. |
| A number or nickname is already registered. | Contact an organiser to resolve the existing record. Formatting differences do not create a new phone identity. |
| A project is absent. | It must be public, owned by a visible registered member, and not a fork. Allow a GitHub refresh cycle to complete. |
| Scores look delayed. | Check the board's update status. GitHub failures retain the last known values; larger groups refresh in batches. |
| The invite still uses an older link. | Saved admin settings override the default in `shared/brand.ts`. Change the stored invite in `/admin`. |
| Local test members remain after a restart. | The development store persists in `.data/dev-store.json`. Move it aside while the server is stopped for a fresh board. |
| Admin access is unavailable or rejected. | Set `ADMIN_SECRET`, restart or redeploy, and enter that environment's secret. |
| Requests return 429. | Wait for the one-minute limit window rather than retrying repeatedly. |

## License

OpenCircle is licensed under the [MIT License](LICENSE). The bundled Aspekta font is covered separately by the [SIL Open Font License 1.1](public/fonts/OFL.txt). Keep those notices when redistributing the code or font.
