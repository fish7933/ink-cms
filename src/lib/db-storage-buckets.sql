-- Create storage buckets for crew and ship documents
-- Run this in Supabase SQL Editor

BEGIN;

-- Create crew-documents bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'crew-documents',
  'crew-documents',
  true,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- Create ship-documents bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ship-documents',
  'ship-documents',
  true,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- Setup RLS policies for crew-documents
CREATE POLICY "allow_public_read_crew_docs" 
ON storage.objects FOR SELECT 
TO public 
USING (bucket_id = 'crew-documents');

CREATE POLICY "allow_authenticated_upload_crew_docs" 
ON storage.objects FOR INSERT 
TO public 
WITH CHECK (bucket_id = 'crew-documents');

CREATE POLICY "allow_authenticated_update_crew_docs" 
ON storage.objects FOR UPDATE 
TO public 
USING (bucket_id = 'crew-documents');

CREATE POLICY "allow_authenticated_delete_crew_docs" 
ON storage.objects FOR DELETE 
TO public 
USING (bucket_id = 'crew-documents');

-- Setup RLS policies for ship-documents
CREATE POLICY "allow_public_read_ship_docs" 
ON storage.objects FOR SELECT 
TO public 
USING (bucket_id = 'ship-documents');

CREATE POLICY "allow_authenticated_upload_ship_docs" 
ON storage.objects FOR INSERT 
TO public 
WITH CHECK (bucket_id = 'ship-documents');

CREATE POLICY "allow_authenticated_update_ship_docs" 
ON storage.objects FOR UPDATE 
TO public 
USING (bucket_id = 'ship-documents');

CREATE POLICY "allow_authenticated_delete_ship_docs" 
ON storage.objects FOR DELETE 
TO public 
USING (bucket_id = 'ship-documents');

COMMIT;