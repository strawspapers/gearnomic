-- ============================================================
-- Gearnomic — Migration 04: community gear catalog
-- Run this ONCE in Supabase SQL Editor after setup.sql
-- ============================================================

create table if not exists catalog_items (
  id                    uuid        primary key default gen_random_uuid(),
  brand                 text        not null,
  name                  text        not null,
  designation           text,                            -- model/variant (e.g. "Southwest 40")
  discipline            text[],                          -- e.g. '{backpacking,bikepacking}'
  manufacturer_weight_g numeric(8, 2),                  -- grams, as stated by manufacturer
  url                   text,
  description           text,
  status                text        not null default 'pending'
                          check (status in ('pending', 'approved', 'rejected')),
  submitted_by          uuid        references auth.users(id) on delete set null,
  approved_by           uuid        references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Indexes for the two most common access patterns:
-- browsing approved items and looking up by brand
create index if not exists idx_catalog_items_status on catalog_items(status);
create index if not exists idx_catalog_items_brand  on catalog_items(brand);

-- Auto-update updated_at on every write (same pattern as setup.sql)
create or replace function touch_catalog_items_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_catalog_items_updated
  before update on catalog_items
  for each row execute function touch_catalog_items_updated_at();

-- ── Row-level security ────────────────────────────────────────
alter table catalog_items enable row level security;

-- Authenticated users can browse approved items
create policy "Authenticated users can read approved catalog items"
  on catalog_items for select
  using (auth.uid() is not null and status = 'approved');

-- Authenticated users can submit items; submitted_by must match the caller
-- so a user cannot submit on behalf of someone else
create policy "Authenticated users can submit catalog items"
  on catalog_items for insert
  with check (auth.uid() is not null and auth.uid() = submitted_by);

-- No UPDATE or DELETE policy is intentional.
-- With RLS enabled, the absence of an UPDATE policy means authenticated clients
-- cannot update any row. The service role key (used by the admin panel) bypasses
-- RLS entirely and can approve/reject items freely.

-- ── catalog_item_id on gear_items ────────────────────────────
-- The live Gearnomic schema stores user gear as a JSONB blob in user_data,
-- not in a relational gear_items table. The statements below apply to the
-- planned relational schema in schema/schema.sql and should be run once that
-- migration has been deployed.
--
-- alter table gear_items
--   add column if not exists catalog_item_id uuid
--   references catalog_items(id) on delete set null;
--
-- create index if not exists idx_gear_items_catalog
--   on gear_items(catalog_item_id)
--   where catalog_item_id is not null;
