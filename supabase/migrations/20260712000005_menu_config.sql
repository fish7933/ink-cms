-- UI 구성 관리(메뉴 구조) 저장을 위한 테이블. 기존엔 localStorage에만 저장되어
-- 관리자 본인 브라우저에만 반영되고 다른 사용자/서버 어디에도 실제로 적용되지 않던 버그를 고친다.
-- 단일 행(key='main')에 전체 MenuCategory[] 구조를 JSONB로 저장하는 싱글턴 설정 테이블.
CREATE TABLE IF NOT EXISTS menu_config (
  key TEXT PRIMARY KEY,
  structure JSONB NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE menu_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_menu_config ON menu_config FOR ALL USING (true) WITH CHECK (true);
