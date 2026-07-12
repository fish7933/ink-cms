-- 증서 카테고리가 코드에 하드코딩된 6개 고정값이라 추가/수정/삭제가 불가능했다.
-- 직급/선종 등 다른 관리 목록과 같은 방식으로 DB 관리 목록으로 전환한다.
-- certificate_types.category는 이 테이블의 code 값을 그대로 참조하는 텍스트 컬럼으로 유지한다
-- (기존 데이터 무변경).
CREATE TABLE IF NOT EXISTS certificate_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 999,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE certificate_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "certificate_categories_all" ON certificate_categories FOR ALL USING (true) WITH CHECK (true);

INSERT INTO certificate_categories (code, name, display_order) VALUES
  ('stcw', 'STCW 증서', 1),
  ('national', '자국/기국 증서', 2),
  ('medical', '건강/의료 증서', 3),
  ('safety', '안전 교육', 4),
  ('technical', '기술 교육', 5),
  ('other', '기타', 6)
ON CONFLICT (code) DO NOTHING;
