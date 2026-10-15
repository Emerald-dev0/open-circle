<p align="center">
  <img src="public/favicon.svg" alt="OpenCircle" width="72" height="72">
</p>

<h1 align="center">OpenCircle</h1>

<p align="center">GitHub rankings, personal portfolios, community projects and developer tools for Open Source Circle.</p>

<p align="center">
  <a href="https://opencircle.cc"><img src="https://img.shields.io/badge/Open_the_app-04060A?style=for-the-badge&amp;logo=github&amp;logoColor=white" alt="Open the app"></a>
  <a href="https://chat.whatsapp.com/HanHO4T0w0kJGcipYZTB8q?mode=gi_t"><img src="https://img.shields.io/badge/Join_the_community-187C43?style=for-the-badge&amp;logo=whatsapp&amp;logoColor=white" alt="Join the WhatsApp community"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/Contribute-30363D?style=for-the-badge&amp;logo=github&amp;logoColor=white" alt="Read the contribution guide"></a>
</p>

<p align="center">
  <a href="https://github.com/opencirclehq/open-circle/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/opencirclehq/open-circle/ci.yml?branch=main&amp;style=flat-square&amp;logo=githubactions&amp;logoColor=white&amp;label=checks" alt="Project checks on main"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/opencirclehq/open-circle?style=flat-square&amp;color=97a3b6" alt="MIT license"></a>
  <a href="https://github.com/opencirclehq/open-circle"><img src="https://img.shields.io/github/stars/opencirclehq/open-circle?style=flat-square&amp;logo=github&amp;label=stars&amp;color=f5c542" alt="GitHub stars"></a>
  <a href="https://github.com/opencirclehq/open-circle/forks"><img src="https://img.shields.io/github/forks/opencirclehq/open-circle?style=flat-square&amp;logo=github&amp;label=forks&amp;color=8b949e" alt="GitHub forks"></a>
</p>

<p align="center">
  <a href="https://github.com/opencirclehq/open-circle/issues"><img src="https://img.shields.io/github/issues/opencirclehq/open-circle?style=flat-square&amp;logo=github&amp;label=issues&amp;color=58a6ff" alt="Open GitHub issues"></a>
  <a href="https://github.com/opencirclehq/open-circle/pulls"><img src="https://img.shields.io/github/issues-pr/opencirclehq/open-circle?style=flat-square&amp;logo=github&amp;label=pull%20requests&amp;color=a371f7" alt="Open pull requests"></a>
  <a href="https://github.com/opencirclehq/open-circle/graphs/contributors"><img src="https://img.shields.io/github/contributors/opencirclehq/open-circle?style=flat-square&amp;logo=github&amp;color=3fb950" alt="GitHub contributors"></a>
  <a href="https://github.com/opencirclehq/open-circle/commits/main"><img src="https://img.shields.io/github/last-commit/opencirclehq/open-circle/main?style=flat-square&amp;logo=github&amp;label=last%20commit&amp;color=8b949e" alt="Latest commit on main"></a>
</p>

OpenCircle brings the group's GitHub profiles and public projects into one place. Members join a shared leaderboard, publish personal portfolios, find each other's work and share useful open-source tools. This repository is where we build the app together.

## What you can do

- Join the developer leaderboard and follow rank changes.
- Build a customizable GitHub portfolio at `username.opencircle.cc`.
- Browse members' repositories, filter by language, upvote projects and save links.
- Find developer tools, submit tools for review and rate them with GitHub sign-in.
- Share projects, give feedback and answer help requests through group participation.
- Manage members, tool submissions and ranking settings through the admin page.

Choose **Light**, **Dark** or **System** from the Appearance control at the top right. Your choice stays saved in this browser; System follows your device’s appearance setting.

GitHub sign-in is required for portfolio editing, tool voting, group participation and admin access. Joining the board requires a personal GitHub profile and a number in the WhatsApp group.

## Member portfolios

