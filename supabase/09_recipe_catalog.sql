-- ============================================================
-- Gearnomic — Migration 09: community recipe catalog
-- Run this ONCE in Supabase SQL Editor after setup.sql
-- ============================================================

create table if not exists recipes_catalog (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  description  text,
  meal_time    text[],                                        -- e.g. '{breakfast,snack}'
  prep_method  text[],                                        -- e.g. '{hot,cold-soak}'
  servings     integer,
  ingredients  jsonb,                                       -- [{qty, unit, name}]
  prep_notes       text,
  source           text,
  packed_weight_g  numeric(8,2),                               -- total packed weight in grams (optional)
  status       text        not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  submitted_by uuid        references auth.users(id) on delete set null,
  approved_by  uuid        references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_recipes_catalog_status on recipes_catalog(status);
-- meal_time and prep_method are text[] — all filtering is done client-side after a single
-- SELECT of approved rows, so column indexes on these arrays provide no query benefit.

create or replace function touch_recipes_catalog_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_recipes_catalog_updated on recipes_catalog;
create trigger trg_recipes_catalog_updated
  before update on recipes_catalog
  for each row execute function touch_recipes_catalog_updated_at();

-- ── Row-level security ────────────────────────────────────────
alter table recipes_catalog enable row level security;

drop policy if exists "Authenticated users can read approved recipes" on recipes_catalog;
create policy "Authenticated users can read approved recipes"
  on recipes_catalog for select
  using (auth.uid() is not null and status = 'approved');

drop policy if exists "Authenticated users can submit recipes" on recipes_catalog;
create policy "Authenticated users can submit recipes"
  on recipes_catalog for insert
  with check (auth.uid() is not null and auth.uid() = submitted_by);

-- No UPDATE or DELETE policy for clients.
-- The service role key (used by the admin panel) bypasses RLS and can
-- approve/reject/edit recipes freely.
