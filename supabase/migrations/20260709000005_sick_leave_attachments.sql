-- 질병휴가는 신청 시점이 아니라 사후에(예: 진단서 발급 후) 증빙 서류를 첨부할 수 있어야 하므로
-- 신청 건에 첨부파일 목록을 저장할 수 있게 한다.
ALTER TABLE sick_leave_requests ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
