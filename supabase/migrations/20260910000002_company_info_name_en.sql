-- 외부로 나가는 결재문서(시행문)의 "발신"란에 회사 영문명을 표기하기 위해 추가.
ALTER TABLE company_info ADD COLUMN IF NOT EXISTS name_en TEXT;
