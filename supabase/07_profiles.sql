-- ============================================================
-- Gearnomic — Migration 07: public profiles & usernames
-- Run this ONCE in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id               uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username         text        UNIQUE,
  display_name     text,
  bio              text,

  -- Social links
  social_strava    text,
  social_instagram text,
  social_youtube   text,
  social_website   text,

  -- Custom links (paid users only) — [{label, url, enabled}]
  custom_links     jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- Visibility toggles (all private by default)
  public_bio       boolean     NOT NULL DEFAULT false,
  public_loadouts  boolean     NOT NULL DEFAULT false,
  public_trips     boolean     NOT NULL DEFAULT false,
  public_gear      boolean     NOT NULL DEFAULT false,

  -- Public data snapshots (refreshed on profile save)
  snap_loadouts    jsonb,
  snap_trips       jsonb,
  snap_gear        jsonb,

  -- Badge cache (synced from user_data on save)
  is_supporter     boolean     NOT NULL DEFAULT false,
  is_ambassador    boolean     NOT NULL DEFAULT false,
  supporter_since  text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Username format: 3-30 chars, a-z 0-9 _ -  must start/end with alphanumeric
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_username_format;
ALTER TABLE profiles ADD CONSTRAINT profiles_username_format
  CHECK (username IS NULL OR (
    length(username) BETWEEN 3 AND 30
    AND username ~ '^[a-z0-9][a-z0-9_-]*[a-z0-9]$'
  ));

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles (username) WHERE username IS NOT NULL;

-- ── Row-level security ────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Public: anyone can read any profile
CREATE POLICY "Profiles are publicly readable"
  ON profiles FOR SELECT
  USING (true);

-- Private: users manage only their own row
CREATE POLICY "Users manage their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── Auto-update updated_at ────────────────────────────────
CREATE OR REPLACE FUNCTION _profiles_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION _profiles_set_updated_at();
