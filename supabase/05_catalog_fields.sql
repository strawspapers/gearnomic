-- ============================================================
-- Gearnomic — Migration 05: catalog_items field updates
-- Run this ONCE in Supabase SQL Editor after 04_catalog_items.sql
-- ============================================================

-- Add misc (free-form spec notes: volume, R-value, wall thickness, etc.)
alter table catalog_items add column if not exists misc text;

-- Add category (matches the gear closet category names: Pack, Sleep, Shelter, etc.)
alter table catalog_items add column if not exists category text;

-- Add attributes (structured key-value specs for future analytics queries,
-- e.g. {"r_value": "6.5", "volume_l": "40", "fill_power": "850", "temp_rating_c": "-9"})
alter table catalog_items add column if not exists attributes jsonb;
