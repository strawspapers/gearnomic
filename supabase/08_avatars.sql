-- ============================================================
-- Gearnomic — Migration 08: profile avatars
-- Run this ONCE in Supabase SQL Editor
-- ============================================================

-- ── Add avatar_url to profiles ────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- ── Storage bucket ────────────────────────────────────────
-- Public bucket: files are readable without auth.
-- 2 MB size limit, JPG and PNG only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS policies ──────────────────────────────────
-- Anyone can read avatars (bucket is public, but explicit policy is good practice)
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
CREATE POLICY "Avatars are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Authenticated owner can upload their own avatar.
-- Path pattern: {user_id}/avatar.jpg
-- (storage.foldername returns 1-indexed array of path segments)
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Authenticated owner can overwrite their own avatar (upsert = update)
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Authenticated owner can delete their own avatar
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
