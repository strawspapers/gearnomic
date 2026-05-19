-- ============================================================
-- Gearnomic — Migration 09: community recipe catalog
-- Idempotent — safe to re-run on an existing table.
-- ============================================================

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

-- Drop any check constraints on meal_time and prep_method before changing their types.
-- The original table had check(meal_time in (...)) and check(prep_method in (...)) which
-- become invalid once the columns are text[] and must be removed first.
do $$
declare
  cname text;
begin
  for cname in (
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid
                       and a.attnum   = any(c.conkey)
    join pg_class     r on r.oid      = c.conrelid
    where r.relname   = 'recipes_catalog'
      and a.attname   in ('meal_time', 'prep_method')
      and c.contype   = 'c'
  ) loop
    execute format('alter table recipes_catalog drop constraint if exists %I', cname);
  end loop;
end $$;

-- Migrate meal_time: text → text[] (skips if already text[])
do $$ begin
  if (select data_type from information_schema.columns
      where table_schema = 'public'
        and table_name   = 'recipes_catalog'
        and column_name  = 'meal_time') = 'text' then
    alter table recipes_catalog
      alter column meal_time type text[]
      using array[meal_time::text];
  end if;
end $$;

-- Migrate prep_method: text → text[] (skips if already text[])
do $$ begin
  if (select data_type from information_schema.columns
      where table_schema = 'public'
        and table_name   = 'recipes_catalog'
        and column_name  = 'prep_method') = 'text' then
    alter table recipes_catalog
      alter column prep_method type text[]
      using array[prep_method::text];
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
