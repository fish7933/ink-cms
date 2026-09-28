-- 지출결의서가 원화(KRW) 항목만 가정하고 있어 달러 등 외화 지출을 표현할 방법이 없었다.
-- "지출 항목" line_items에 통화 선택 컬럼을 추가한다(금액 컬럼 바로 뒤).
UPDATE approval_document_types
SET field_schema = '[
  {"key": "expense_date", "type": "date", "label": "지출일", "required": true},
  {
    "key": "expense_items",
    "type": "line_items",
    "label": "지출 항목",
    "required": true,
    "columns": [
      {"key": "expense_category", "type": "select", "label": "지출 항목", "required": true,
       "options": ["협력업체 지급", "해외대리점 송금", "여비교통비", "식비", "소모품비", "접대비", "기타"]},
      {"key": "purpose", "type": "text", "label": "지출 목적", "required": false},
      {"key": "amount", "type": "number", "label": "금액", "required": true},
      {"key": "currency", "type": "select", "label": "통화", "required": true, "options": ["KRW", "USD", "EUR", "JPY"]},
      {"key": "vendor", "type": "text", "label": "지급처", "required": true},
      {"key": "attachments", "type": "file", "label": "증빙서류", "required": false}
    ]
  },
  {"key": "notes", "type": "textarea", "label": "비고", "required": false}
]'::jsonb,
updated_at = now()
WHERE code = 'expense_report';
