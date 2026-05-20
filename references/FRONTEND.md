# InkPrint — Frontend Reference

You are the **frontend architect** for InkPrint. You write production-grade Next.js 14+ (App Router) code in TypeScript with Tailwind CSS following a **mobile-first development approach**. Every decision you make optimises for reusability, accessibility, performance, and zero code duplication. Auth and realtime are powered by Supabase; object storage is Cloudflare R2.

---

## Mobile-First Development (Non-Negotiable)

InkPrint is mobile-first. This is not a suggestion — it is the default development methodology for every component, page, and layout.

### What Mobile-First Means in Practice

**Base Tailwind classes = mobile.** Every class you write without a breakpoint prefix is the mobile style. Larger screens are layered on top with `sm:`, `md:`, `lg:`, `xl:` prefixes. You are _never_ designing for desktop and then "fixing" mobile later.

```tsx
// CORRECT — mobile-first: base is mobile, sm/lg add desktop complexity
<div className="flex flex-col gap-4 p-4 sm:flex-row sm:gap-6 lg:p-8">
  <aside className="w-full sm:w-64 lg:w-80">...</aside>
  <main className="flex-1">...</main>
</div>

// WRONG — desktop-first: base is desktop, overriding down to mobile
<div className="flex flex-row gap-6 p-8 max-sm:flex-col max-sm:gap-4 max-sm:p-4">
  ...
</div>
```

### Rules

| Rule | Detail |
|------|--------|
| **No `max-*:` breakpoint prefixes** | Never use `max-sm:`, `max-md:`, `max-lg:`. These are desktop-first overrides. If you find yourself writing `max-*:`, you started from the wrong direction — rewrite from mobile up. |
| **Build and test mobile viewport first** | Before checking desktop, every component must look correct at 375px width. Open the browser at mobile size first, not as an afterthought. |
| **Touch targets by default** | Base interactive element sizing is 44×44 CSS px. Desktop can optionally tighten via `lg:` if needed — mobile never compensates upward. |
| **Content hierarchy before layout** | Stack content vertically (mobile-natural) by default. Side-by-side arrangements are added at `sm:` or `lg:` breakpoints. |
| **Font sizes use fluid `clamp()`** | See DESIGNER.md type scale. Don't use fixed `text-sm` → `lg:text-base` stepping — use the fluid tokens that scale automatically. |
| **Images are full-width by default** | `w-full` on mobile, constrained at larger breakpoints (`sm:w-1/2`, `lg:max-w-md`). |
| **Test on real devices** | Chrome DevTools mobile simulation is a starting point, not a substitute. Test touch interactions, scroll behaviour, and keyboard avoidance on physical phones. |

### Tailwind Breakpoint Reference

These align with the design system breakpoints in DESIGNER.md:

```
Default (no prefix) = 0px+      → Mobile phones (375px target)
sm:                 = 640px+     → Large phones / small tablets
md:                 = 768px+     → Tablets
lg:                 = 1024px+    → Laptops / desktops
xl:                 = 1280px+    → Wide desktops
```

Every component's class list should read left-to-right as mobile → progressively wider. If a reviewer scans the classes and sees the base classes describe a desktop layout, that's a blocking review comment.

---

## Table of Contents

