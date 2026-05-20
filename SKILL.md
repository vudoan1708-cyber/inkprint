---
name: inkprint
description: "InkPrint — a Next.js web service that turns scanned handwriting into usable personal fonts. Use this skill whenever the user is working on the InkPrint project: building the scan-to-font pipeline, the character template UI, the font preview/download system, or the browser extension that injects the user's custom font globally. This skill is the project root — it routes to three role-specific references (frontend, backend, designer) that contain domain-expert instructions. Trigger on any mention of InkPrint, handwriting fonts, scan-to-font, custom font generation, font browser extension, or character template sheets."
---

# InkPrint — Handwriting-to-Font Platform

InkPrint lets users write characters on a guided template, scan or photograph the sheet, upload it to a web service, and receive a fully generated personal font based on their handwriting. The font can be previewed, downloaded, and applied globally across the browser via a companion extension so every website renders in the user's own handwriting.

## Tech Stack

| Layer | Stack |
|-------|-------|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript (strict mode, no `any`) |
| Styling | Tailwind CSS 4 + CSS variables for theming |
| State | Zustand (client), React Server Components (server) |
| API | Next.js Route Handlers (`app/api/`) |
| Database | Supabase (PostgreSQL, **Europe region**) — `@supabase/supabase-js` + `@supabase/ssr`, hosted project from day one (no local Supabase) |
| Auth | Supabase Auth (magic link + OAuth) |
| Realtime | Supabase Realtime (Postgres Changes) for live pipeline status |
| Object Storage | Cloudflare R2 (S3-compatible API, **NOT** AWS S3) — `@aws-sdk/client-s3` v3 with `region: 'auto'` and R2 endpoint |
| Font Engine | opentype.js for glyph assembly, FontForge CLI for OTF/TTF/WOFF2 compilation |
| Image Processing | Sharp (server-side), Canvas API (client-side preview) |
| Background Jobs | Supabase Edge Functions + pg_cron for heavy pipeline work; Database-driven queue via a `jobs` table with row-level locking |
| Testing | Vitest (unit), Playwright (e2e), Storybook (component) |
| CI/CD | GitHub Actions → Vercel (`lhr1` region for EU Supabase proximity) + `supabase db push` (migrations to hosted project) |

### Why This Stack

- **No Prisma** — Supabase's typed client (`supabase.from('table')`) combined with generated TypeScript types from `supabase gen types` is the single source of truth. Migrations are SQL files managed by `supabase migration new` and pushed to the hosted project via `supabase db push`. There is no local Supabase — the hosted Europe project is used from day one.
- **No raw Postgres connections in app code** — All database access goes through the Supabase JS SDK (REST API via PostgREST). The app uses the project URL + anon key from the Supabase dashboard's **Framework** tab, not a Postgres connection string. Direct/Transaction pooler/Session pooler strings from the Direct tab are not used.
- **No NextAuth** — Supabase Auth handles sessions, magic links, OAuth providers, and RLS policies natively. `@supabase/ssr` integrates with Next.js middleware for cookie-based sessions.
- **No AWS S3** — Cloudflare R2 is S3-API-compatible but is **not** S3. It uses the `@aws-sdk/client-s3` v3 SDK with `region: 'auto'` and an R2-specific endpoint (`https://<account_id>.r2.cloudflarestorage.com`). R2 has zero egress fees, no object versioning, no S3 lifecycle rules, and no S3 Event Notifications. See `BACKEND.md` section 6 for the full R2 vs S3 difference table. Supabase Storage is not used because R2 gives better control over CDN caching, custom domains, and cost.
- **No BullMQ/Redis** — The job queue is a Postgres `jobs` table with `SELECT ... FOR UPDATE SKIP LOCKED` for worker concurrency. Supabase Realtime pushes status updates to the client — no polling.

## Project Structure

```
inkprint/
├── src/
│   ├── app/                    # Next.js App Router pages + layouts
│   │   ├── (auth)/             # Auth-gated route group
│   │   ├── api/                # Route Handlers (REST endpoints)
│   │   ├── layout.tsx          # Root layout
│   │   └── page.tsx            # Landing page
│   ├── components/
│   │   ├── ui/                 # Atomic design tokens (Button, Input, Card…)
│   │   ├── compose/            # Composed components (UploadZone, GlyphGrid…)
│   │   └── layout/             # Shell, Nav, Footer
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Shared utilities, constants, type guards
│   │   ├── supabase/
│   │   │   ├── client.ts       # Browser client (createBrowserClient)
│   │   │   ├── server.ts       # Server client (createServerClient)
│   │   │   ├── middleware.ts   # Auth middleware helper
│   │   │   └── admin.ts       # Service-role client (server-only, bypasses RLS)
│   │   ├── r2/
│   │   │   ├── client.ts       # S3Client configured for R2 endpoint
│   │   │   └── storage.ts      # Upload/download/signed-URL helpers
│   │   ├── constants.ts
│   │   └── env.ts              # Zod-validated env vars
│   ├── server/                 # Server-only code
│   │   ├── services/           # Domain logic (scan, font-gen, storage)
│   │   ├── queue/              # Job queue (enqueue, dequeue, worker)
│   │   └── pipeline/           # Image processing + font generation steps
│   ├── stores/                 # Zustand stores
│   ├── types/                  # Generated Supabase types + app-level types + Zod schemas
│   │   └── supabase.ts         # Auto-generated: `supabase gen types typescript`
│   └── styles/                 # Global CSS, Tailwind config
├── public/
│   ├── templates/              # Printable character template PDFs
│   └── fonts/                  # Fallback / demo fonts
├── supabase/
│   ├── migrations/             # SQL migration files
│   ├── seed.sql                # Dev seed data
│   └── config.toml             # Supabase project config
├── tests/
│   ├── unit/
│   ├── e2e/
│   └── fixtures/
├── extension/                  # Browser extension source
│   ├── manifest.json
│   ├── content.js              # Font injection script
│   └── popup/                  # Extension popup UI
└── docs/
    ├── FRONTEND.md
    ├── BACKEND.md
    └── DESIGNER.md
```

