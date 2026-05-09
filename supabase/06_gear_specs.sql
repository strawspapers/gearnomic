-- ============================================================
-- Gearnomic — Migration 06: gear spec fields + item specs
-- Run this ONCE in Supabase SQL Editor after 05_catalog_fields.sql
-- ============================================================

-- ── Fix nullability on catalog_items ──────────────────────
-- brand and name are already NOT NULL from migration 04.
-- designation (model name) was nullable; make it required.
-- Update any existing nulls to empty string before adding constraint.
update catalog_items set designation = '' where designation is null;
alter table catalog_items alter column designation set not null;

-- ── spec_fields — controlled vocabulary for spec names ────
create table if not exists spec_fields (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null unique,     -- e.g. "Fill Power", "Volume (L)"
  unit        text,                            -- e.g. "g", "L", "mAh", "°F"
  discipline  text,                            -- e.g. "backpacking", "general"
  created_at  timestamptz not null default now()
);

create index if not exists idx_spec_fields_name on spec_fields(name);

-- ── catalog_item_specs — spec values per catalog item ─────
create table if not exists catalog_item_specs (
  id               uuid        primary key default gen_random_uuid(),
  catalog_item_id  uuid        not null references catalog_items(id) on delete cascade,
  spec_field_id    uuid        not null references spec_fields(id)   on delete cascade,
  value            text        not null,
  created_at       timestamptz not null default now(),
  unique (catalog_item_id, spec_field_id)   -- one value per field per item
);

create index if not exists idx_catalog_item_specs_item  on catalog_item_specs(catalog_item_id);
create index if not exists idx_catalog_item_specs_field on catalog_item_specs(spec_field_id);

-- ── Row-level security ────────────────────────────────────
alter table spec_fields       enable row level security;
alter table catalog_item_specs enable row level security;

-- Authenticated users can read all spec field definitions
create policy "Authenticated users can read spec fields"
  on spec_fields for select using (auth.uid() is not null);

-- Authenticated users can read specs on approved catalog items
create policy "Authenticated users can read catalog item specs"
  on catalog_item_specs for select
  using (
    auth.uid() is not null
    and exists (
      select 1 from catalog_items ci
      where ci.id = catalog_item_id and ci.status = 'approved'
    )
  );

-- No INSERT / UPDATE / DELETE policies on either table.
-- All writes go through the service role key (admin panel only).
