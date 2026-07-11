-- 문서 양식함: 기안서 문서유형(approval_document_types)에 구조화된 입력 양식(field_schema)을
-- 붙일 수 있게 한다. field_schema가 있으면 기안서 작성 화면이 자유 서식 본문 대신 이 스키마 기반의
-- 동적 입력 폼을 보여주고, 제출된 값은 approval_documents.form_data에 저장된다.
-- field_schema 형태: [{ "key": "amount", "label": "금액", "type": "number", "required": true, "options": [...] }, ...]
ALTER TABLE approval_document_types ADD COLUMN IF NOT EXISTS field_schema JSONB;
ALTER TABLE approval_documents ADD COLUMN IF NOT EXISTS form_data JSONB;

-- 요청받은 기본 양식 2종을 미리 등록해둔다 (이미 같은 코드가 있으면 필드 구성만 갱신).
INSERT INTO approval_document_types (code, name, is_free_form, is_active, field_schema)
VALUES (
  'expense_report',
  '지출결의서',
  false,
  true,
  '[
    {"key": "expense_date", "label": "지출일", "type": "date", "required": true},
    {"key": "expense_category", "label": "지출 항목", "type": "select", "required": true, "options": ["여비교통비", "식비", "소모품비", "접대비", "통신비", "기타"]},
    {"key": "purpose", "label": "지출 목적", "type": "text", "required": true},
    {"key": "amount", "label": "금액", "type": "number", "required": true},
    {"key": "vendor", "label": "지급처", "type": "text", "required": false},
    {"key": "notes", "label": "비고", "type": "textarea", "required": false}
  ]'::jsonb
)
ON CONFLICT (code) DO UPDATE SET field_schema = EXCLUDED.field_schema;

INSERT INTO approval_document_types (code, name, is_free_form, is_active, field_schema)
VALUES (
  'resignation_letter',
  '사직서',
  false,
  true,
  '[
    {"key": "resign_date", "label": "퇴사 희망일", "type": "date", "required": true},
    {"key": "reason_category", "label": "사직 사유", "type": "select", "required": true, "options": ["개인 사정", "이직", "건강", "학업", "기타"]},
    {"key": "reason_detail", "label": "상세 사유", "type": "textarea", "required": true},
    {"key": "handover_plan", "label": "인수인계 계획", "type": "textarea", "required": false}
  ]'::jsonb
)
ON CONFLICT (code) DO UPDATE SET field_schema = EXCLUDED.field_schema;
