-- Drop FK from glyphs/fonts to auth.users for the anonymous-user product model.
--
-- Product decision: no Supabase Auth in v1. The client mints an opaque UUID
-- (localStorage) which has no corresponding auth.users row, so the original
-- FK rejected every insert. user_id stays as a free-floating UUID owned by
-- the client; we revisit when the marketplace concept introduces real
-- accounts.
--
-- RLS policies on glyphs/fonts (auth.uid() = user_id) are left in place but
-- inert — they only fire for non-service-role clients, and the API uses the
-- service-role admin client which bypasses RLS.

alter table glyphs drop constraint if exists glyphs_user_id_fkey;
alter table fonts  drop constraint if exists fonts_user_id_fkey;
