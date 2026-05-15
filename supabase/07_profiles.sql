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

-- Reserved slugs that cannot be claimed as usernames
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_username_not_reserved;
ALTER TABLE profiles ADD CONSTRAINT profiles_username_not_reserved
  CHECK (username IS NULL OR username NOT IN (
    'login','logout','signup','register','auth','oauth','callback','verify','reset','password',
    'settings','account','profile','dashboard','admin','share','api','pricing','plans','upgrade',
    'billing','subscribe','subscription','checkout','about','contact','help','support','faq',
    'terms','privacy','legal','blog','changelog','press','careers','jobs','team','mission',
    'www','mail','email','static','assets','cdn','dev','staging','beta','app','web','mobile',
    'feed','rss','sitemap','robots','404','500','error','pack','gear','kit','trip','trips',
    'list','lists','loadout','loadouts','recipe','recipes','meal','meals','stable','bike',
    'explore','discover','search','u','user','users','gearnomic','anthropic','administrator',
    'moderator','mod','official','staff','new','edit','delete','create','update','save',
    'import','export','download','upload','invite','refer','referral','affiliate','ambassador',
    'founder','supporter','public','private','null','undefined','root','home','index',
    'welcome','start','getting-started','onboarding','tour','demo','test','sandbox'
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

CREATE OR REPLACE FUNCTION _block_profile_badge_writes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.is_supporter IS DISTINCT FROM OLD.is_supporter OR
      NEW.is_ambassador IS DISTINCT FROM OLD.is_ambassador OR
      NEW.supporter_since IS DISTINCT FROM OLD.supporter_since) THEN
    RAISE EXCEPTION 'badge columns are read-only for client requests';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_profile_badge_writes ON profiles;
CREATE TRIGGER trg_block_profile_badge_writes
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION _block_profile_badge_writes();
