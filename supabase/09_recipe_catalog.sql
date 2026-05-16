-- ============================================================
-- Gearnomic — Migration 09: community recipe catalog
-- Run this ONCE in Supabase SQL Editor after setup.sql
-- ============================================================

create table if not exists recipes_catalog (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  description  text,
  meal_time    text        check (meal_time in ('breakfast', 'lunch', 'dinner', 'snack')),
  prep_method  text        check (prep_method in ('hot', 'cold-soak', 'no-cook')),
  servings     integer,
  ingredients  jsonb,                                       -- [{qty, unit, name}]
  prep_notes   text,
  source       text,
  status       text        not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  submitted_by uuid        references auth.users(id) on delete set null,
  approved_by  uuid        references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_recipes_catalog_status    on recipes_catalog(status);
create index if not exists idx_recipes_catalog_meal_time on recipes_catalog(meal_time);
create index if not exists idx_recipes_catalog_prep      on recipes_catalog(prep_method);

create or replace function touch_recipes_catalog_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_recipes_catalog_updated
  before update on recipes_catalog
  for each row execute function touch_recipes_catalog_updated_at();

-- ── Row-level security ────────────────────────────────────────
alter table recipes_catalog enable row level security;

-- Authenticated users can browse approved recipes
create policy "Authenticated users can read approved recipes"
  on recipes_catalog for select
  using (auth.uid() is not null and status = 'approved');

-- Authenticated users can submit recipes; submitted_by must match the caller
create policy "Authenticated users can submit recipes"
  on recipes_catalog for insert
  with check (auth.uid() is not null and auth.uid() = submitted_by);

-- No UPDATE or DELETE policy for clients.
-- The service role key (used by the admin panel) bypasses RLS and can
-- approve/reject/edit recipes freely.