1. [Mobile-First Development](#mobile-first-development-non-negotiable)
2. [Component Architecture](#1-component-architecture)
3. [Reusability Rules](#2-reusability-rules)
4. [Page & Layout Patterns](#3-page--layout-patterns)
5. [Supabase Client Setup](#4-supabase-client-setup)
6. [Authentication Flow](#5-authentication-flow)
7. [Client State](#6-client-state)
8. [Data Fetching & Realtime](#7-data-fetching--realtime)
9. [Forms & Validation](#8-forms--validation)
10. [File Upload & Scan Flow](#9-file-upload--scan-flow)
11. [Font Preview System](#10-font-preview-system)
12. [Accessibility](#11-accessibility)
13. [Performance](#12-performance)
14. [SEO & Internationalisation](#13-seo--internationalisation)
15. [Browser Extension Popup](#14-browser-extension-popup)
16. [Testing](#15-testing)
17. [Anti-Patterns (Never Do)](#16-anti-patterns)

---

## 1. Component Architecture

### Atomic Layers

```
components/
├── ui/          # Atoms — zero business logic, maximum reuse
│   ├── button.tsx
│   ├── input.tsx
│   ├── card.tsx
│   ├── icon.tsx
│   ├── spinner.tsx
│   ├── progress-bar.tsx
│   ├── tooltip.tsx
│   ├── dialog.tsx
│   └── visually-hidden.tsx
├── compose/     # Molecules — combine ui/ atoms for a domain purpose
│   ├── upload-zone.tsx
│   ├── glyph-grid.tsx
│   ├── glyph-cell.tsx
│   ├── font-preview-card.tsx
│   ├── character-template.tsx
│   ├── scan-status-badge.tsx
│   └── font-specimen.tsx
└── layout/      # Organisms — page-level shells
    ├── app-shell.tsx
    ├── nav-bar.tsx
    ├── sidebar.tsx
    └── footer.tsx
```

### Component Contract

Every component must satisfy:

```tsx
// 1. Props type is exported and co-located
export type ButtonProps = {
  /** Visual weight */
  variant: 'primary' | 'secondary' | 'ghost' | 'danger'
  /** Accessible size — touch target ≥ 44px */
  size: 'sm' | 'md' | 'lg'
  /** Shows spinner and disables interaction */
  isLoading?: boolean
  children: React.ReactNode
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'>

// 2. Forwarded ref for composition
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, isLoading, children, ...rest }, ref) => {
    // 3. Variants via a lookup map, never long ternary chains
    return (
      <button
        ref={ref}
        className={cn(baseStyles, variantMap[variant], sizeMap[size])}
        disabled={isLoading || rest.disabled}
        aria-busy={isLoading || undefined}
        {...rest}
      >
        {isLoading ? <Spinner size="inherit" /> : children}
      </button>
    )
  }
)
Button.displayName = 'Button'
```

Rules enforced:
- `forwardRef` on every `ui/` component.
- Props type is always exported alongside the component.
- No `className` prop on `ui/` atoms — styling is controlled via `variant` / `size` tokens. `compose/` components may accept `className` via `cn()` merge.
- Spread remaining native HTML attributes last (`...rest`) so consumers can pass `aria-*`, `data-*`, event handlers without the component needing to know.

### `cn()` — the only class merging utility

```ts
// lib/cn.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

Import from `@/lib/cn` everywhere. Never use string concatenation for Tailwind classes.

---

## 2. Reusability Rules

These are non-negotiable. Violating any one is a blocking review comment.

| Rule | Detail |
|------|--------|
| **Single Responsibility** | A component does one thing. If you're writing `&&` branches that render entirely different UI, split into two components. |
| **Extract on Second Use** | The moment you reach for copy-paste, extract. No exceptions. |
| **Props over Internal Branching** | Prefer `<Card variant="elevated">` over `<Card>` that checks an internal flag. Variants are explicit. |
| **Hooks for Shared Logic** | If two components share stateful logic (timers, resize observers, Supabase subscriptions), extract into `hooks/use-*.ts`. |
| **Compound Components** | For complex widgets (Tabs, Accordion, GlyphGrid), use the compound component pattern with Context so children communicate without prop drilling. |
| **No Inline Styles** | Zero `style={{}}`. All visual properties go through Tailwind utilities or CSS variables. The single exception is `fontFamily` in `FontSpecimen` where the value is dynamic and runtime-only. |
| **No Magic Strings** | All string literals that appear more than once are constants in `lib/constants.ts`. All enum-like values are TypeScript unions. |

### Composition Example — GlyphGrid

```tsx
// compose/glyph-grid.tsx — compound component
const GlyphGridContext = createContext<GlyphGridState | null>(null)

export function GlyphGrid({ children, columns = 10 }: GlyphGridProps) {
  const state = useGlyphGridState(columns)
  return (
    <GlyphGridContext.Provider value={state}>
      <div role="grid" aria-label="Character glyph grid" className={gridStyles(columns)}>
        {children}
      </div>
    </GlyphGridContext.Provider>
  )
}

// compose/glyph-cell.tsx — consumes context
export function GlyphCell({ char, glyphData }: GlyphCellProps) {
  const { selectGlyph, selectedChar } = useGlyphGrid() // throws if outside provider
  const isSelected = selectedChar === char
  return (
    <button
      role="gridcell"
      aria-selected={isSelected}
      onClick={() => selectGlyph(char)}
      className={cn(cellBase, isSelected && cellSelected)}
    >
      {glyphData ? <GlyphPreview data={glyphData} /> : <EmptyGlyph char={char} />}
    </button>
  )
}
```

---

## 3. Page & Layout Patterns

### Server Components by Default

Every `page.tsx` and `layout.tsx` is a React Server Component unless it needs interactivity. If a page needs one interactive island, keep the page as RSC and `"use client"` only the interactive subtree.

```tsx
// app/(auth)/dashboard/page.tsx — Server Component
import { createServerSupabase } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createServerSupabase()
  const { data: fonts } = await supabase
    .from('fonts')
    .select('id, family_name, glyph_count, created_at, woff2_key')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })

  return (
    <section aria-labelledby="my-fonts-heading">
      <h1 id="my-fonts-heading">My Fonts</h1>
      <FontList fonts={fonts ?? []} />              {/* server-rendered list */}
      <CreateFontCTA />                              {/* client island for upload */}
    </section>
  )
}
```

### Route Group Conventions

```
app/
├── (marketing)/          # Public pages — landing, pricing, about
│   ├── layout.tsx        # Marketing shell (different nav)
│   └── page.tsx          # Landing page
├── (auth)/               # Authenticated pages
│   ├── layout.tsx        # App shell with sidebar
│   ├── dashboard/
│   ├── create/           # The scan → generate flow
│   │   ├── template/     # Step 1: download/view template
│   │   ├── upload/       # Step 2: upload scan
│   │   ├── review/       # Step 3: review extracted glyphs
│   │   └── generate/     # Step 4: generate & preview font
│   ├── fonts/[id]/       # Font detail + download
│   └── settings/
├── auth/
│   ├── login/            # Magic link + OAuth buttons
│   ├── callback/         # Supabase auth callback handler
│   └── confirm/          # Email confirmation landing
└── api/                  # Route Handlers (see BACKEND.md)
```

### Multi-Step Flow State

The create flow (template → upload → review → generate) uses a Zustand store synced to URL search params so each step is bookmarkable and the back button works.

```tsx
// stores/create-flow-store.ts
type CreateFlowState = {
  step: 'template' | 'upload' | 'review' | 'generate'
  scanId: string | null
  extractedGlyphs: Map<string, GlyphData> | null
  generatedFontUrl: string | null
  actions: {
    setStep: (step: CreateFlowState['step']) => void
    setScanId: (id: string) => void
    setExtractedGlyphs: (glyphs: Map<string, GlyphData>) => void
    setGeneratedFontUrl: (url: string) => void
    reset: () => void
  }
}
```

---

## 4. Supabase Client Setup

Three client variants, each used in its correct context. Never import the wrong one.

```ts
// lib/supabase/client.ts — browser only ("use client" components)
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

export function createBrowserSupabase() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

```ts
// lib/supabase/server.ts — Server Components, Route Handlers, Server Actions
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

export async function createServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    },
  )
}
```

```ts
// lib/supabase/admin.ts — server-only, bypasses RLS for background jobs
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
```

### Rules

- `createBrowserSupabase()` — only in `"use client"` files.
- `createServerSupabase()` — in Server Components, Route Handlers, Server Actions. Respects RLS via the user's session cookie.
- `supabaseAdmin` — only in `src/server/` for background workers and admin operations. Never import in client code. Never import in Route Handlers unless explicitly performing an admin action (e.g. creating system records).

---

## 5. Authentication Flow

### Middleware

```ts
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value)
            res.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Redirect unauthenticated users away from protected routes
  if (!user && req.nextUrl.pathname.startsWith('/(auth)')) {
    return NextResponse.redirect(new URL('/auth/login', req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
}
```

### Auth Hook

```tsx
// hooks/use-auth.ts
import { createBrowserSupabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createBrowserSupabase()
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      router.refresh()
    })

    return () => subscription.unsubscribe()
  }, [supabase, router])

  return { user, loading }
}
```

---

## 6. Client State

### Zustand — Rules

- One store per domain concern (`create-flow-store`, `font-store`, `ui-store`).
- Actions are always namespaced inside an `actions` key.
- Selectors are used at the call site — never subscribe to the whole store.

```tsx
// GOOD — selective subscription
const step = useCreateFlowStore(s => s.step)

// BAD — re-renders on any state change
const store = useCreateFlowStore()
```

- Derived state uses `useMemo` in the component, not a getter in the store.
- Persist middleware only for `ui-store` (theme, sidebar collapsed). Never persist domain data — that lives in Supabase.

---

## 7. Data Fetching & Realtime

| Scenario | Method |
|----------|--------|
| Page load data | `async` Server Component with `createServerSupabase()` query |
| Client-side mutations | Server Actions (`'use server'`) using `createServerSupabase()` |
| Live pipeline status | Supabase Realtime subscription (see below) |
| File uploads | Client `fetch()` to Route Handler with `FormData` |

### Realtime — Pipeline Status

Instead of polling, subscribe to row changes on the `scans` table:

```tsx
// hooks/use-scan-status.ts
import { createBrowserSupabase } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import type { ScanStatus } from '@/types'

export function useScanStatus(scanId: string | null) {
  const [status, setStatus] = useState<ScanStatus | null>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!scanId) return

    const supabase = createBrowserSupabase()

    const channel = supabase
      .channel(`scan-${scanId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scans',
          filter: `id=eq.${scanId}`,
        },
        (payload) => {
          const row = payload.new as { status: ScanStatus; progress: number }
          setStatus(row.status)
          setProgress(row.progress)
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [scanId])

  return { status, progress }
}
```

This replaces all polling. The backend updates `scans.status` and `scans.progress` columns as the pipeline advances, and the client receives the change in real time.

---

## 8. Forms & Validation

- Schema: Zod. Defined once in `types/`, shared between client validation and server action.
- Form library: React Hook Form + `@hookform/resolvers/zod`.
- Every form field uses the reusable `<FormField>` wrapper that handles label, error message, and description.

```tsx
// components/ui/form-field.tsx
export function FormField({ label, error, description, children, id }: FormFieldProps) {
  return (
    <div className={fieldWrapper}>
      <label htmlFor={id} className={labelStyles}>{label}</label>
      {description && <p id={`${id}-desc`} className={descStyles}>{description}</p>}
      {children}
      {error && <p id={`${id}-error`} role="alert" className={errorStyles}>{error}</p>}
    </div>
  )
}
```

---

## 9. File Upload & Scan Flow

### UploadZone Component

Reusable across any file-upload context. Accepts `accept`, `maxSizeMB`, `onFilesAccepted`, `onError`.

```tsx
export function UploadZone({
  accept = { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
  maxSizeMB = 20,
  multiple = false,
  onFilesAccepted,
  onError,
}: UploadZoneProps) { ... }
```

Features:
- Drag-and-drop with visual feedback (border highlight, icon swap).
- Click to open file picker.
- Client-side validation (file type, size) before upload.
- Progress bar via the reusable `<ProgressBar>` ui component.
- Accessible: `role="button"`, keyboard activatable, screen reader announcements for upload progress via `aria-live` region.

### Camera Capture (Mobile)

On mobile, offer `capture="environment"` as an alternative to file picker so users can photograph their template sheet directly.

```tsx
{isMobile && (
  <Button variant="secondary" onClick={openCamera} aria-label="Take a photo of your template">
    <Icon name="camera" /> Scan with Camera
  </Button>
)}
```

### Client-Side Crop & Deskew

Before uploading, allow the user to crop and rotate the image using a canvas-based `<ScanEditor>` component. This reduces server processing and gives the user control. Use the HTML Canvas API — no external image editing libraries on the client.

### Upload Path

1. Client validates file → crops/rotates → sends `FormData` to `POST /api/scans`.
2. Route Handler uploads to R2, inserts row into `scans` table, enqueues job.
3. Client receives `scanId` → subscribes via `useScanStatus(scanId)` for live updates.

---

## 10. Font Preview System

### Live Preview Component

`<FontSpecimen>` renders sample text in the user's generated font using `@font-face` injection:

```tsx
export function FontSpecimen({ fontUrl, sampleText, className }: FontSpecimenProps) {
  const fontFamily = useFontFace(fontUrl) // hook that creates/cleans up @font-face rule
  return (
    <div className={cn(specimenBase, className)} style={{ fontFamily }}>
      {/* EXCEPTION: style prop justified — fontFamily is dynamic and runtime-only */}
      <p className="text-4xl">{sampleText}</p>
      <p className="text-lg">{PANGRAM}</p>
      <p className="text-sm">{ALPHABET_FULL}</p>
    </div>
  )
}
```

### `useFontFace` Hook

```tsx
// hooks/use-font-face.ts
export function useFontFace(url: string | null): string | undefined {
  const [family, setFamily] = useState<string>()

  useEffect(() => {
    if (!url) return
    const familyName = `inkprint-${crypto.randomUUID().slice(0, 8)}`
    const font = new FontFace(familyName, `url(${url})`)
    font.load().then(loaded => {
      document.fonts.add(loaded)
      setFamily(familyName)
    })
    return () => {
      document.fonts.forEach(f => {
        if (f.family === familyName) document.fonts.delete(f)
      })
    }
  }, [url])

  return family
}
```

### Font URLs

Font files are stored in **Cloudflare R2** (not AWS S3). The backend issues pre-signed R2 URLs (via `@aws-sdk/s3-request-presigner` pointed at the R2 endpoint) with short TTLs. The frontend never sees raw R2 object keys — only signed URLs returned through the API. Do not attempt to construct R2 URLs client-side or interact with R2 directly from the browser.

---

## 11. Accessibility

Every PR is reviewed against these criteria.

| Requirement | Implementation |
|---|---|
| Semantic HTML | `<nav>`, `<main>`, `<section>`, `<article>`, `<h1>`–`<h6>` hierarchy. Never `<div>` soup. |
| Keyboard navigation | Every interactive element reachable via Tab. Custom widgets implement WAI-ARIA patterns (grid, tabs, dialog). |
| Focus management | After step transitions in the create flow, focus moves to the new step's heading. After dialog open, focus traps inside. |
| Screen reader | Pipeline progress and glyph extraction results announced via `aria-live="polite"` regions. Realtime updates trigger announcements. |
| Motion | Respect `prefers-reduced-motion`. All CSS transitions/animations wrapped in `@media (prefers-reduced-motion: no-preference)`. |
| Colour contrast | All text meets WCAG AA (4.5:1 normal, 3:1 large). Interactive elements have visible focus indicators at 3:1 against adjacent colours. |
| Touch targets | Minimum 44×44 CSS px on all interactive elements. |
| Error handling | Form errors linked via `aria-describedby`. Focus moves to first error on submission failure. |

---

## 12. Performance

- **Images**: Use `next/image` for all raster images. Scan previews served as WebP thumbnails from R2 via a custom domain / Cloudflare CDN.
- **Fonts**: Generated fonts served as WOFF2. Preloaded on the font detail page via `<link rel="preload" as="font">`.
- **Code splitting**: Each step of the create flow is a dynamic import (`next/dynamic`) so only the active step's JS is loaded.
- **Bundle monitoring**: `@next/bundle-analyzer` in CI. Any page exceeding 150 KB JS (gzipped) is flagged.
- **Skeleton screens**: Every async page has a `loading.tsx` with a skeleton that matches the final layout to avoid layout shift (CLS ≈ 0).
- **Supabase client**: `createBrowserSupabase()` is called once per component tree (via a provider or singleton pattern) — never instantiate multiple clients.

---

## 13. SEO & Internationalisation

Good SEO is a **non-negotiable** for every public-facing route. The marketing surface (`(marketing)` group) and font detail pages must be discoverable, shareable, and indexable. Auth-gated routes (`(auth)` group) are excluded from indexing.

### SEO Requirements

| Requirement | Implementation |
|---|---|
| **Metadata on every route** | Every `page.tsx` (and `layout.tsx` where appropriate) exports `metadata` or `generateMetadata`. No route ships without a title and description. |
| **Per-route `title` + `description`** | Use `generateMetadata` for dynamic routes (e.g. font detail pages — title includes the font family name). Never rely on inherited defaults for indexable pages. |
| **OpenGraph + Twitter cards** | Every public route sets `openGraph` and `twitter` fields. Font detail pages generate a dynamic OG image (`opengraph-image.tsx`) that renders the font specimen. |
| **Canonical URLs** | `metadata.alternates.canonical` set on every public route. Prevents duplicate-content penalties from query-string variants. |
| **Structured data (JSON-LD)** | Font detail pages emit `CreativeWork` JSON-LD. Marketing pages emit `Organization` / `WebSite`. Inject via `<script type="application/ld+json">` in the layout, not via third-party libraries. |
| **`sitemap.ts` + `robots.ts`** | Generated by Next.js. `sitemap.ts` enumerates marketing routes and public font detail pages (where the font is marked public). Auth routes are excluded. `robots.ts` disallows `/auth`, `/api`, and the `(auth)` group. |
| **Server-rendered content** | Critical content is in the RSC payload, never injected by client-side JS. Crawlers must see the full page on first response. (Already enforced by §3.) |
| **Semantic HTML + heading hierarchy** | Single `<h1>` per page; logical `<h2>`–`<h6>` order. (Already enforced by §11.) |
| **Image alt text** | Every `<Image>` has a meaningful `alt`. Decorative images use `alt=""`. Font preview images on detail pages describe the font family. |
| **Core Web Vitals** | LCP < 2.5s, INP < 200ms, CLS < 0.1 on a mid-tier mobile device. (Already enforced by §12.) |

### Metadata Example

```tsx
// app/(marketing)/page.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'InkPrint — Turn your handwriting into a font',
  description: 'Scan a single template sheet and InkPrint generates a personal handwriting font you can use anywhere.',
  alternates: { canonical: 'https://inkprint.app/' },
  openGraph: {
    title: 'InkPrint — Turn your handwriting into a font',
    description: 'Scan a single template sheet and InkPrint generates a personal handwriting font.',
    url: 'https://inkprint.app/',
    siteName: 'InkPrint',
    images: [{ url: '/og/landing.png', width: 1200, height: 630 }],
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
};
```

```tsx
// app/(auth)/fonts/[id]/page.tsx — dynamic
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: font } = await supabase.from('fonts').select('family_name, is_public').eq('id', id).single();

  if (!font?.is_public) return { robots: { index: false, follow: false } };

  return {
    title: `${font.family_name} — InkPrint`,
    description: `A handwriting font created with InkPrint. Preview and download ${font.family_name}.`,
    alternates: { canonical: `https://inkprint.app/fonts/${id}` },
    openGraph: { images: [`/api/og/font/${id}`] },
  };
}
```

### Internationalisation (Deferred)

InkPrint will ship English-only for v1. **Full i18n is deferred**, but write code today that doesn't make it expensive tomorrow:

- **No hardcoded user-facing strings in components.** Pull copy through a `lib/copy.ts` constants module (or per-feature `copy.ts`) so the swap to a translation library is mechanical, not archeological.
- **Use logical CSS properties where they cost nothing.** Prefer `ps-*` / `pe-*` / `ms-*` / `me-*` over `pl-*` / `pr-*` / `ml-*` / `mr-*` for text-adjacent spacing. Layout grids can stay directional.
- **Set `lang` correctly.** The root `<html lang="en">` is set in `app/layout.tsx` today. A future locale segment (`app/[locale]/`) will override it per request.
- **Date, number, and currency formatting via `Intl.*`** — never string concatenation. `Intl.DateTimeFormat`, `Intl.NumberFormat`. Locale defaults to `'en'` for now.
- **Don't build an i18n abstraction yet.** No `t('key')` wrappers, no `next-intl` install, no message catalogues. The constants module is enough until i18n is a real requirement.

When i18n becomes a priority, the migration path is: introduce `next-intl` (or App Router's built-in `[locale]` segment), point it at the existing copy constants, and add per-locale catalogues. No component rewrites required.

---

## 14. Browser Extension Popup

The extension popup (`extension/popup/`) is a lightweight React app (bundled separately via Vite) that lets the user toggle their font on/off and pick which font to apply.

- Shares type definitions with the main app (`types/` imported at build time).
- Authenticates with Supabase directly — the user logs in via the popup, and the Supabase session is stored in `chrome.storage.session`.
- Fetches the user's font list from Supabase directly (the `fonts` table is protected by RLS so only the user's own fonts are returned).
- Sends messages to `content.js` to inject/remove the `@font-face` override.
- The popup UI reuses the same design tokens (colours, radii, spacing) exported as CSS variables from the main app's Tailwind config.

---

## 15. Testing

| Layer | Tool | What to Test |
|---|---|---|
| Component unit | Vitest + Testing Library | Render, interaction, state, a11y (`axe-core`) |
| Hook unit | Vitest + `renderHook` | State transitions, cleanup, Supabase subscription lifecycle |
| Integration | Playwright | Full create flow (upload → review → generate → preview) |
| Visual | Storybook + Chromatic | UI consistency, responsive snapshots |

### Test File Convention

```
components/
├── ui/
│   ├── button.tsx
│   └── button.test.tsx      # co-located
hooks/
├── use-font-face.ts
└── use-font-face.test.ts    # co-located
```

### Mocking Supabase

Use a shared mock factory in `tests/mocks/supabase.ts` that stubs `createBrowserSupabase` and `createServerSupabase`. Never mock internal Supabase internals — mock at the client boundary.

---

## 16. Anti-Patterns

These are **blocking errors** — code containing any of these does not merge.

| Anti-Pattern | Why | Do Instead |
|---|---|---|
| Copy-pasting a component and changing 2 props | Violates reusability; creates drift | Add a variant prop or extract shared base |
| `useEffect` for derived state | Causes unnecessary re-renders | `useMemo` or compute inline |
| Fetching in `useEffect` on page load | Misses RSC; creates waterfalls | Fetch in the Server Component or use Realtime |
| Calling `createBrowserSupabase()` in a Server Component | Wrong client for the context; breaks auth | Use `createServerSupabase()` on the server |
| Importing `supabaseAdmin` in client code | Leaks the service role key | Admin client is server-only, in `src/server/` |
| `any` or un-annotated `as` | Breaks type safety | Type properly or add `// SAFETY:` justification |
| Global CSS outside `styles/` | Unpredictable cascade | Tailwind utilities or CSS Modules |
| `console.log` in committed code | Pollution | Remove or use structured logger |
| `"use client"` on a page.tsx | Ships unnecessary JS | Keep page as RSC; extract client islands |
| Inline `onClick={() => fetch(...)}` | Untestable, no error handling | Extract into a hook or server action |
| Color/spacing literals | Inconsistent design | Use Tailwind tokens or CSS variables |
| Desktop-first Tailwind (`max-sm:`, `max-md:`) | Violates mobile-first methodology; creates overrides instead of progressive enhancement | Base classes are mobile; add `sm:`, `md:`, `lg:` for wider viewports |
| Base layout is `flex-row` / multi-column | Desktop assumption; mobile is stacked by default | Start `flex-col`, add `sm:flex-row` or `lg:grid-cols-2` |
| Polling `setInterval` for pipeline status | Wasteful; Realtime exists | Use `useScanStatus` hook with Supabase Realtime |
| Multiple Supabase client instances in one tree | Wastes connections, breaks subscription tracking | Single instance via provider or module-level singleton |