-- Add raw stroke point data alongside the smoothed svg_path.
--
-- svg_path is the *rendered* output the font compiler consumes; strokes is
-- the source: an array of stroke arrays of { x, y, pressure } points in the
-- 0..GLYPH_UPM coordinate space. Storing the source lets the editor re-open
-- a saved glyph, edit individual strokes, and re-render. Nullable so existing
-- rows (which only have svg_path) keep loading — they just open in the modal
-- as a path-only background until the user re-saves.

alter table glyphs add column if not exists strokes jsonb;
