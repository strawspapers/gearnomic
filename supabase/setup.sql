-- ============================================================
-- Gearnomic — Supabase database setup
-- Run this once in your Supabase project: SQL Editor → New query
-- ============================================================

-- Single table: stores each user's entire app state as JSON.
-- This keeps the data model identical to the localStorage version
-- so the frontend code stays the same — Supabase is just the sync layer.

create table if not exists user_data (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade not null unique,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row-level security: every user can only read and write their own row.
alter table user_data enable row level security;

create policy "Users can read own data"
  on user_data for select
  using (auth.uid() = user_id);

create policy "Users can insert own data"
  on user_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update own data"
  on user_data for update
  using (auth.uid() = user_id);

create policy "Users can delete own data"
  on user_data for delete
  using (auth.uid() = user_id);

-- Auto-update the updated_at timestamp on every save
create or replace function touch_user_data_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_user_data_updated
  before update on user_data
  for each row execute function touch_user_data_updated_at();

-- ── Next steps ────────────────────────────────────────────────
-- Run supabase/02_shared_lists.sql to enable trip/template sharing via URL.
