-- Distinguish hand-drawn from auto-composed glyphs.
--
-- 'drawn'    — the user drew (or hand-edited) these strokes themselves.
-- 'composed' — the strokes were synthesised by combining other drawn glyphs
--              (e.g. à = a + grave). Reviewable and editable; once the user
--              saves an edit, the row flips back to 'drawn'.
--
-- Existing rows are user strokes, so 'drawn' is the right backfill.

alter table glyphs
  add column if not exists source text not null default 'drawn'
  check (source in ('drawn', 'composed'));
