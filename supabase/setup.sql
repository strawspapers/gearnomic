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

-- ── Shared lists (trips/templates via public URL) ─────────────
create table if not exists shared_lists (
  id          text primary key,           -- nanoid used as share token
  owner_id    uuid references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('trip','template')),
  title       text not null,
  payload     jsonb not null,             -- serialised trip or template object
  created_at  timestamptz not null default now()
);

-- Public read (no auth needed to fetch a shared list)
alter table shared_lists enable row level security;

create policy "Anyone can read shared lists"
  on shared_lists for select using (true);

create policy "Owners can insert"
  on shared_lists for insert with check (auth.uid() = owner_id);

create policy "Owners can delete"
  on shared_lists for delete using (auth.uid() = owner_id);