[Create your portfolio](https://opencircle.cc/portfolio) with GitHub and publish it at `username.opencircle.cc`. Your page includes your GitHub photo, name, bio and up to six public repositories you own, with links to their source and existing live sites.

Choose a light or dark theme, accent colors and a cover image. Add skills, write or import a Markdown README, and customize project titles, descriptions, images and order. Preview your changes before publishing; saved drafts stay private until you publish them.

Contacts are private until you choose to show them. The Hire me button uses your chosen public contact while you are available for work. Your WhatsApp group number is never added to your portfolio automatically.

See the [portfolio guide](docs/portfolios.md) for setup, uploads and subdomain hosting.

## Run locally

Use Node.js **22.13+** and pnpm **11.7.0**. If needed, install pnpm with `npm install --global pnpm@11.7.0`.

The live website and portfolio editor use the [`main`](https://github.com/opencirclehq/open-circle/tree/main) branch.

```bash
git clone --branch main https://github.com/opencirclehq/open-circle.git
cd open-circle
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:5173`, or the address Vite prints if that port is busy. The development server runs the UI and API together.

The local board starts empty. You can browse the UI and run tests without live credentials. Profile lookup and registration need `GITHUB_TOKEN` and a configured WhatsApp membership service. GitHub sign-in needs OAuth credentials; admin access also needs `ADMIN_GITHUB_IDS`.

Start with [`.env.example`](.env.example) and the [configuration guide](docs/configuration.md). Without database credentials, development data stays in the ignored `.data/` directory. The membership bot is a separate private service, so ask an organiser for development access if your change needs it.

## How ranking works

The default developer score adds these points:

| Metric | Points |
| --- | --- |
| Stars on owned, public repositories that are not forks | 5 per star |
| GitHub followers | 4 per follower |
| Owned, public repositories that are not forks | 1 each, up to 50 |
| Public GitHub contributions since joining OpenCircle | 1 each |
| Community upvotes on owned repositories | 1 each |

Contribution totals include the whole joining day in UTC and keep accumulating. Ties go to more stars, then earlier registration. Organisers can change the weights.

Repository rankings use GitHub stars, then forks and repository name. Tool votes are separate from developer scores. Read the [full ranking and voting rules](docs/reference.md#how-ranking-works) for details.

## Built with

<p align="center">
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React_19-20232A?style=for-the-badge&amp;logo=react&amp;logoColor=61DAFB" alt="React 19"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&amp;logo=typescript&amp;logoColor=white" alt="TypeScript"></a>
  <a href="https://vite.dev"><img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&amp;logo=vite&amp;logoColor=white" alt="Vite"></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_CSS-0F172A?style=for-the-badge&amp;logo=tailwindcss&amp;logoColor=38BDF8" alt="Tailwind CSS"></a>
  <a href="https://github.com/appdever01/skelo"><img src="https://img.shields.io/badge/Skelo-161B22?style=for-the-badge&amp;logoColor=white" alt="Skelo"></a>
</p>

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js_22.13+-339933?style=for-the-badge&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js 22.13 or newer"></a>
  <a href="https://pnpm.io"><img src="https://img.shields.io/badge/pnpm_11.7.0-F69220?style=for-the-badge&amp;logo=pnpm&amp;logoColor=black" alt="pnpm 11.7.0"></a>
  <a href="https://www.radix-ui.com"><img src="https://img.shields.io/badge/Radix_UI-161618?style=for-the-badge&amp;logo=radixui&amp;logoColor=white" alt="Radix UI"></a>
  <a href="https://tanstack.com/query"><img src="https://img.shields.io/badge/TanStack_Query-FF4154?style=for-the-badge&amp;logo=reactquery&amp;logoColor=white" alt="TanStack Query"></a>
</p>

<p align="center">
  <a href="https://neon.com"><img src="https://img.shields.io/badge/Neon_Postgres-00E599?style=for-the-badge&amp;logo=postgresql&amp;logoColor=0B1221" alt="Neon Postgres"></a>
  <a href="https://upstash.com"><img src="https://img.shields.io/badge/Upstash_Redis-00E9A3?style=for-the-badge&amp;logo=redis&amp;logoColor=0B1221" alt="Upstash Redis"></a>
  <a href="https://vitest.dev"><img src="https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&amp;logo=vitest&amp;logoColor=white" alt="Vitest"></a>
  <a href="https://github.com/opencirclehq/open-circle/actions"><img src="https://img.shields.io/badge/GitHub_Actions-2088FF?style=for-the-badge&amp;logo=githubactions&amp;logoColor=white" alt="GitHub Actions"></a>
</p>

React 19, TypeScript, Vite and Tailwind CSS, with Radix UI and TanStack Query. The Node.js API uses GitHub GraphQL and supports Neon Postgres or Upstash Redis.

```text
src/          App pages, components and hooks
api/          HTTP request handlers
server/       GitHub, storage, authentication and ranking logic
shared/       Types and validation shared by the UI and API
migrations/   Postgres schema migrations
scripts/      Database setup and verification
tests/        Server and UI tests
docs/         Public setup and reference guides
```

## Open-source credits

OpenCircle's skeleton loaders use [Skelo](https://github.com/appdever01/skelo), created by [Naheem Adisa (@appdever01)](https://github.com/appdever01). Thank you for building it and sharing it with the open-source community.

## Contributing

Bug reports, code, tests and documentation improvements are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, project conventions and the pull request process.

Check [open issues](https://github.com/opencirclehq/open-circle/issues) before starting, or [open an issue](https://github.com/opencirclehq/open-circle/issues/new/choose) to describe a problem or suggest a change. For larger changes, agree on the scope with an organiser first.

Thanks to [everyone who contributes](https://github.com/opencirclehq/open-circle/graphs/contributors) to OpenCircle.

<p align="center">
  <a href="https://github.com/appdever01"><img src="https://avatars.githubusercontent.com/u/154071744?s=64&amp;v=4" alt="appdever01" width="64" height="64"></a>
  <a href="https://github.com/Psybah"><img src="https://avatars.githubusercontent.com/u/144453344?s=64&amp;v=4" alt="Psybah" width="64" height="64"></a>
</p>

## Documentation

| Guide | What it covers |
| --- | --- |
| [Configuration](docs/configuration.md) | Environment variables, GitHub OAuth, membership service and Neon setup. |
| [Development](docs/development.md) | Commands, checks, integration tests and code structure. |
| [App behaviour](docs/reference.md) | Registration, rankings, voting, refreshes, storage and current limits. |
| [API](docs/api.md) | Endpoints, request formats and error responses. |
| [Deployment](docs/deployment.md) | Running the built app and troubleshooting setup problems. |
| [Portfolios](docs/portfolios.md) | Customization, publishing, contact privacy, uploads and subdomains. |

## Privacy

WhatsApp numbers and participation feedback stay out of public board responses. Board registration checks group membership but does not verify ownership of the submitted GitHub account or phone number. Organisers handle disputed registrations.

Keep real member details and credentials out of issues and pull requests. See the [privacy details and current limits](docs/reference.md#privacy-and-current-limits).

## License

[MIT](LICENSE). The bundled Aspekta font uses the [SIL Open Font License 1.1](public/fonts/OFL.txt).
