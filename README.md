# React Starter

Production-oriented starter for React apps: **Vite**, **TypeScript**, **Tailwind CSS**, and **shadcn/ui** (Radix primitives). Use it as a base for SPAs with routing, forms, server-state helpers, and an accessible component kit already wired up.

## Stack

| Area | Tools |
|------|--------|
| Core | React 19, TypeScript, Vite 6 |
| UI | Tailwind CSS, shadcn/ui, Radix UI, Lucide icons |
| Routing | React Router |
| Data & forms | TanStack Query, React Hook Form, Zod |
| DX | ESLint 9 (flat config), PostCSS, SWC (via `@vitejs/plugin-react-swc`) |

## Requirements

- **Node.js 20+** (see `.nvmrc`)
- npm, pnpm, yarn, or bun

## Quick start

```bash
git clone https://github.com/Psybah/react-vite-starter-template.git
cd react-vite-starter-template
npm install
npm run dev
```

The dev server runs at **[http://localhost:5173](http://localhost:5173)** (Vite default).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (port **5173**) |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run preview` | Serve the production build locally (port **4173**) |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript without emitting |

## Project layout

```
src/
├── components/ui/   # shadcn/ui components
├── hooks/             # Shared hooks
├── lib/               # Utilities (e.g. cn())
├── pages/             # Route-level views
├── App.tsx            # Providers, router, layout shell
├── main.tsx           # Entry
└── index.css          # Tailwind + design tokens
```

Path alias: `@/*` → `src/*` (configured in `tsconfig` and `vite.config.ts`).

## Adding UI components

This repo is set up for [shadcn/ui](https://ui.shadcn.com/). Add components with the CLI (config in `components.json`):

```bash
npx shadcn@latest add button
```

## Configuration

- **Vite** — `vite.config.ts` (dev port `5173`, preview `4173`, `@` alias)
- **Tailwind** — `tailwind.config.ts`, tokens in `src/index.css`
- **TypeScript** — project references in `tsconfig.json`, app sources in `tsconfig.app.json`
- **ESLint** — flat config in `eslint.config.js`

## Deployment

Build static assets:

```bash
npm run build
```

Output is in `dist/`. This project includes a `vercel.json` SPA fallback for client-side routing on Vercel; adapt as needed for Netlify, Cloudflare Pages, etc.

## License

MIT — use freely; add your own license file if you publish the template.
