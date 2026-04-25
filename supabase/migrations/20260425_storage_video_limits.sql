-- =============================================================
-- Bump the place-photos bucket size limit to fit videos.
--
-- Default Supabase free-tier buckets cap individual files at 50MB,
-- which iPhone 4K clips blow through in seconds (a 30s 4K clip is
-- already ~130MB). Mirror the 200MB client-side cap in PhotoUploader
-- so the upload either succeeds end-to-end or fails fast in the
-- browser instead of making the round trip.
--
-- Also widen allowed_mime_types so video uploads aren't rejected
-- by the bucket-level mime filter (some Supabase projects ship
-- with image/* only when the bucket was originally created for
-- photos).
-- =============================================================

update storage.buckets
   set file_size_limit = 209715200,  -- 200 MB
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/gif', 'image/webp',
         'image/heic', 'image/heif',
         'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'
       ]
 where id = 'place-photos';
