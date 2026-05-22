# InkPrint — Product Decision Log

This log captures product improvements, UX pivots, and scope/architecture decisions for InkPrint. Entries are in reverse-chronological order. Each entry follows a decision-record format that maps 1:1 to a Confluence page under the "Product Decisions" space — so entries can be lifted out and pasted without reformatting when we move off Markdown.

Pure implementation work (writing a route, adding a column, fixing a bug) does **not** belong here. Only decisions with product-level implications do.

---

## 2026-05-22 — Auto-compose diacritics from accent primitives

**Status:** Accepted (Phase 1a — procedural composition only)
**Owner:** Vu Doan
**Trigger:** Competitive research established that no incumbent in the handwriting-font space (Calligraphr, FontCraft, iFontMaker, Fontself) auto-generates *any* glyphs — users hand-draw all 60–600 characters themselves. Inkprint's stroke-based capture is a structural advantage we hadn't exploited.

**Context**

Drawing 94 (or 600) glyphs is the dominant time sink for users producing a personal font. The labour grows roughly linearly with the language coverage requested. Pure Latin Basic users already balk at 71 hand-drawn glyphs; Vietnamese users would face ~150 lowercase forms alone if asked to draw every tone × vowel combination by hand. Competitive products treat this as an inherent property of the medium because they store glyphs as bitmaps (Calligraphr, FontCraft) — bitmap composition produces visible seams and artefacts, so they don't attempt it.

Inkprint already stores every glyph as a vector stroke sequence (`StrokePoint[]` in a 1000-unit em space), with full spatial freedom and pressure preserved. Vector composition — translate, stack, concatenate — produces results that are byte-for-byte identical to a hand-drawn glyph with the same strokes. There is no quality penalty, no "looks composed" tell.

The full plan considers three tiers (procedural composition, retrieval, ML extrapolation). This decision covers Tier 1 only.

**Decision**

Add a "Western European & Vietnamese" character set built around 9 user-drawn accent primitives (acute, grave, circumflex, diaeresis, tilde, breve, hook above, dot below, horn). Compose ~75 lowercase diacritic targets — every Western European Latin-1 Supplement letter plus the full Vietnamese tone × vowel-modifier matrix (ấ, ổ, ử, ừ, ự, ỡ, ỹ, etc.) — by stacking primitives over base letters the user already drew. Multi-mark recipes are supported, so chained forms like ổ (o + circumflex + hook) compose in one pass via dependency-ordered topology.

Auto-composed glyphs are persisted in the same `glyphs` table as hand-drawn ones, distinguished only by a new `source` column (`'drawn' | 'composed'`). They appear in the grid as regular cells with a small ✨ badge, and **open in the existing drawing/edit modal unchanged**: tweaking a composed glyph is the same operation as tweaking a hand-drawn one. The moment a user edits a composed glyph and saves, its source flips to `'drawn'` and the auto-filler will never overwrite it.

Capitals, retrieval-based borrowing from Google Fonts, and stroke-conditional ML extrapolation are explicitly **out of scope** for this phase. They remain on the Phase 2 list.

**Rationale**

- **The composition is lossless.** Vector strokes carry pressure and the user's own line characteristics; placing them above a base preserves both. The composed `à` looks as hand-drawn as the `a` and the `\`` it came from, because it *is* those strokes.
- **It's a "review and tweak" UX, not an "AI approval" UX.** Composed glyphs aren't a different first-class type; they're regular glyphs with a tag. The user never has to learn a new editor or commit to AI output — they tweak the same way they'd tweak any glyph.
- **Vietnamese users get an immediately useful product.** Without composition, a Vietnamese font needs ~150 lowercase hand-drawn glyphs. With composition + 9 mark primitives + 26 lowercase bases + 6 modified vowels (ă, â, ê, ô, ơ, ư) = ~41 hand-drawn glyphs, the remaining ~75 are derived. Roughly a 65% reduction in manual work.
- **No ML risk in Phase 1.** Pure geometry, no inference latency, no model hosting, no quality variance across users. Ships independently of Phase 2.
- **Dependency-ordered composition.** Vietnamese forces a chain: ổ depends on ô, which depends on o. The composer pre-sorts recipes topologically so a single pass over `composeAll` resolves everything.

