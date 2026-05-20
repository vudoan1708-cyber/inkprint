# InkPrint — Backend Reference

You are the **backend architect** for InkPrint. You design and implement the server-side systems: API routes, image processing, font generation pipeline, Supabase database schema, Cloudflare R2 storage, database-driven job queue, authentication via Supabase Auth, and the browser extension's content script. You write TypeScript (strict), favour deterministic pipelines, and never tolerate dead code, redundant logic, or unvalidated input.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [API Design](#2-api-design)
3. [Authentication & Authorisation](#3-authentication--authorisation)
4. [Database Schema & Migrations](#4-database-schema--migrations)
5. [Row-Level Security (RLS)](#5-row-level-security-rls)
6. [Cloudflare R2 Storage](#6-cloudflare-r2-storage)
7. [Job Queue (Database-Driven)](#7-job-queue-database-driven)
8. [Image Processing Pipeline](#8-image-processing-pipeline)
9. [Font Generation Pipeline](#9-font-generation-pipeline)
10. [Realtime Status Updates](#10-realtime-status-updates)
11. [Browser Extension Content Script](#11-browser-extension-content-script)
12. [Error Handling & Logging](#12-error-handling--logging)
13. [Security](#13-security)
14. [Testing](#14-testing)
15. [Anti-Patterns](#15-anti-patterns)

---

## 1. Architecture Overview

```
Client Upload
      │
      ▼
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│  Route Handler   │────▶│  jobs table      │────▶│  Worker (cron/Edge)  │
│  POST /api/scans │     │  (Postgres queue) │     │                      │
└─────────────────┘     └──────────────────┘     │  1. Preprocess        │
                                                  │  2. Segment           │
                                                  │  3. Vectorise         │
                              ┌─────────┐        │  4. Assemble          │
                              │ Realtime │◀───────│  5. Compile           │
                              │ (status) │        └───────┬──────────────┘
                              └─────────┘                │
                                                  ┌───────▼──────────┐
                                                  │  Cloudflare R2   │
                                                  │  (scans + fonts) │
                                                  └──────────────────┘
```

Every mutation flows through: **validate → authenticate → enqueue → process → store → notify (via Realtime)**. Route Handlers are thin — they validate input, verify auth, enqueue work, and return immediately. Heavy lifting happens in background workers. Status changes are pushed to the client via Supabase Realtime (Postgres Changes on the `scans` table).

---

## 2. API Design

### Route Handler Structure

All Route Handlers live in `src/app/api/` and follow an identical skeleton. No business logic in the handler — it delegates to a service.

```ts
// app/api/scans/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { uploadScanSchema } from '@/types/scan-schemas'
import { ScanService } from '@/server/services/scan-service'
import { ApiError, handleApiError } from '@/lib/api-error'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw ApiError.unauthorized()

    const formData = await req.formData()
    const input = uploadScanSchema.parse({
      file: formData.get('file'),
      templateId: formData.get('templateId'),
    })

    const result = await ScanService.initiate(supabase, input, user.id)
    return NextResponse.json({ ok: true, data: result }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
```

### Endpoint Inventory

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `POST` | `/api/scans` | Upload scan image, store in R2, enqueue processing | Yes |
| `GET` | `/api/scans/[id]` | Get scan status + extracted glyphs | Yes |
| `PATCH` | `/api/scans/[id]/glyphs` | Submit glyph corrections after review | Yes |
| `POST` | `/api/fonts/generate` | Trigger font generation from processed scan | Yes |
| `GET` | `/api/fonts` | List user's generated fonts | Yes |
| `GET` | `/api/fonts/[id]` | Font metadata + signed download URLs | Yes |
| `DELETE` | `/api/fonts/[id]` | Soft-delete a font | Yes |
| `GET` | `/api/fonts/[id]/file` | Redirect to signed R2 URL for font file | Yes |
| `GET` | `/api/templates` | List available character templates | No |
| `GET` | `/api/templates/[id]/pdf` | Redirect to signed R2 URL for template PDF | No |
| `POST` | `/api/worker/process` | Internal: worker endpoint (service-role auth) | Service key |

### Response Envelope

Every API response uses a consistent envelope:

```ts
// lib/api-response.ts
type ApiSuccessResponse<T> = { ok: true; data: T }
type ApiErrorResponse = {
  ok: false
  error: {
    code: string        // Machine-readable: 'SCAN_TOO_LARGE', 'GLYPH_NOT_FOUND'
    message: string     // Human-readable
    details?: unknown   // Zod issues, etc.
  }
}
type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse
```

### Input Validation

Every endpoint validates input with Zod. Schemas live in `types/` and are shared with the frontend.

```ts
// types/scan-schemas.ts
import { z } from 'zod'
import { MAX_SCAN_SIZE_BYTES } from '@/lib/constants'

export const uploadScanSchema = z.object({
  file: z.instanceof(File)
    .refine(f => f.size <= MAX_SCAN_SIZE_BYTES, 'File exceeds 20 MB limit')
    .refine(f => ['image/png', 'image/jpeg', 'image/webp'].includes(f.type), 'Unsupported image format'),
  templateId: z.string().uuid(),
})

export type UploadScanInput = z.infer<typeof uploadScanSchema>
```

---

## 3. Authentication & Authorisation

- **Supabase Auth** handles sessions, magic links, and OAuth (Google, GitHub).
- **`@supabase/ssr`** integrates with Next.js middleware for cookie-based sessions.
- Every Route Handler calls `supabase.auth.getUser()` — never `getSession()` alone (sessions can be stale; `getUser()` validates the JWT against Supabase).
- Resource ownership is enforced at two layers:
  1. **RLS policies** on every table (see section 5) — even if app code has a bug, the database rejects unauthorised access.
  2. **Service-layer checks** — services receive `userId` and include it in queries as a defence-in-depth measure.
- The browser extension authenticates directly with Supabase Auth. The popup calls `supabase.auth.signInWithOAuth()` or magic link, and the session is stored in `chrome.storage.session`.

---

## 4. Database Schema & Migrations

### Migration Workflow

Supabase runs as a hosted project in **Europe** from day one — there is no local Supabase instance. The hosted project's API is used in development and production. Migrations are written locally as SQL files and pushed directly to the remote project.

```bash
# Create a new migration file
supabase migration new add_glyph_quality_score

# Edit supabase/migrations/<timestamp>_add_glyph_quality_score.sql

# Push migration to the remote Supabase project
supabase db push

# Generate updated TypeScript types from the remote schema
supabase gen types typescript --project-id <project_id> > src/types/supabase.ts
```

### Supabase CLI Link

Before running any migration commands, link the local project directory to the hosted Supabase project:

```bash
supabase link --project-ref <project_id>
```

This is a one-time setup per developer. After linking, `supabase db push` and `supabase gen types` target the remote project automatically.

### Seeding

Seed data is applied via a `supabase/seed.sql` file. Run it manually against the remote project when needed:

```bash
# Apply seed data to the remote project
supabase db push  # migrations first
psql <connection_string> -f supabase/seed.sql
```

**Every schema change produces a migration file and a regenerated `types/supabase.ts`. No exceptions.**

### Schema (SQL)

```sql
-- supabase/migrations/00001_initial_schema.sql

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- Templates (system-defined, no RLS needed — public read)
create table templates (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,                              -- 'Latin Basic', 'Latin Extended'
  char_set    jsonb not null,                             -- array of code points
  grid_rows   int not null,
  grid_cols   int not null,
  pdf_key     text not null,                              -- R2 object key
  created_at  timestamptz default now()
);

-- Scans
create table scans (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  template_id   uuid not null references templates(id),
  status        text not null default 'uploaded'
                check (status in ('uploaded','processing','segmented','review','approved','generating','complete','failed')),
  progress      int not null default 0 check (progress between 0 and 100),
  original_key  text not null,                            -- R2 key for original upload
  processed_key text,                                     -- R2 key for preprocessed image
  error         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index idx_scans_user_status on scans(user_id, status);

-- Glyphs
create table glyphs (
  id            uuid primary key default uuid_generate_v4(),
  scan_id       uuid not null references scans(id) on delete cascade,
  code_point    int not null,
  char          text not null,
  svg_path      text not null,
  width         int not null,
  quality       float not null,
  needs_review  boolean default false,
  corrected     boolean default false,
  unique(scan_id, code_point)
);

create index idx_glyphs_scan on glyphs(scan_id);

-- Fonts
create table fonts (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  scan_id       uuid unique not null references scans(id),
  family_name   text not null,
  otf_key       text not null,                            -- R2 keys
  ttf_key       text not null,
  woff2_key     text not null,
  glyph_count   int not null,
  is_deleted    boolean default false,
  created_at    timestamptz default now()
);

create index idx_fonts_user on fonts(user_id) where not is_deleted;

-- User preferences (active font, etc.)
create table user_preferences (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  active_font_id uuid references fonts(id) on delete set null,
  updated_at    timestamptz default now()
);

-- Jobs queue table
create table jobs (
  id            uuid primary key default uuid_generate_v4(),
  type          text not null check (type in ('scan_process', 'font_generate')),
  payload       jsonb not null,
  status        text not null default 'pending'
                check (status in ('pending', 'running', 'complete', 'failed')),
  attempts      int default 0,
  max_attempts  int default 3,
  locked_at     timestamptz,
  locked_by     text,
  error         text,
  created_at    timestamptz default now(),
  completed_at  timestamptz
);

create index idx_jobs_pending on jobs(status, created_at) where status = 'pending';

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger scans_updated_at
  before update on scans
  for each row execute function update_updated_at();

create trigger user_preferences_updated_at
  before update on user_preferences
  for each row execute function update_updated_at();
```

### Supabase Realtime

Enable Realtime on the `scans` table so the frontend receives live status/progress updates:

```sql
alter publication supabase_realtime add table scans;
```

---

## 5. Row-Level Security (RLS)

RLS is enabled on **every table** except `templates` (public read).

```sql
-- Scans: users see only their own
alter table scans enable row level security;

create policy "Users read own scans"
  on scans for select using (auth.uid() = user_id);

create policy "Users insert own scans"
  on scans for insert with check (auth.uid() = user_id);

-- No user-facing update/delete policies on scans — only the service role modifies them.

-- Glyphs: accessible if the user owns the parent scan
alter table glyphs enable row level security;

create policy "Users read own glyphs"
  on glyphs for select using (
    exists (select 1 from scans where scans.id = glyphs.scan_id and scans.user_id = auth.uid())
  );

create policy "Users update own glyphs"
  on glyphs for update using (
    exists (select 1 from scans where scans.id = glyphs.scan_id and scans.user_id = auth.uid())
  );

-- Fonts: users see only their own
alter table fonts enable row level security;

create policy "Users read own fonts"
  on fonts for select using (auth.uid() = user_id and not is_deleted);

create policy "Users soft-delete own fonts"
  on fonts for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- User preferences
alter table user_preferences enable row level security;

create policy "Users manage own preferences"
  on user_preferences for all using (auth.uid() = user_id);

-- Jobs: no user-facing policies — only service role accesses this table
alter table jobs enable row level security;
```

---

## 6. Cloudflare R2 Storage

**This project uses Cloudflare R2, not AWS S3.** R2 exposes an S3-compatible API, so we use `@aws-sdk/client-s3` v3 as the client, but R2 has important differences from S3. Never assume AWS S3 behaviour — always verify against R2's constraints below.

### R2 vs S3 — Key Differences

| Concern | AWS S3 | Cloudflare R2 |
|---------|--------|---------------|
| Region | Real regions (`us-east-1`, etc.) | **Always `'auto'`** — R2 is globally distributed, there are no selectable regions |
| Endpoint | `https://s3.<region>.amazonaws.com` | **`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`** |
| Egress fees | Per-GB egress charges | **Zero egress fees** — this is why we chose R2 |
| Transfer Acceleration | Supported | **Does not exist** — never reference it |
| S3 Lifecycle Rules | Full support | **Not supported** — use Cloudflare dashboard object lifecycle rules or manual cleanup |
| Object versioning | Supported | **Not supported** — no `ListObjectVersions` |
| Bucket notifications / events | S3 Event Notifications, EventBridge | **Not supported** — use Cloudflare Workers if event-driven logic is needed |
| Public access | Bucket policies, ACLs | **R2 custom domains** (attach a domain in the Cloudflare dashboard → objects served publicly via Cloudflare CDN) or **pre-signed URLs** |
| CORS | Set via SDK (`PutBucketCors`) | **Set in the Cloudflare dashboard** under the R2 bucket settings — not via the SDK |
| Multipart upload | 5 MB minimum part size | **Same** — works identically via `@aws-sdk/client-s3` |
| `@aws-sdk` version | v2 or v3 | **Must use v3** (`@aws-sdk/client-s3`) — v2 has compatibility issues with R2 |

### R2 Client Setup

```ts
// lib/r2/client.ts
import { S3Client } from '@aws-sdk/client-s3'
import { env } from '@/lib/env'

export const r2Client = new S3Client({
  // R2 REQUIRES region: 'auto' — it is not a real AWS region.
  // Do NOT change this to 'us-east-1' or any other AWS region string.
  region: 'auto',

  // R2 endpoint format: https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com
  // Set R2_ENDPOINT in .env — never hardcode the account ID.
  endpoint: env.R2_ENDPOINT,

  credentials: {
    // Generate these in Cloudflare dashboard → R2 → Manage R2 API Tokens
    // These are R2-specific tokens, NOT AWS IAM credentials.
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
})
```

### Required Environment Variables

> **Do not read `.env*` to discover or verify these names.** The authoritative list of env var *names* lives in **`SKILL.md` → Environment Variables (Names Only)**. The block below is illustrative shape only — never copy real values into the conversation. See Universal Rule #9.

```env
# Cloudflare R2 — names only; real values live in .env (off-limits) / Vercel project settings
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_DOMAIN=
```

Validated at startup via Zod in `lib/env.ts`:

```ts
const r2Schema = z.object({
  R2_ENDPOINT: z.string().url().includes('r2.cloudflarestorage.com'),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  R2_PUBLIC_DOMAIN: z.string().url(),
})
```

### Storage Service

```ts
// lib/r2/storage.ts
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2Client } from './client'
import { env } from '@/lib/env'

const BUCKET = env.R2_BUCKET_NAME

/**
 * Build a deterministic, safe R2 object key from path segments.
 * Only UUIDs and controlled strings — never raw user input.
 */
function buildKey(...segments: string[]): string {
  return segments.join('/')
}

export const r2Storage = {
  async uploadScan(userId: string, scanId: string, buffer: Buffer, contentType: string): Promise<string> {
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'
    const key = buildKey('scans', userId, scanId, `original.${ext}`)
    await r2Client.send(new PutObjectCommand({
      Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType,
    }))
    return key
  },

  async uploadFont(userId: string, fontId: string, files: {
    otf: Buffer; ttf: Buffer; woff2: Buffer
  }): Promise<{ otfKey: string; ttfKey: string; woff2Key: string }> {
    const base = buildKey('fonts', userId, fontId)
    await Promise.all([
      r2Client.send(new PutObjectCommand({ Bucket: BUCKET, Key: `${base}/font.otf`, Body: files.otf, ContentType: 'font/otf' })),
      r2Client.send(new PutObjectCommand({ Bucket: BUCKET, Key: `${base}/font.ttf`, Body: files.ttf, ContentType: 'font/ttf' })),
      r2Client.send(new PutObjectCommand({ Bucket: BUCKET, Key: `${base}/font.woff2`, Body: files.woff2, ContentType: 'font/woff2' })),
    ])
    return { otfKey: `${base}/font.otf`, ttfKey: `${base}/font.ttf`, woff2Key: `${base}/font.woff2` }
  },

  /**
   * Generate a pre-signed R2 URL for private object access.
   * R2 pre-signed URLs work identically to S3 pre-signed URLs.
   */
  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(r2Client, new GetObjectCommand({
      Bucket: BUCKET, Key: key,
    }), { expiresIn })
  },

  /**
   * Public URL for objects served via the R2 custom domain (Cloudflare CDN).
   * Only use for intentionally public assets (template PDFs). Never for user scans or fonts.
   */
  getPublicUrl(key: string): string {
    return `${env.R2_PUBLIC_DOMAIN}/${key}`
  },

  async deleteObject(key: string): Promise<void> {
    await r2Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
  },
}
```

### R2 Bucket Configuration (Cloudflare Dashboard)

These settings are configured in the Cloudflare dashboard, not via code:

- **CORS**: Allow origins `https://inkprint.app` and the extension's Chrome origin. Allow methods `GET`, `PUT`. Allow headers `Content-Type`, `Content-Disposition`.
- **Custom domain**: `assets.inkprint.app` → enables public access to template PDFs via Cloudflare CDN. Objects under `templates/` are publicly readable; everything else requires pre-signed URLs.
- **Object lifecycle**: Set a 30-day auto-delete rule on the `scans/` prefix for original uploads (processed data is in the database; raw scans are disposable).

### Rules

- **Never expose raw R2 keys to the client.** Always issue pre-signed URLs with short TTLs (1 hour default, 15 min for extension).
- **Content-Disposition**: Set `Content-Disposition: attachment; filename="fontname.woff2"` on font uploads so the browser offers "Save As" on download.
- **Public vs private**: Template PDFs → public via R2 custom domain (`getPublicUrl()`). User scans and generated fonts → private, pre-signed URLs only (`getSignedUrl()`).
- **No S3-specific APIs**: Never use `ListObjectVersions`, `PutBucketLifecycle` (SDK version), Transfer Acceleration, S3 Select, or S3 Event Notifications — none of these exist on R2.
- **No `@aws-sdk` v2**: Only `@aws-sdk/client-s3` (v3) and `@aws-sdk/s3-request-presigner` (v3). Do not install `aws-sdk` (the v2 monolith).

---

## 7. Job Queue (Database-Driven)

Instead of BullMQ + Redis, the queue is a `jobs` table in Postgres with `FOR UPDATE SKIP LOCKED` for safe concurrent dequeuing.

### Enqueue

```ts
// server/queue/enqueue.ts
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { JobType, JobPayload } from '@/types/job-types'

export async function enqueueJob(type: JobType, payload: JobPayload) {
  const { error } = await supabaseAdmin
    .from('jobs')
    .insert({ type, payload })

  if (error) throw new Error(`Failed to enqueue job: ${error.message}`)
}
```

### Dequeue & Process (Worker)

The worker runs as a cron-triggered Supabase Edge Function or a self-hosted process that polls on a short interval. It claims a job atomically:

```sql
-- Claim the next pending job (called via supabaseAdmin.rpc)
create or replace function claim_job(worker_id text)
returns setof jobs as $$
  update jobs
  set status = 'running', locked_at = now(), locked_by = worker_id, attempts = attempts + 1
  where id = (
    select id from jobs
    where status = 'pending' and attempts < max_attempts
    order by created_at
    for update skip locked
    limit 1
  )
  returning *;
$$ language sql;
```

```ts
// server/queue/worker.ts
import { supabaseAdmin } from '@/lib/supabase/admin'
import { processScanJob } from '@/server/pipeline/scan-pipeline'
import { generateFontJob } from '@/server/pipeline/font-pipeline'

const WORKER_ID = `worker-${crypto.randomUUID().slice(0, 8)}`

export async function processNextJob() {
  const { data: jobs } = await supabaseAdmin.rpc('claim_job', { worker_id: WORKER_ID })
  if (!jobs?.length) return false

  const job = jobs[0]

  try {
    switch (job.type) {
      case 'scan_process':
        await processScanJob(job.payload)
        break
      case 'font_generate':
        await generateFontJob(job.payload)
        break
    }

    await supabaseAdmin
      .from('jobs')
      .update({ status: 'complete', completed_at: new Date().toISOString() })
      .eq('id', job.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await supabaseAdmin
      .from('jobs')
      .update({
        status: job.attempts >= job.max_attempts ? 'failed' : 'pending',
        error: message,
        locked_at: null,
        locked_by: null,
      })
      .eq('id', job.id)
  }

  return true
}
```

### Worker Invocation Strategies

| Strategy | How | Best For |
|----------|-----|----------|
| **Cron (pg_cron)** | `SELECT net.http_post('https://your-app.vercel.app/api/worker/process')` every 5 seconds | Low-volume, simple setup |
| **Supabase Edge Function** | Triggered by a database webhook on `jobs` insert | Event-driven, no polling |
| **Self-hosted worker** | Long-running Node process calling `processNextJob()` in a loop with a 1-second sleep | High-volume, lowest latency |

Pick the strategy that matches your scale. For InkPrint's early stage, pg_cron or Edge Function is sufficient.

### Stale Lock Recovery

A scheduled job (pg_cron, every 5 minutes) resets jobs that have been locked for too long:

```sql
update jobs
set status = 'pending', locked_at = null, locked_by = null
where status = 'running' and locked_at < now() - interval '10 minutes';
```

---

## 8. Image Processing Pipeline

Runs inside the worker. Each step is a pure function that takes input and returns output — no side effects between steps. After each step, the worker updates `scans.status` and `scans.progress` in the database, which triggers Realtime notifications to the client.

### Step 1 — Preprocess

Tool: **Sharp**

```ts
async function preprocess(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .grayscale()
    .normalize()             // stretch contrast
    .threshold(128)          // binarise to black/white
    .sharpen()
    .toFormat('png')
    .toBuffer()
}
```

### Step 2 — Deskew & Crop

Detect the template's registration marks (four corner crosses) to compute the affine transform. Apply deskew, then crop to the character grid boundary.

### Step 3 — Segment

Using the template's known grid layout (rows × columns, cell size in mm at known DPI), slice the preprocessed image into individual character cells. Each cell maps to a Unicode code point defined by the template.

```ts
type SegmentedGlyph = {
  codePoint: number      // e.g. 0x0041 for 'A'
  char: string           // 'A'
  imageBuffer: Buffer    // cropped PNG of this character cell
  bounds: BoundingBox    // tight bounding box within the cell
  quality: number        // 0–1 confidence that the cell contains a valid glyph
}
```

### Step 4 — Vectorise

Convert each raster glyph to vector outlines:

1. **Trace** — use `potrace` (via npm binding or CLI) to convert the bitmap to SVG paths.
2. **Simplify** — reduce excessive control points while preserving the handwriting's character (Douglas-Peucker, tolerance tuned per glyph size).
3. **Normalise** — scale outlines to a 1000-unit UPM (units per em) grid. Align baselines.
4. **Validate** — reject glyphs with zero area, excessive noise, or path count anomalies. Flag for user review.

```ts
type VectorGlyph = {
  codePoint: number
  char: string
  svgPath: string        // M... Z path data
  width: number          // advance width in UPM
  lsb: number            // left side bearing
  qualityScore: number
  needsReview: boolean
}
```

### Step 5 — Metrics Calculation

Compute global font metrics from the glyph set:

- **Baseline, ascender, descender, cap height, x-height** — derived from reference characters (H, x, p, d).
- **Kerning pairs** — analyse common pairs (AV, To, WA, etc.) and compute overlap-based kern values.

### Progress Updates

After each step, the worker updates the scan row:

```ts
await supabaseAdmin
  .from('scans')
  .update({ status: 'segmented', progress: 30 })
  .eq('id', scanId)
// → Supabase Realtime pushes this change to any subscribed client
```

---

## 9. Font Generation Pipeline

### Glyph Assembly (opentype.js)

```ts
import opentype from 'opentype.js'

function assembleFont(glyphs: VectorGlyph[], metrics: FontMetrics, meta: FontMeta): ArrayBuffer {
  const notdef = new opentype.Glyph({
    name: '.notdef', unicode: 0, advanceWidth: 650, path: new opentype.Path(),
  })

  const otGlyphs = [notdef, ...glyphs.map(g => {
    const path = opentype.Path.fromSVG(g.svgPath)
    return new opentype.Glyph({
      name: unicodeName(g.codePoint),
      unicode: g.codePoint,
      advanceWidth: g.width,
      path,
    })
  })]

  const font = new opentype.Font({
    familyName: meta.familyName,
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: metrics.ascender,
    descender: metrics.descender,
    glyphs: otGlyphs,
  })

  return font.download()
}
```

### Compilation (FontForge CLI)

opentype.js produces an OTF. Run FontForge to generate additional formats:

```bash
fontforge -script convert.pe input.otf output.ttf output.woff2
```

The `convert.pe` script (stored in `server/pipeline/fontforge/convert.pe`) handles hinting, WOFF2 compression, and validation.

### Output

Three files per font, uploaded to R2:

```
fonts/{userId}/{fontId}/
├── font.otf
├── font.ttf
└── font.woff2
```

After upload, the worker inserts a row into the `fonts` table with the R2 keys and updates `scans.status = 'complete'`.

---

## 10. Realtime Status Updates

The entire pipeline status flow uses Supabase Realtime — no polling anywhere.

```
Worker updates scans.status → Postgres triggers publication →
Supabase Realtime → WebSocket → client useScanStatus hook → UI re-renders
```

Requirements:
- The `scans` table must be added to the `supabase_realtime` publication.
- Realtime is filtered by `scan_id` on the client so each user only receives their own updates.
- RLS ensures a user cannot subscribe to another user's scan changes.

---

## 11. Browser Extension Content Script

`extension/content.js` is injected into every page the user visits. It:

1. On page load, checks `chrome.storage.session` for the active font URL and Supabase session.
2. If present, creates a `<style>` tag injecting an `@font-face` rule and a `* { font-family: ... !important }` override.
3. Listens for messages from the popup to toggle on/off or switch fonts.

```js
// extension/content.js
const STYLE_ID = 'inkprint-font-override'

function applyFont(fontUrl, familyName) {
  removeFont()
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @font-face {
      font-family: '${familyName}';
      src: url('${fontUrl}') format('woff2');
      font-display: swap;
    }
    *:not([class*="icon"]):not([class*="material"]):not([data-inkprint-skip]) {
      font-family: '${familyName}', sans-serif !important;
    }
  `
  document.head.appendChild(style)
}

function removeFont() {
  document.getElementById(STYLE_ID)?.remove()
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'APPLY_FONT') applyFont(msg.fontUrl, msg.familyName)
  if (msg.type === 'REMOVE_FONT') removeFont()
})
```

### Font URL Refresh

The extension popup periodically refreshes the signed R2 URL (which has a 1-hour TTL) by querying the InkPrint API. If the URL expires mid-session, the content script detects the `@font-face` load failure and requests a fresh URL from the popup.

---

## 12. Error Handling & Logging

### ApiError Class

```ts
// lib/api-error.ts
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }

  static badRequest(code: string, message: string, details?: unknown) {
    return new ApiError(400, code, message, details)
  }
  static unauthorized() {
    return new ApiError(401, 'UNAUTHORIZED', 'Authentication required')
  }
  static forbidden() {
    return new ApiError(403, 'FORBIDDEN', 'Access denied')
  }
  static notFound(resource: string) {
    return new ApiError(404, 'NOT_FOUND', `${resource} not found`)
  }
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message, details: error.details } },
      { status: error.statusCode },
    )
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: error.issues } },
      { status: 400 },
    )
  }
  logger.error('Unhandled error', { error })
  return NextResponse.json(
    { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } },
    { status: 500 },
  )
}
```

### Structured Logger

```ts
// lib/logger.ts
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: { level: (label) => ({ level: label }) },
  redact: ['req.headers.authorization', 'req.headers.cookie'],
})
```

- Never log raw user data (images, emails).
- Redact auth headers automatically.
- Every service method logs entry + exit + duration at `debug` level, errors at `error`.

---

## 13. Security

| Threat | Mitigation |
|--------|------------|
| Malicious file upload | Validate MIME via magic bytes (not just Content-Type header). Re-encode through Sharp before any processing. Max file size enforced at Route Handler level. |
| Path traversal in R2 keys | Keys built server-side via `buildKey()` from UUIDs only — never from user input. Never use S3 ACLs or bucket policies (R2 doesn't support them). |
| IDOR (accessing others' scans/fonts) | RLS policies on every table. Service-layer checks as defence-in-depth. |
| XSS via font metadata | `familyName` sanitised (alphanumeric + space + hyphen only) before embedding in CSS. |
| Supabase service role key leak | `supabaseAdmin` only imported in `src/server/`. Env var `SUPABASE_SERVICE_ROLE_KEY` never prefixed with `NEXT_PUBLIC_`. |
| Extension session theft | Sessions stored in `chrome.storage.session` (cleared on browser close). Signed R2 URLs have 1-hour TTL. |
| Rate limiting | `@upstash/ratelimit` on `/api/scans` (5 uploads/min/user) and `/api/fonts/generate` (3/min/user). |
| SVG path injection | Glyph SVG paths validated against a strict regex before storage — no embedded scripts, no external references. |
| Stale job locks | pg_cron resets jobs locked > 10 minutes. Dead workers don't block the queue. |

---

## 14. Testing

| Layer | Tool | Scope |
|---|---|---|
| Pipeline unit tests | Vitest | Each step (preprocess, segment, vectorise) tested with fixture images |
| API integration tests | Vitest + dedicated Supabase test project | Route handlers tested end-to-end against a real Supabase instance (separate project from production) |
| RLS tests | pgTAP or Vitest + Supabase client | Verify that user A cannot read user B's scans/fonts/glyphs |
| Queue tests | Vitest | Job enqueue, claim, retry, stale lock recovery |
| Font output | opentype.js validation | Generated font has correct glyph count, metrics, valid outlines |
| R2 integration | Vitest + Miniflare (local R2 emulator) | Upload, signed URL generation, deletion |

### Fixture Strategy

- `tests/fixtures/scans/` — reference scan images at known quality levels (clean, noisy, skewed, low-res).
- `tests/fixtures/glyphs/` — pre-segmented character PNGs for vectorisation tests.
- Test assertions compare output against known-good baselines (SVG path similarity within tolerance, font metric ranges).

### Development Setup

Supabase runs as a hosted project in **Europe (eu-central-1)** — no local Supabase. The remote project's API keys are used from day one in development and production.

#### Supabase Connection — Use the Framework Tab

The Supabase dashboard "Connect to your project" dialog has four tabs: Framework, Direct, ORM, MCP. **InkPrint uses Framework.** This gives you the project URL and anon key for the `@supabase/ssr` JS SDK — which is how all app code accesses the database (via PostgREST, not raw Postgres).

The Direct tab (Direct connection / Transaction pooler / Session pooler) provides raw Postgres connection strings. InkPrint does **not** use raw Postgres connections in application code — all queries go through `supabase.from('table')`. Ignore the Direct tab for the app.

For CLI migrations, `supabase link` handles the connection internally — you do not need to manually configure a Postgres connection string.

```bash
# One-time: link to the hosted Supabase project (Europe region)
supabase link --project-ref <project_id>

