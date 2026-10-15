# Contributing to OpenCircle

You can help with bug reports, code, tests, accessibility or documentation. Check [open issues](https://github.com/opencirclehq/open-circle/issues) before starting so you can see what others are working on.

For a larger feature or a change to the design, open an issue or discuss it with an organiser first. Describe the problem and agree on the scope before several people start editing the same files.

## Your first contribution

1. Fork [opencirclehq/open-circle](https://github.com/opencirclehq/open-circle) on GitHub.
2. Clone your fork and add the original repository as `upstream`:

   ```bash
   git clone https://github.com/YOUR_USERNAME/open-circle.git
   cd open-circle
   git remote add upstream https://github.com/opencirclehq/open-circle.git
   git switch -c fix/describe-your-change
   ```

3. Use Node.js 22.13+ and pnpm 11.7.0, then run these commands inside your fork:

   ```bash
   pnpm install --frozen-lockfile
   cp .env.example .env.local
   pnpm dev
   ```

   See [Run locally](README.md#run-locally) for service requirements and use your own development credentials.
4. Make a focused change and run the relevant checks below.
5. Push your branch to your fork and open a pull request against `opencirclehq/open-circle:main`.

Members with repository access can create a branch here instead of using a fork. Leave unrelated changes out of the pull request.

## Find the code you need

| Area | Location |
| --- | --- |
| Pages, components and browser state | `src/` |
| HTTP request handlers | `api/` |
| GitHub calls, authentication and storage | `server/` |
| Shared types, ranking and validation | `shared/` |
| Database changes | `migrations/` |
| Regression tests | `tests/` |

The [development guide](docs/development.md) explains the structure and available commands. The [API reference](docs/api.md) describes the request and response formats.

## Check your change

Start with the tests for the area you changed. For example:

```bash
pnpm exec vitest run tests/github.test.ts --maxWorkers=2
```

Before opening a pull request, run these commands in order:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

GitHub Actions runs the same checks. The regular test suite uses fixtures and mocked services; it needs no real GitHub token or WhatsApp account. Optional database checks need separate development resources and are explained in the [development guide](docs/development.md#commands-and-checks).

For a bug fix, include a regression test when it can prove the failure and the fix. Explain any check you could not run. Use fictional member details, and keep local environments, data files and generated builds out of your changes.

## Follow the existing patterns

Put browser-safe types and validation in `shared/`, and keep secrets, GitHub requests and persistence in `server/` or `api/`. The server must enforce registration rules even when the client validates the same fields.

Keep the dark theme, Aspekta font and existing UI primitives. Reuse `MetalButton`, `TextureButton`, field styles and Radix components before adding alternatives. A feature should not change global colours, typography or design tokens as a side effect. Keep copy short and name the action directly.

Make controls work with keyboard and touch, label inputs, and provide readable loading and error states. Respect reduced motion and check narrow layouts and long names. Use `@solar-icons/react` for UI icons: linear for controls and fields, bold for filled states, and bold-duotone for ranking and decorative icons. Reuse `src/components/brand-icons.tsx` for GitHub and WhatsApp logos.

If you change ranking, update its explanation and tests together. Storage changes must preserve unique identities, deletion behaviour and newer snapshots. Public responses must keep private member details out.

Use pnpm for dependency changes and include the updated `pnpm-lock.yaml`. Check callers before removing shared code, and keep unrelated refactors separate.

## Open a useful pull request

Give it a title that describes the result. Explain the problem, what changed and how you checked it. Link the issue if there is one, and include a screenshot for a visible UI change when useful. Use sample data in screenshots.

Keep the change small enough to review. Call out changes to setup, storage or API behaviour, and update the relevant public guide. Respond to review comments in the same pull request.

## Report a problem

Use the [bug report form](https://github.com/opencirclehq/open-circle/issues/new?template=bug_report.yml) and include the steps, expected result and actual result. Feature ideas belong in the [feature request form](https://github.com/opencirclehq/open-circle/issues/new?template=feature_request.yml).

For a security or privacy problem, contact a group organiser privately through [Open Source Circle](https://chat.whatsapp.com/HanHO4T0w0kJGcipYZTB8q?mode=gi_t) before posting details publicly. Never include tokens, real phone numbers, private admin responses or database exports in an issue or pull request.
