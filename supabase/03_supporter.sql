-- ============================================================
-- Gearnomic — Migration 03: supporter column + Stripe webhook
-- Run in Supabase SQL Editor after setup.sql
-- ============================================================

-- Add is_supporter column to user_data
alter table user_data add column if not exists is_supporter boolean not null default false;
alter table user_data add column if not exists supporter_since timestamptz;
alter table user_data add column if not exists stripe_customer_id text;

-- Index for Stripe webhook lookups by customer ID
create index if not exists idx_user_data_stripe_customer on user_data(stripe_customer_id);

-- Supporters can read their own supporter status via normal RLS (already covered by existing policy)
-- The Stripe webhook Edge Function uses the service role key to bypass RLS

alter table user_data add column if not exists is_ambassador boolean not null default false;
