-- 지출결의서를 "지출일 하나 + 지출 항목(목적/금액/지급처 등) 여러 건"을 한 문서로 묶어 한 번에
-- 결재받을 수 있는 구조로 바꾼다. 지출일은 회사가 돈을 집행하는 날짜 하나로 고정, 지출 항목은
-- line_items 필드로 여러 건을 계속 추가할 수 있게 한다.
UPDATE approval_document_types
SET field_schema = '[
  {"key": "expense_date", "type": "date", "label": "지출일", "required": true},
  {"key": "expense_items", "type": "line_items", "label": "지출 항목", "required": true, "columns": [
    {"key": "expense_category", "type": "select", "label": "지출 항목", "required": true, "options": ["급여", "여비교통비", "식비", "소모품비", "접대비", "통신비", "기타"]},
    {"key": "purpose", "type": "text", "label": "지출 목적", "required": true},
    {"key": "amount", "type": "number", "label": "금액", "required": true},
    {"key": "vendor", "type": "text", "label": "지급처", "required": true}
  ]},
  {"key": "notes", "type": "textarea", "label": "비고", "required": false}
]'::jsonb
WHERE code = 'expense_report';

-- 이미 제출된(구 스키마) 지출결의서 2건은 데이터가 사라지지 않도록 항목 1건짜리 line_items로 변환.
UPDATE approval_documents
SET form_data = jsonb_build_object(
  'expense_date', form_data->'expense_date',
  'notes', form_data->'notes',
  'expense_items', jsonb_build_array(jsonb_build_object(
    'expense_category', form_data->'expense_category',
    'purpose', form_data->'purpose',
    'amount', form_data->'amount',
    'vendor', form_data->'vendor'
  ))
)
WHERE document_type_id = (SELECT id FROM approval_document_types WHERE code = 'expense_report')
  AND form_data ? 'amount'; -- 이미 새 구조(expense_items)로 변환된 행은 건드리지 않는다.