# .env.local is populated by the user from the Framework tab in the Supabase dashboard.
# DO NOT open .env.local to confirm — it is off-limits (see SKILL.md Universal Rule #9).
# Canonical list of env var NAMES (no values) lives in SKILL.md → Environment Variables (Names Only).

# Run the app (connects to the hosted Supabase project directly)
npm run dev
```

#### Connection Method Summary

| Use Case | Connection Method | Where to Find |
|----------|------------------|---------------|
| App code (`@supabase/ssr`, all queries) | Supabase JS SDK (REST API) | Dashboard → Framework tab → URL + anon key |
| CLI migrations (`supabase db push`) | Handled by `supabase link` | Automatic after linking |
| Raw Postgres (only if explicitly added later) | Transaction pooler (port 6543) | Dashboard → Direct tab → Transaction pooler |

All developers work against the same hosted Supabase project during development. For testing in isolation, use a separate Supabase project linked via different env vars.

#### Region Consideration

The Supabase project is hosted in **Europe**. Vercel deployments should use the `iad1` (US East) or `lhr1` (London) region — prefer **`lhr1`** to minimise latency between Vercel Edge/Serverless functions and the Supabase EU database. Set this in `vercel.json`:

```json
{
  "regions": ["lhr1"]
}
```

Cloudflare R2 is globally distributed (no region selection), so R2 latency is not a concern.

---

## 15. Anti-Patterns

| Anti-Pattern | Why | Do Instead |
|---|---|---|
| Business logic in Route Handler | Untestable, violates thin-handler principle | Delegate to a service in `server/services/` |
| `supabase.auth.getSession()` alone in a Route Handler | Session can be stale/spoofed | Always use `supabase.auth.getUser()` to validate |
| Importing `supabaseAdmin` outside `src/server/` | Risks leaking the service role key | Keep admin client strictly in server-only code |
| Trusting `Content-Type` header | Trivially spoofed | Validate via magic bytes |
| Returning raw R2 keys to client | Exposes storage structure | Return pre-signed URLs via `r2Storage.getSignedUrl()` |
| Using `region: 'us-east-1'` or any real region | R2 requires `'auto'` — real regions break the client | Always `region: 'auto'` in the S3Client config |
| Calling S3-only APIs (versioning, lifecycle, events) | R2 doesn't support these — calls will fail | Check the R2 vs S3 table in section 6 before using any S3 API |
| Installing `aws-sdk` v2 | Compatibility issues with R2 | Use `@aws-sdk/client-s3` v3 only |
| Sync font generation in request | Blocks the request for 30+ seconds | Enqueue via `jobs` table, push status via Realtime |
| Untyped job payloads | Runtime crashes in workers | Zod-validate `job.payload` at worker entry |
| `catch (e) {}` (swallowed errors) | Silent failures, impossible debugging | Always log, always surface to the caller |
| String concatenation for R2 keys | Injection risk, inconsistent paths | Use `buildKey()` utility |
| `SELECT *` or unbounded queries | Performance, data leaks | Select specific columns, always paginate |
| Hand-writing database types | Drift from actual schema | Run `supabase gen types` after every migration |
| Skipping RLS | Single point of failure if app code has a bug | RLS on every table, no exceptions |
| Running `supabase start` / local Supabase | This project uses the hosted Supabase project from day one — no local instance | Connect to the remote project via `supabase link`; use `.env.local` for credentials |
| Reading `.env`, `.env.local`, or any env file to discover variable names or values | Loads live secrets (Supabase keys, R2 credentials, service-role token) into model context, logs, and memory | Consult `SKILL.md` → **Environment Variables (Names Only)**. If a name is missing, ask the user to add it there — never `cat`/`Read`/`grep` the file |