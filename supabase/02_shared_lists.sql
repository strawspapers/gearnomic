-- ============================================================
-- Gearnomic — Migration 02: shared lists
-- Run this ONCE in Supabase SQL Editor after setup.sql
-- ============================================================

create table if not exists shared_lists (
  id          text primary key,           -- short random token used in the URL hash
  owner_id    uuid references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('trip','template')),
  title       text not null,
  payload     jsonb not null,             -- full trip/template + embedded gear items
  created_at  timestamptz not null default now()
);

-- Public read — anyone with the link can view, no auth required
alter table shared_lists enable row level security;

create policy "Anyone can read shared lists"
  on shared_lists for select using (true);

create policy "Owners can insert shared lists"
  on shared_lists for insert with check (auth.uid() = owner_id);

create policy "Owners can delete shared lists"
  on shared_lists for delete using (auth.uid() = owner_id);