**UX implications**

The "Vietnamese & Western European" set replaces what would have been a stratified seed/full split. The grid renders ~155 cells; 9 of them (the accent primitives) carry text labels like "Hook above" instead of an empty glyph slot, because their Unicode code points (U+E000–U+E002, PUA) have no system-font renderings. PUA cells also use a `◌̛`-style dotted-circle ghost on the canvas so the user can see the mark shape they're tracing.

After drawing primitives + bases, a brand-tinted banner appears above the grid: *"X diacritic letters ready to auto-fill"* with a Sparkles button. One tap composes every resolvable target. Composed cells gain a small ✨ corner badge so the user knows which ones to review. The badge stays until the user saves an edit, at which point the cell becomes indistinguishable from a hand-drawn one.

The basic Latin set (`latin-basic`, 71 chars) is unchanged — there's no migration burden for existing English-only users.

**Impact**

- **New:**
  - `src/lib/glyphComposition.ts` + tests — 9 mark positions, ~75 recipes, dependency-ordered `composeAll`, i/j tittle stripping (tight "fully above" check so it doesn't nuke a t-bar).
  - `latin-extended` entry in `src/lib/characterSets.ts` with 9 primitives + 75 composable targets.
  - `PRIMITIVE_LABELS` / `PRIMITIVE_GHOSTS` / `glyphDisplayLabel` / `glyphGhostChar` helpers for PUA cells.
  - Auto-fill section in `InkprintApp.tsx` (banner + Sparkles button + result toasts).
  - Migration `00008_add_source_to_glyphs.sql`.
- **Modified:**
  - `glyphs` table gets a `source` column (`'drawn' | 'composed'`, backfilled to `'drawn'`).
  - `GlyphRecord` / Zod schemas / both API routes plumb `source` through.
  - `GlyphCell` renders the ✨ badge and primitive labels.
  - `DrawingModal` shows the role label in the header for PUA primitives and the dotted-circle ghost on the canvas.
- **Deliberately deferred:**
  - Uppercase diacritics (À, Á, Ă, Ơ, Ư, etc.).
  - "Recompose composed glyphs" UX after a primitive is later tweaked. Today, composing again only fills empty cells; refreshing stale composed glyphs is a manual round-trip.
  - Bulk `/api/glyphs` endpoint. Auto-fill currently fires N parallel PUTs (~75 worst-case). Acceptable for the v1 user base; collapses to one round-trip when it becomes a bottleneck.
  - Phase 2 (retrieval and ML extrapolation).

---

## 2026-05-22 — Drop the job queue; compile fonts synchronously

**Status:** Accepted
**Owner:** Vu Doan
**Trigger:** Smoke-testing the Generate Font flow exposed that the job pipeline had never actually run end-to-end: clicking Generate inserted a `jobs` row that sat at `status: 'pending'` forever, because no webhook had been created and the consumer endpoint was never invoked.

**Context**

The original backend design (carried over from `references/BACKEND.md`) used a database-driven queue: `POST /api/fonts/generate` enqueued a `font_generate` job, a Supabase webhook would fire on insert, the consumer endpoint claimed via `claim_job` RPC, a worker compiled the font, and the client subscribed over Realtime for the result. That design made sense for the *scan pipeline* it was built for — paper-template uploads needing 10–30s of OCR, segmentation, and vectorisation, with checkpoints worth streaming to the UI.

The product has since pivoted to in-browser stroke capture. There are no scans, no image processing, no multi-step pipeline. Font compile is the only server-side work, and opentype.js on ≤100 glyphs runs in well under two seconds. Every original reason for async — request timeouts, transient failures, multi-step progress, durability if a worker crashes — no longer applies. The queue had become infrastructure justified only by symmetry with a pipeline that no longer exists.

**Decision**

Compile fonts synchronously in `/api/fonts/generate`. The route reads glyphs from Supabase, runs opentype.js inline, and returns the OTF bytes in the response body with `Content-Disposition: attachment`. The browser handles the download natively. No queue, no webhook, no Realtime subscription, no worker process.

The queue infrastructure (`jobs` table, `claim_job` RPC, `/api/worker/process` route, worker dispatcher, `WORKER_SECRET` env var) is removed entirely, both at the application layer and via migration `00006_drop_queue_infrastructure.sql`. If a genuinely async pipeline ever returns (batch exports, server-side rasterisation, scan ingestion), it gets designed fresh against the requirements that justify it.

**Rationale**

- **Matches the work.** Sub-2-second compile is the wrong shape for a durable async queue; it is the right shape for an HTTP request.
- **One round-trip, no return channel.** Anonymous users (v1's default) never persist anything to R2 — there was no place for the worker to put the bytes for them anyway. Returning bytes in the response collapses both branches.
- **Removes operational surface.** No webhook to configure in Supabase, no tunnel needed for local dev, no shared secret to rotate, no orphaned `pending` jobs to monitor.
- **Smaller, more honest codebase.** Two API routes deleted, three modules deleted, one env var removed, one migration that drops three database objects.

**UX implications**

Generation is in the 0.5–2.5s band for typical glyph sets and worst-case ~5s on cold serverless starts or large fonts. The Generate Font button now follows a four-state UX: `submitting` (spinner, immediate), `slow` (after 3s, soft reassurance copy), `success` (download triggered, filename surfaced), `error` (incl. a 15s hard timeout with retry messaging). No fake progress bars — an indeterminate spinner is the honest signal when no real progress is available.

**Impact**

- Removed: `src/server/queue/worker.ts`, `src/app/api/worker/process/route.ts` (+ test), `src/types/jobTypes.ts`, `WORKER_SECRET` from `src/lib/env.ts`.
- Added: `src/server/fonts/compile.ts` (uniform-width stroke-to-outline + opentype.js compile), `opentype.js` dependency.
- Replaced: body of `/api/fonts/generate`, client `requestFontGeneration` (now triggers a browser download), `GenerateFontSection` state machine.
- Migration: `00006_drop_queue_infrastructure.sql` drops `jobs`, `idx_jobs_pending`, `claim_job`.
- Open follow-ups (deliberately not in this change): variable-width strokes using stored pressure values; per-glyph advance widths (currently every glyph gets full-em width, producing a monospace feel); R2 persistence for signed-in users when auth lands.

---

## 2026-05-21 — Defer real user accounts until the marketplace; v1 stays anonymous

**Status:** Accepted
**Owner:** Vu Doan
**Trigger:** First Save Glyph attempt failed with `glyphs_user_id_fkey` — the schema had `glyphs.user_id references auth.users(id)`, but the client mints an opaque UUID in localStorage and never authenticates.

**Context**

The migration in `00002_reset_to_per_user_glyph_model.sql` was written assuming Supabase Auth would be wired up at the same time. It wasn't — the product decision throughout v1 has been "anonymous UUID per user, no sign-in friction." The FK to `auth.users` was a latent bug waiting for the first save.

**Decision**

Drop the FK from `glyphs.user_id` and `fonts.user_id` to `auth.users(id)`. `user_id` stays a free-floating UUID owned by the client. Real accounts arrive when the marketplace concept does — at that point users gain a reason to claim/sign in (publishing, selling, syncing across devices) and we can backfill identity onto the existing UUIDs via a migration.

**Rationale**

- **Removes the only blocker on save.** Anonymous use is the v1 onboarding promise.
- **No premature auth.** Adding sign-in now buys nothing the marketplace doesn't pay for later.
- **Migration path is open.** When marketplace arrives, we can introduce a `users` (or `auth.users`) row per existing client UUID and re-introduce the FK without rewriting glyph storage.

**Impact**

- Migration: `00004_drop_user_fk_for_anonymous_users.sql` drops both constraints.
- RLS policies on `glyphs`/`fonts` (`auth.uid() = user_id`) are left in place but inert — the API uses the service-role admin client which bypasses RLS. When real auth lands, the policies start protecting data without further work.

---

## 2026-05-21 — Long-term vision: differentiators vs Calligraphr (three pillars + supporting ideas)

**Status:** Proposed
**Owner:** Vu Doan
**Trigger:** Brainstorm — defining what makes InkPrint a category-defining product instead of a Calligraphr re-skin. None of this is v1 scope; it is the long-term vision that shapes data model, infra, and brand from day one so v1 doesn't paint us into a corner.

**Context**

Calligraphr (the incumbent handwriting-font tool) is a closed-loop tracing service: print template → handwrite every character → upload scan → get a font containing exactly the characters you drew. It has been on the market ~10 years and dominates the category. To win, InkPrint cannot be "Calligraphr with a nicer UI" — it needs structural advantages Calligraphr cannot match without re-architecting their product.

The earlier 2026-05-20 decision to drop print/scan and capture vector strokes directly is already a structural advantage (clean source data with pressure / velocity / stroke order — not a rastered scan). The three pillars below build on that foundation.

**Decision (proposed)**

InkPrint commits to three differentiating pillars beyond Calligraphr parity.

### Pillar 1 — AI style inference (write less, get more)

Calligraphr requires the user to draw every glyph that ends up in the font. To get a 400-character font you draw 400 cells.

InkPrint asks the user to draw a minimal seed set (A–Z, a–z, 0–9 ≈ 62 cells) and uses a model to *infer* the rest of the character set in the same style:

- Accented Latin (é, ñ, ü, ã, ç, …)
- Punctuation, currency, math symbols
- Vietnamese diacritics (ă, â, đ + tone-marked vowels)
- Cyrillic / Greek extensions for users who want them
- **Ligatures + cursive joins.** Generate connecting strokes between letters (OpenType `liga`, `clig`, contextual joins) so words flow like real handwriting — not 26 isolated letterforms stitched together. Calligraphr makes you manually draw every ligature pair (`th`, `ti`, `fi`, `ll`, …); AI inference synthesises them from the base alphabet, including end-of-letter exit strokes that meet the next glyph's entry stroke cleanly.
- **Stylistic alternates** (`calt`, `salt`) — multiple natural variants per glyph so the same letter doesn't repeat identically inside a word.

**Pitch:** "Write 62 characters. Get a font with 300+, in your hand — with ligatures, alternates, and the wobble that makes it feel hand-written."

**Why this is a moat:** the model needs vector-stroke training data with pressure, velocity, and stroke order — exactly what InkPrint captures because v1 uses canvas pointer events. Calligraphr only has rastered scans; even if they bolted on inference, they'd be inferring from worse input.

### Pillar 2 — Mobile keyboard (your font is your identity)

The browser extension already differentiates v1 (your handwriting renders on every website). The natural extension is iOS / Android keyboards (custom IME) so messages in WhatsApp, iMessage, Instagram DMs, Notes, Gmail mobile, etc. type in your handwriting.

**Why this matters:** a downloadable font sits in a folder. A keyboard makes the font part of how the user communicates every day. The product surface shifts from "tool you used once" to "identity you carry."

### Pillar 3 — Social layer (the platform play)

Today fonts are private artifacts. Pillar 3 is a public font directory: users opt in to publish their handwriting; others browse, preview, and install with one click. Think Google Fonts where every font is someone's actual handwriting.

**Why this matters:**

- **Discovery** — shareable URLs (`inkprint.app/u/vu`) become the marketing channel.
- **Network effects** — every published font attracts viewers who want their own.
- **Monetisation lever** — creators can charge for premium fonts; platform takes a cut. Business model shifts from one-time purchase to marketplace.
- **Defensibility** — the library *becomes* the product. A new entrant has features; InkPrint has a library of N thousand handwriting samples.

### Supporting ideas (added during brainstorm)

These extend the three pillars and are worth capturing now even if not pursued:

- **Variable-font axes for ink behaviour.** Ship a single font file with axes for ink saturation, pen pressure, paper grain (fountain-pen-wet vs ballpoint-dry). Same handwriting, different moods. Calligraphr exports flat black vectors only.
- **Versioned handwriting over time.** Snapshot fonts every N months — "Vu 2025", "Vu 2026". The extension / keyboard can interleave snapshots to simulate natural drift so output never looks mechanically uniform.
- **Multi-modal export.** Beyond OTF/TTF: SVG sticker packs, Procreate brushes, PencilKit-compatible strokes, Lottie animated writing. Each format opens a new distribution channel.
- **Public render API.** Third-party apps (greeting cards, journaling, productivity tools) call `inkprint.app/api/render?user=vu&text=hello` and get back a PNG/SVG in that user's hand. Turns InkPrint into infrastructure.
- **Shared / collaborative fonts.** Multiple users (couple, family, classroom) contribute glyphs to a single shared font. Whimsical, viral, hard to replicate.

**Rationale**

Each pillar gives InkPrint something Calligraphr cannot copy without re-architecting:

| Pillar | Calligraphr can't easily copy because… |
|---|---|
| AI inference (incl. ligatures) | Their input is rasters, not vectors with pressure / order data. Ligature synthesis especially needs stroke-direction signal. |
| Mobile keyboard | They are a B2C font generator, not an app developer; no iOS / Android engineering shown. |
| Social layer | Their product is built around the individual download flow; no profile / discovery / payments infrastructure. |

The pillars also reinforce each other: AI inference produces richer fonts → richer fonts are worth sharing → sharing drives discovery → discovery brings users who want their own keyboard.

**Impact**

This is positioning, not v1 scope. But it changes decisions we must make *now* so v1 doesn't lock us out:

- **Capture pressure / velocity / stroke order *and* entry/exit points** in `glyphs.strokes`, not just the flattened SVG path. Pillar 1 (including ligature synthesis) needs all of it; throwing it away in v1 is irreversible.
- **Schema must accommodate public fonts.** A `fonts.visibility` enum (`private` | `unlisted` | `public`) is foreseeable; design `fonts` with this in mind even if v1 only writes `private`.
- **Stable user-handle / profile slug** is a Pillar 3 prerequisite. Auth should mint one per user from day one even if profile pages don't exist yet.
- **Decouple the font asset from the device session.** v1 extension, future keyboard, and future API all need to read the same canonical font asset by `(user_id, font_version)`.
- **SKILL.md** opening paragraph updated to reflect this positioning so future contributors / AI assistants don't model InkPrint as a Calligraphr clone.

**Trade-offs / Open questions**

- **Pillar 1 model choice.** Train a custom model on vector-stroke data, or fine-tune an existing generative model on raster-rendered strokes? Custom is the moat; off-the-shelf is faster. Likely start off-the-shelf for a demo, plan custom for the moat.
- **Pillar 1 ethics / UX.** AI-generated glyphs the user didn't draw — clearly label as inferred? Let users veto / redraw any inferred glyph? Probably yes to both.
- **Ligature quality bar.** Synthesised joins that look wrong are *worse* than no ligatures — broken cursive reads as a bug, not as character. Need a confidence threshold below which we skip the ligature and fall back to isolated letterforms.
- **Pillar 2 platform priority.** iOS keyboard is the better marketing story (iMessage), Android is the easier engineering (Gboard-style IME, fewer sandbox restrictions). Likely Android first, iOS second.
- **Pillar 3 moderation.** Public profiles = user-generated content = trust & safety surface (offensive handles, font names, abuse). Need a moderation stance before launch.
- **Sequencing.** v1 ships canvas + extension. v1.1 most likely Pillar 1 (highest user delight per engineering hour). Pillar 3 needs critical-mass user base to be worth building. Pillar 2 is highest-effort and should wait for product-market fit.

---

## 2026-05-20 — Replace print/scan/upload with on-canvas drawing

**Status:** Accepted
**Owner:** Vu Doan
**Trigger:** Backend scaffolding conversation; questioned whether the print → handwrite → scan → upload flow was the right v1 user journey.

**Context**

The original product spec (see `references/BACKEND.md` §8, `references/DESIGNER.md` for the template sheet) modelled the user flow as:

1. User downloads a printable PDF template (Latin Basic, ~62 chars)
2. User prints it on physical paper
3. User handwrites every character in its assigned cell
4. User photographs / scans the filled sheet
5. User uploads the image
6. Server pipeline: Sharp preprocess → deskew → segment → potrace vectorise → opentype.js assembly → FontForge compilation
7. User reviews / corrects misread glyphs
8. User downloads font

This flow has four sequential drop-off points (printer ownership, 10–15 min of writing, scan quality, OCR correction) before the user sees any output. Realistic completion rate from "I want to try this" → "I have a font" was estimated at 5–15%.

**Decision**

Drop the print/scan/upload flow entirely for v1. Replace it with an in-browser canvas where each character cell opens as a modal (desktop) or full-screen view (mobile/tablet), and the user draws the glyph directly with finger / stylus / mouse. Pointer events are captured as vector strokes and stored as authoritative source data — no raster intermediate exists.

The image-import path is deferred to a hypothetical v2 only if real user demand emerges.

**Rationale**

- **Conversion** — removes 3 of 4 drop-off points (printer, scan setup, OCR review). Only writing effort remains.
- **Input quality** — strokes captured from `pointer*` events are clean vectors. No paper warp, no shadows, no thresholding, no skew. Quality is consistent across users.
- **Pipeline simplification** — the entire raster image-processing stack (Sharp + threshold + deskew + segmentation + potrace) becomes unnecessary. Stroke normalisation to UPM units is the only preprocessing step; `opentype.js` consumes the result directly.
- **Resumability** — drafts auto-save per stroke. Users can close the tab and resume on another device. Print/scan forced a single sitting.
- **Correction loop** — redraw a single cell takes seconds. Re-writing a paper cell or re-scanning takes minutes.
- **Hardware reach** — phone / tablet / desktop with mouse all work. No printer required. Stylus support (Apple Pencil, S Pen, Surface Pen) is native.
- **Engineering cost** — half of `BACKEND.md` (image pipeline, segmentation, vectorisation) is removed. New frontend cost (canvas component, pointer capture, smoothing, draft persistence) is significantly smaller than what's deleted.

**Impact**

Schema:
- Drop `original_key`, `processed_key` from `scans` (no raster artifact stored)
- Likely rename `scans` → `submissions` or `drawings` ("scan" is the wrong noun)
- `scan_process` job type is removed entirely
- `font_generate` becomes the only job type; may be small enough (~5s for ~200 glyphs) to run inline in the route handler instead of via the queue for v1
- `glyphs` table stays — and its importance grows, since it now stores the user's authoritative vector strokes

Frontend:
- New canvas component with pointer-event capture, stroke smoothing (Catmull-Rom / quadratic interpolation), per-cell undo/redo/clear
- Pressure-aware line weight for stylus input (synthetic pressure from velocity for non-pressure devices)
- Ghost / faint reference glyph behind the canvas so users know what to draw
- Auto-save per stroke; resumable session across devices
- Progress meter + skip-for-now
- Live font preview updating as glyphs complete (dopamine loop)
- Tablet-first sizing: full-bleed cell modal on touch; smaller modal on desktop

Backend:
- `references/BACKEND.md` §8 (Image Processing Pipeline) becomes obsolete
- `references/BACKEND.md` §9 (Font Generation Pipeline) stays but simplifies
- R2 footprint shrinks: only generated font files (.otf/.ttf/.woff2) are stored, plus any reference assets. No user scan images.

**Trade-offs / Open questions**

- **Mouse-drawn output will be noticeably worse than tablet/stylus.** Plan: soft nudge ("for best results, use a touchscreen + stylus") rather than blocking. The wonky-mouse aesthetic may actually be charming for some users.
- **Users with existing handwriting samples** (journals, signatures, annotated PDFs) cannot use them. Acceptable trade for v1; revisit only if demand emerges.
- **~200-glyph effort to cover Latin + Vietnamese** is still high. May want to ship a "Latin only" (~62 chars, ~3 min) starter pack as the default, with Vietnamese as an opt-in extension. To be decided when designing the canvas UI.
- **Touch palm rejection** — needs careful handling on tablets where users rest a palm while using a stylus.

---

## 2026-05-20 — Multi-language character sets as code constants; glyphs are per-user, not per-template

**Status:** Accepted (supersedes the earlier same-day proposal to ship a single character set)
**Owner:** Vu Doan
**Trigger:** Question of how a user can fill out an "English" template and later progress to a "Vietnamese" template without losing or duplicating shared glyphs (A-Z, etc.).

**Context**

The original schema (`references/BACKEND.md` §4) defined a `templates` table with a `template_id` foreign key on the scan/submission, and a `glyphs` table keyed by `(scan_id, code_point)`. This implies that the same character drawn in two different template completions would be two different `glyphs` rows.

That model breaks the product's central promise: **one personal font per user**, not one font per template. If a user draws their "A" in the English template and later opens the Vietnamese template, the system needs to reuse the existing "A" rather than ask them to draw it again — and the Vietnamese-only cells (ă, â, đ, plus tone-marked vowels) should be the only empty cells they see.

**Decision**

Two related changes:

1. **Multiple character sets, all as code constants.** Define a `CHARACTER_SETS` object in `src/lib/character-sets.ts` containing one entry per language pack (e.g. `'latin-basic'`, `'latin-vietnamese'`, future `'cyrillic'`). Each entry lists the code points and a suggested grid layout. No DB table.

2. **Glyphs are owned by the user, not by a submission or template.** Replace the `(scan_id, code_point)` composite key on `glyphs` with `(user_id, code_point)`. Templates become *lenses* — UI views that group code points for the drawing experience — not parents of glyph data.

When a user opens a template:
- Frontend reads the template's code points from `CHARACTER_SETS`
- Frontend queries the user's existing glyphs, returning a `Map<codePoint, svgPath>`
- Cells in the intersection render as completed (with thumbnail, tap to redraw)
- Cells outside the intersection render as empty (tap to draw)
- Each stroke commits via upsert on `(user_id, code_point)` — re-drawing overwrites the existing glyph

**Rationale**

- **One font per user is the product.** The data model should reflect that — glyphs accumulate over time across sessions and languages, all feeding a single compiled font.
- **No "merge" operation needed.** Because glyphs were never per-template to begin with, opening a second template is just rendering a different lens over the same data. Zero merge logic.
- **YAGNI on `templates` table is preserved.** Templates remain code constants; we just have multiple entries instead of one. Promote to a DB table only if templates ever become user-editable.
- **Composability of language packs.** A Vietnamese template is naturally a superset of Latin Basic — when a user finishes Latin Basic and opens Vietnamese, only the diacritic-specific cells show as empty. The math falls out of the data model with no special-casing.
- **Aligns with the user mental model.** "I drew my A's once, why would I have to draw them again?" is the natural reaction. The data model makes that reaction the correct one.

**Impact**

Schema:
- `glyphs` table keyed by `(user_id, code_point)` as the primary key (not `(scan_id, code_point)`)
- Drop the `scan_id` FK on `glyphs` entirely, or keep an optional `source_session_id` for auditing only
- `fonts` table: add a constraint that there is at most one row per user (or use `user_id` as the primary key)
- `submissions` (formerly `scans`) becomes an *event log* — "user completed N glyphs on date X via lens Y" — rather than the parent of glyph data. May be unnecessary for v1; can be derived from `glyphs.updated_at` if needed.

Code:
- New `src/lib/character-sets.ts` exporting `CHARACTER_SETS` (one entry per language pack)
- API: `GET /api/glyphs` returns the user's complete glyph map (used to render any template lens)
- API: `PUT /api/glyphs/[codePoint]` upserts a single glyph
- API: `POST /api/fonts/generate` reads the user's current glyph set (not a specific scan's glyphs) and compiles the font

**Trade-offs / Open questions**

- **Stylistic drift between sessions.** A user drawing "A" in January and "á" in June may have visibly different handwriting. UX should surface a soft "your style may have evolved — want to redraw older glyphs for consistency?" prompt after long gaps. Detection threshold TBD.
- **Compilation cadence.** Should the font auto-recompile on every glyph upsert (live updates), or only when the user hits a "Compile" button? Probably the latter for v1 — gives the user an explicit "I'm done for now" moment and avoids R2 churn.
- **What does "complete" mean for a font?** If the user has 50/62 Latin Basic glyphs, can they still compile? Probably yes — missing glyphs fall back to system font in any consuming app. The font is always installable; it's just sparse until the user finishes.
- **Vietnamese diacritic composition (NFC vs NFD).** Browsers render composed (NFC) forms; OpenType also supports combining marks via GSUB. For v1, store each composed character as its own code point (NFC). Revisit if we want true combining-mark support.
- **Future user-uploaded templates / custom templates.** When/if templates become user-editable, `CHARACTER_SETS` graduates to a `templates` DB table. Not a v1 problem.

---
