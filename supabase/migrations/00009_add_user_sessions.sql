-- user_sessions: which device currently "owns" editing for a given user.
--
-- Only one row per user. Reactive check on focus/visibility/interaction;
-- inactive devices show a backdrop and must claim (UPDATE) to write.

create table user_sessions (
  user_id           uuid primary key,
  active_device_id  text not null,
  active_since      timestamptz not null default now()
);

alter table user_sessions enable row level security;
-- Inert under the service-role admin client (same pattern as glyphs/fonts).
create policy "Users read own session"
  on user_sessions for select using (auth.uid() = user_id);
create policy "Users modify own session"
  on user_sessions for all using (auth.uid() = user_id);
