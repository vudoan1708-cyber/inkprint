# InkPrint

Draw your own handwriting font in the browser, then wear it everywhere — across every web page (via the [Inkwell](apps/inkwell/) browser extension), or installed at the OS level for native apps.

This monorepo is a Turborepo of two apps and one shared package.

## What's in here

```
apps/
  web/        # The InkPrint web app — draw glyphs, generate a font, manage your account
  inkwell/    # The browser extension — applies your font across every page you browse
packages/
  ui/         # Shared React design system (Button, Tabs, Slider, theme tokens, cn helper)
supabase/
  migrations/ # Postgres schema for users, glyphs, fonts
```

The two apps share auth (`@supabase/ssr` cookies), the same user identity, and the same `@inkprint/ui` primitives so the popup and the web app feel like one product.

## How the pieces connect

```
[ apps/web ]                                  [ apps/inkwell ]
    │                                                 │
    │  user signs in (Supabase),                      │
    │  draws glyphs in the canvas,                    │
    │  clicks Generate font → compiles               │
    │  to OTF (opentype.js) →                         │
    │  uploaded to R2 + metadata in Postgres          │
    │                                                 │
    │  ◄── /api/me ───────────────────────────── reads session
    │  ◄── /api/fonts/me ────────────────────── reads font bytes
    │                                                 │
    │                                                 ▼
    │                              caches in browser.storage.local;
    │                              injects @font-face + family override
    │                              into every page, shadow root, iframe
```

A bridge content script that runs only on the InkPrint origin is the authoritative auth path; the background's cross-origin fetch is best-effort because MV3 service workers don't always carry SameSite cookies.

## Running locally

Requires Node 20+, npm 11+.

```bash
npm install
npm run dev
```

Turborepo fans out `dev` to every workspace:

- `apps/web` → `next dev` on `http://localhost:3000`
- `apps/inkwell` → `wxt` dev mode on port 3001 with auto-reload

The web app expects a `.env` (see [apps/web/.env_example](apps/web/.env_example)) with Supabase + Cloudflare R2 credentials. The extension expects `apps/inkwell/.env` to point `WXT_WEB_APP_URL` at the running web app (defaults to production).

Other commands:

```bash
npm run build      # build every workspace
npm run test       # vitest across workspaces
npm run typecheck  # tsc --noEmit across workspaces
npm run lint       # eslint across workspaces
```

You can also scope to one workspace:

```bash
npm run --workspace @inkprint/web build
npm run --workspace @inkprint/inkwell zip:firefox
```

## The apps

### [apps/web](apps/web/)

Next.js 16 (App Router) + React 19 + Tailwind v4. Features:

- Canvas-based glyph drawing with stroke smoothing
- Auto-composition: draw the bases (`a`, `e`, …) and accent marks, the app composes `à`, `é`, `ế`, etc. (see [apps/web/src/lib/glyphComposition.ts](apps/web/src/lib/glyphComposition.ts))
- Font compilation in the browser via opentype.js, downloaded as `.otf`
- Embed flow: same font uploaded to Cloudflare R2 + recorded in Supabase so Inkwell can pull it
- Auth via Supabase
- Active-device guard (only one tab editing at a time) and merge-on-sign-in for anonymous glyphs

### [apps/inkwell](apps/inkwell/)

Cross-browser extension via WXT. See [apps/inkwell/README.md](apps/inkwell/README.md) for the submission-oriented breakdown. Key behaviors:

- Reads your font from your own InkPrint account; nothing leaves your browser
- Applies font across light DOM, shadow DOM (open + closed), and iframes
- Font-size slider via CSS `zoom`
- Skips icon-font hosts (Material Icons, FontAwesome, Material Symbols, Glyphicons)

### [packages/ui](packages/ui/)

The shared design system. Web and extension both import from `@inkprint/ui`:

- `Button` — primary / secondary / ghost / danger variants
- `Tabs` — pill-shaped toggle group
- `Slider` — themed range input with editable numeric chip
- `cn` — `clsx` + `tailwind-merge` wrapper
- `theme.css` — Tailwind v4 `@theme` block (brand, surface, success, danger, warn color scales)

Both apps `@import "@inkprint/ui/theme.css"` at the top of their CSS so design tokens stay in one place.

## Stack

| Concern | Choice |
|---|---|
| Monorepo | Turborepo + npm workspaces |
| Web framework | Next.js 16 (App Router, Server Components) |
| Extension framework | WXT 0.20 (Chromium MV3 + Firefox MV2 + Edge + Safari) |
| UI | React 19 + React Compiler |
| Styling | Tailwind CSS v4 + shared `@theme` tokens |
| Auth & DB | Supabase (Postgres + Auth) |
| Object storage | Cloudflare R2 (private bucket; reads gated by `auth.uid()`) |
| Font compilation | opentype.js (in-browser) |
| Tests | Vitest (collocated `.test.ts` next to source) |

## Conventions

A few non-obvious ones — see [AGENTS.md](AGENTS.md) for the full list:

- This is **not** vanilla Next.js. Read the docs shipped with `node_modules/next/dist/docs/` before writing route handlers, cache hints, or middleware.
- Tests live next to source as `foo.test.ts` — no top-level `tests/` directory.
- Component files PascalCase; lib files camelCase.
- Reusable atoms (Button, Slider, …) live in `packages/ui/`, never inlined per feature.
- Comments are short — single line where the *why* isn't obvious, no multi-paragraph blocks.
- Product / UX decisions are logged in [LOG.md](LOG.md).

## Deploying

- **Web** → Vercel (`apps/web` is the deployed root). Production URL configured in the extension's `.env` and AMO listing.
- **Inkwell** → store-by-store. `npm run --workspace @inkprint/inkwell zip:all` builds Chrome / Firefox / Edge / Safari packages in `apps/inkwell/.output/`. Upload each to its respective store.

## Contact

Issues, ideas, font requests — open a GitHub issue, or reach the maintainer through the contact info on the deployed web app.
