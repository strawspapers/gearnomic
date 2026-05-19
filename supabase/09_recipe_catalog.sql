-- ============================================================
-- Gearnomic — Migration 09: community recipe catalog
-- Idempotent — safe to re-run on an existing table.
-- ============================================================

-- Create table if it does not yet exist (fresh install path).
-- Columns that require type changes are declared as text here;
-- the DO blocks below handle the text → text[] migration safely.
create table if not exists recipes_catalog (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  description  text,
  meal_time    text,
  prep_method  text,
  servings     integer,
  ingredients  jsonb,
  prep_notes   text,
  source       text,
  status       text        not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  submitted_by uuid        references auth.users(id) on delete set null,
  approved_by  uuid        references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Add new columns that may not exist on older installs
alter table recipes_catalog add column if not exists packed_weight_g numeric(8,2);

-- Migrate meal_time: text → text[] (no-op if already text[])
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'recipes_catalog'
      and column_name = 'meal_time'
      and data_type   = 'text'
  ) then
    alter table recipes_catalog
      alter column meal_time type text[]
      using array[meal_time];
  end if;
end $$;

-- Migrate prep_method: text → text[] (no-op if already text[])
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'recipes_catalog'
      and column_name = 'prep_method'
      and data_type   = 'text'
  ) then
    alter table recipes_catalog
      alter column prep_method type text[]
      using array[prep_method];
  end if;
end $$;

-- Index on status (the only server-side filter used)
create index if not exists idx_recipes_catalog_status on recipes_catalog(status);

-- Auto-update updated_at on every write
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
