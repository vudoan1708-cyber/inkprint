# InkPrint — Product Decision Log

This log captures product improvements, UX pivots, and scope/architecture decisions for InkPrint. Entries are in reverse-chronological order. Each entry follows a decision-record format that maps 1:1 to a Confluence page under the "Product Decisions" space — so entries can be lifted out and pasted without reformatting when we move off Markdown.

Pure implementation work (writing a route, adding a column, fixing a bug) does **not** belong here. Only decisions with product-level implications do.

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
