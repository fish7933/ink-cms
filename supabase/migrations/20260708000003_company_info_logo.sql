-- 우리회사 정보에 로고 이미지 저장을 위한 컬럼 및 전용 스토리지 버킷
ALTER TABLE company_info ADD COLUMN IF NOT EXISTS logo_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-assets',
  'company-assets',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "allow_public_read_company_assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'company-assets');

CREATE POLICY "allow_authenticated_upload_company_assets"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'company-assets');

CREATE POLICY "allow_authenticated_update_company_assets"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'company-assets');

CREATE POLICY "allow_authenticated_delete_company_assets"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'company-assets');