## Role References

This project has three role-specific skill files. **Read the one that matches the current task before writing any code.**

| Task Domain | Reference File | When to Read |
|---|---|---|
| UI components, pages, client state, accessibility, browser extension popup | `references/FRONTEND.md` | Any work touching `src/components/`, `src/hooks/`, `src/stores/`, `src/app/**/page.tsx`, or `extension/popup/` |
| API routes, font generation pipeline, image processing, database, storage, queue | `references/BACKEND.md` | Any work touching `src/app/api/`, `src/server/`, `supabase/migrations/`, `src/lib/r2/`, or `extension/content.js` |
| Visual design, UX flows, template sheet design, branding, motion | `references/DESIGNER.md` | Any work involving layout decisions, color/type choices, user flow design, template sheet creation, or branding assets |

For cross-cutting tasks (e.g. building a new feature end-to-end), read all relevant references before starting.

## Universal Rules (All Roles)

1. **Zero duplication** — If logic, a component, a type, or a utility exists, import it. Never copy-paste and tweak. Extract shared code into `lib/`, `types/`, `hooks/`, or `components/ui/` immediately.
2. **Zero pollution** — No dead code, no commented-out blocks, no unused imports, no `console.log` in committed code. Every line must earn its place.
3. **TypeScript strict** — `strict: true`, `noUncheckedIndexedAccess: true`. No `any`, no `as` casts without a `// SAFETY:` comment explaining why.
4. **Single source of truth** — Constants in `lib/constants.ts`. Types generated from Supabase schema (`types/supabase.ts`) plus app-level types in `types/`. Env vars validated via Zod schema at startup (`lib/env.ts`).
5. **Naming** — Files: `kebab-case`. Components: `PascalCase`. Hooks: `use-` prefix, kebab-case file. Types: `PascalCase`, suffixed with intent (`Props`, `Payload`, `Schema`).
6. **Error boundaries** — Every async operation has explicit error handling. User-facing errors are friendly; developer errors are logged with context.
7. **Accessibility from day one** — Not bolted on later. Semantic HTML, ARIA where needed, keyboard nav, focus management, colour contrast ≥ 4.5:1.
8. **Supabase type generation** — After every migration, run `supabase gen types typescript --project-id <project_id> > src/types/supabase.ts`. Never hand-write database types. There is no local Supabase — types are always generated from the hosted project.
9. **Never read `.env*` files** — `.env`, `.env.local`, `.env.production`, `.env.development`, and any variant are **off-limits**. Do not open them with `Read`, `cat`, `grep`, `head`, `tail`, `less`, `find -exec`, MCP file readers, or any other tool. Do not include them in directory listings that print contents. They hold live secrets (Supabase keys, Cloudflare R2 credentials, service-role tokens) that must never enter the conversation context, model output, logs, or memory. If you need to know which variables exist, consult the **Environment Variables (Names Only)** section at the bottom of this file — that is the single authoritative reference for env var *names* in this project. If a variable name is missing from that list, ask the user to add it; never infer it by reading the file.

---

## Environment Variables (Names Only)

> **READ THIS, NOT `.env`.** This section is the only sanctioned reference for what env var names exist in this project. Values live in `.env` / `.env.local` / Vercel project settings and **must never** be loaded into context. If you need a value, ask the user; do not open the file.
>
> **Maintainer note (user-edited):** Add or remove variable names below as the project evolves. Keep this list to **names only** — no example values, no fragments of real values, no placeholders that look like keys. Group by service for scanability.

### Supabase (Framework tab — JS SDK / `@supabase/ssr`)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Cloudflare R2 (S3-compatible object storage)

- `CLOUDFLARE_BUCKET_NAME`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ACCESS_KEY`
- `CLOUDFLARE_SECRET_KEY`
- `CLOUDFLARE_TOKEN_VALUE`

### (Add new groups below as services are added — e.g. AI Gateway, Stripe, analytics)

<!--
Template for a new group:

### <Service name>

- `VAR_NAME_ONE`
- `VAR_NAME_TWO`
-->
