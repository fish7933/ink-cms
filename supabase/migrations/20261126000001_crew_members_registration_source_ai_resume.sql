-- 이력서 AI 추출로 등록된 선원을 구분하기 위한 registration_source 값 추가.
-- (RegistrationSource 타입/REGISTRATION_SOURCE_LABELS에 'ai_resume' 추가와 짝)
ALTER TABLE crew_members DROP CONSTRAINT IF EXISTS crew_members_registration_source_check;
ALTER TABLE crew_members ADD CONSTRAINT crew_members_registration_source_check
  CHECK (registration_source IN ('agency_recommended', 'agency_direct', 'company_direct', 'ai_resume'));
