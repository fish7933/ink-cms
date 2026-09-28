-- 기안서 본문 편집기(rich text)에서 이미지 삽입을 지원하기 위한 전용 스토리지 버킷.
-- company-assets 버킷 생성 마이그레이션(20260708000003)과 동일한 패턴.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-body-images',
  'document-body-images',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "allow_public_read_document_body_images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'document-body-images');

CREATE POLICY "allow_authenticated_upload_document_body_images"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'document-body-images');

CREATE POLICY "allow_authenticated_update_document_body_images"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'document-body-images');

CREATE POLICY "allow_authenticated_delete_document_body_images"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'document-body-images');
