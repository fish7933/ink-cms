-- 20260728000005 실행 직후 다른 세션에서 지출 항목 카테고리 옵션을 수정해(협력업체 지급/
-- 해외대리점 송금 등 추가) field_schema가 line_items 구조 대신 그 수정된 값으로 다시 덮여있었다.
-- 그 최신 옵션을 그대로 유지한 채 line_items 구조로 다시 적용한다.
UPDATE approval_document_types
SET field_schema = '[
  {"key": "expense_date", "type": "date", "label": "지출일", "required": true},
  {"key": "expense_items", "type": "line_items", "label": "지출 항목", "required": true, "columns": [
    {"key": "expense_category", "type": "select", "label": "지출 항목", "required": true, "options": ["협력업체 지급", "해외대리점 송금", "여비교통비", "식비", "소모품비", "접대비", "기타"]},
    {"key": "purpose", "type": "text", "label": "지출 목적", "required": true},
    {"key": "amount", "type": "number", "label": "금액", "required": true},
    {"key": "vendor", "type": "text", "label": "지급처", "required": true}
  ]},
  {"key": "notes", "type": "textarea", "label": "비고", "required": false}
]'::jsonb
WHERE code = 'expense_report'
  AND NOT (field_schema @> '[{"key": "expense_items"}]'::jsonb); -- 이미 line_items로 바뀐 상태면 건드리지 않는다.
