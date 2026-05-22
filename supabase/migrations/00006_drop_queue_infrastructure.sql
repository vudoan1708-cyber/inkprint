-- Drop the database-driven job queue.
--
-- The queue was inherited from the original scan-pipeline design, where slow,
-- multi-step image processing genuinely needed durable async work. The current
-- product compiles fonts synchronously in the API route — opentype.js on a
-- small glyph set is sub-second — so the queue is dead weight. If a real
-- async pipeline (scans, batch exports) returns later, design it fresh.

drop function if exists claim_job(text);
drop index if exists idx_jobs_pending;
drop table if exists jobs;
