-- 지출 목적은 참고용 설명이라 필수로 둘 필요는 없다 — line_items 필드(key로 찾음, 배열
-- 순서에 의존하지 않음) 안의 purpose 열만 required: false로 바꾼다.
UPDATE approval_document_types
SET field_schema = (
  SELECT jsonb_agg(
    CASE
      WHEN top->>'key' = 'expense_items' THEN jsonb_set(
        top,
        '{columns}',
        (
          SELECT jsonb_agg(
            CASE WHEN col->>'key' = 'purpose' THEN col || '{"required": false}'::jsonb ELSE col END
          )
          FROM jsonb_array_elements(top->'columns') AS col
        )
      )
      ELSE top
    END
  )
  FROM jsonb_array_elements(field_schema) AS top
)
WHERE code = 'expense_report';
