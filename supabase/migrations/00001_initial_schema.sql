-- Initial schema for InkPrint.
--
-- Model:
--   - One personal font per user (fonts.user_id is the primary key).
--   - Glyphs are user-owned, keyed by (user_id, code_point); accumulate across
--     drawing sessions and language lenses (templates are code constants, not rows).
--   - jobs queue for async font compilation; service-role only.

create extension if not exists "uuid-ossp";

-- ─── glyphs: per-user vector strokes, one row per (user_id, code_point) ────

create table glyphs (
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_point  int not null,
  svg_path    text not null,
  width       int not null,
  quality     float,
  updated_at  timestamptz not null default now(),
  primary key (user_id, code_point)
);

create index idx_glyphs_user on glyphs(user_id);

-- ─── fonts: one row per user, latest compiled artifact ─────────────────────

create table fonts (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  family_name      text not null,
  otf_key          text,
  ttf_key          text,
  woff2_key        text,
  glyph_count      int not null default 0,
  last_compiled_at timestamptz,
  created_at       timestamptz not null default now()
);

-- ─── jobs queue ────────────────────────────────────────────────────────────

create table jobs (
  id            uuid primary key default uuid_generate_v4(),
  type          text not null check (type in ('font_generate')),
  payload       jsonb not null,
  status        text not null default 'pending'
                check (status in ('pending', 'running', 'complete', 'failed')),
  attempts      int not null default 0,
  max_attempts  int not null default 3,
  locked_at     timestamptz,
  locked_by     text,
  error         text,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index idx_jobs_pending on jobs(status, created_at) where status = 'pending';

-- ─── updated_at trigger on glyphs ──────────────────────────────────────────

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger glyphs_updated_at
  before update on glyphs
  for each row execute function update_updated_at();

-- ─── RLS ───────────────────────────────────────────────────────────────────

alter table glyphs enable row level security;

create policy "Users read own glyphs"
  on glyphs for select using (auth.uid() = user_id);

create policy "Users insert own glyphs"
  on glyphs for insert with check (auth.uid() = user_id);

create policy "Users update own glyphs"
  on glyphs for update using (auth.uid() = user_id);

create policy "Users delete own glyphs"
  on glyphs for delete using (auth.uid() = user_id);

alter table fonts enable row level security;

create policy "Users read own font"
  on fonts for select using (auth.uid() = user_id);

create policy "Users insert own font"
  on fonts for insert with check (auth.uid() = user_id);

create policy "Users update own font"
  on fonts for update using (auth.uid() = user_id);

alter table jobs enable row level security;
-- No user-facing policies on jobs — only the service role accesses this table.

-- ─── Job claim function (FOR UPDATE SKIP LOCKED) ───────────────────────────

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
