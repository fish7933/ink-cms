-- RAON 선원관리 프로그램 호환 필드 추가
-- 영문이름, 한자이름, 신체/인적사항, 언어능력, 건강/신체검사, 서류번호 등

BEGIN;

ALTER TABLE crew_members
  -- 이름 (영문/한자)
  ADD COLUMN IF NOT EXISTS name_english TEXT,
  ADD COLUMN IF NOT EXISTS name_chinese TEXT,

  -- 신체/인적사항 (Bio-Data)
  ADD COLUMN IF NOT EXISTS eye_color TEXT,
  ADD COLUMN IF NOT EXISTS religion TEXT,
  ADD COLUMN IF NOT EXISTS clothing_size TEXT,
  ADD COLUMN IF NOT EXISTS smoking BOOLEAN,
  ADD COLUMN IF NOT EXISTS drinking BOOLEAN,
  ADD COLUMN IF NOT EXISTS marital_status TEXT CHECK (marital_status IN ('single', 'married', 'divorced', 'widowed')),
  ADD COLUMN IF NOT EXISTS children_count INTEGER DEFAULT 0,

  -- 언어 능력
  ADD COLUMN IF NOT EXISTS english_read_write TEXT CHECK (english_read_write IN ('beginner', 'intermediate', 'advanced', 'excellent')),
  ADD COLUMN IF NOT EXISTS english_speak_listen TEXT CHECK (english_speak_listen IN ('beginner', 'intermediate', 'advanced', 'excellent')),
  ADD COLUMN IF NOT EXISTS other_languages TEXT,
  ADD COLUMN IF NOT EXISTS job_ability TEXT,
  ADD COLUMN IF NOT EXISTS motivation TEXT,

  -- 건강/신체검사
  ADD COLUMN IF NOT EXISTS previous_illness TEXT,
  ADD COLUMN IF NOT EXISTS drug_test_date DATE,
  ADD COLUMN IF NOT EXISTS drug_test_result TEXT CHECK (drug_test_result IN ('pass', 'fail', 'pending')),
  ADD COLUMN IF NOT EXISTS physical_exam_date DATE,
  ADD COLUMN IF NOT EXISTS physical_exam_result TEXT CHECK (physical_exam_result IN ('fit', 'unfit', 'pending')),
  ADD COLUMN IF NOT EXISTS yellow_fever_vaccination BOOLEAN,
  ADD COLUMN IF NOT EXISTS yellow_fever_date DATE,

  -- 서류 번호
  ADD COLUMN IF NOT EXISTS passport_number TEXT,
  ADD COLUMN IF NOT EXISTS passport_expiry DATE,
  ADD COLUMN IF NOT EXISTS seaman_book_number TEXT,
  ADD COLUMN IF NOT EXISTS seaman_book_expiry DATE,
  ADD COLUMN IF NOT EXISTS seaman_book_flag_number TEXT,
  ADD COLUMN IF NOT EXISTS seaman_book_flag_expiry DATE,
  ADD COLUMN IF NOT EXISTS sid TEXT;

COMMIT;
