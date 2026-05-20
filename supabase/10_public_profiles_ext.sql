-- ============================================================
-- Gearnomic — Migration 10: public profile extensions
-- Idempotent — safe to re-run.
-- ============================================================

-- Add meal-plan visibility and snapshot columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS public_meal_plans boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS snap_meal_plans   jsonb;

-- Rebuild public_profiles view to expose new columns
CREATE OR REPLACE VIEW public_profiles AS
SELECT
  id,
  username,
  display_name,
  avatar_url,
  is_supporter,
  is_ambassador,
  supporter_since,
  public_bio,
  public_loadouts,
  public_trips,
  public_gear,
  public_meal_plans,
  CASE WHEN public_bio        THEN bio              ELSE NULL END AS bio,
  CASE WHEN public_bio        THEN social_strava    ELSE NULL END AS social_strava,
  CASE WHEN public_bio        THEN social_instagram ELSE NULL END AS social_instagram,
  CASE WHEN public_bio        THEN social_youtube   ELSE NULL END AS social_youtube,
  CASE WHEN public_bio        THEN social_website   ELSE NULL END AS social_website,
  CASE WHEN public_bio        THEN custom_links     ELSE NULL END AS custom_links,
  CASE WHEN public_loadouts   THEN snap_loadouts    ELSE NULL END AS snap_loadouts,
  CASE WHEN public_trips      THEN snap_trips       ELSE NULL END AS snap_trips,
  CASE WHEN public_gear       THEN snap_gear        ELSE NULL END AS snap_gear,
  CASE WHEN public_meal_plans THEN snap_meal_plans  ELSE NULL END AS snap_meal_plans,
  created_at
FROM profiles;
