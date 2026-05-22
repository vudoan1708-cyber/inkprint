-- Remember whether the saved strokes have already been smoothed.
--
-- Smoothing rewrites strokes in place, so reopening the modal can't tell
-- from the strokes alone whether they're raw or already-smoothed. Storing
-- the flag lets the editor restore the toggle's "on" state and prevent
-- compounding by re-applying smoothStrokes to already-smoothed input.

alter table glyphs add column if not exists smoothing_applied boolean not null default false;
