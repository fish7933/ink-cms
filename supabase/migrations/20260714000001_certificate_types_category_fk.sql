-- certificate_categories를 DB 관리 목록으로 전환한 이전 마이그레이션(20260712000016)에서
-- certificate_types.category의 옛 CHECK 제약(stcw/national/medical/safety/technical/other 6개만 허용)을
-- 없애지 않아, 그 이후 새로 추가한 카테고리(company/visa/foc/domestic 등)로 증서 유형을 등록하려 하면
-- 제약 위반으로 계속 실패하고 있었다. CHECK 대신 certificate_categories(code)를 참조하는 FK로 교체한다.
ALTER TABLE certificate_types DROP CONSTRAINT IF EXISTS certificate_types_category_check;

ALTER TABLE certificate_types
  ADD CONSTRAINT certificate_types_category_fkey
  FOREIGN KEY (category) REFERENCES certificate_categories(code);
