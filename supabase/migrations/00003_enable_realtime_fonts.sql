-- Enable Supabase Realtime push for the `fonts` table.
-- Frontend clients can then subscribe to row changes on their own font row
-- and react when the worker finishes compiling (no polling).

alter publication supabase_realtime add table fonts;
