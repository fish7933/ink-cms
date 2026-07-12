-- rotation.service.ts의 교대 발령 승인 처리가 sea_service_records를 새로 만들 때
-- ship_name만 기록하고 ship_id(FK)를 빠뜨려서, 이미 ships 테이블에 선주/플릿까지
-- 정상적으로 등록돼 있는 선박인데도 고과/상병 관리 등에서 "플릿 없음"으로 보이는
-- 문제가 있었다. 회사 배치(company_assignment) 기록 중 ship_id가 비어 있는 것을
-- 선박명이 정확히 일치하는 ships 레코드로 역추적해 채워 넣는다.
-- (pre_company 기록은 입사 전 외부 회사 선박이라 우리 ships 테이블과 무관하므로 대상에서 제외)
UPDATE sea_service_records ssr
SET ship_id = s.id
FROM ships s
WHERE ssr.ship_id IS NULL
  AND ssr.record_type = 'company_assignment'
  AND ssr.ship_name = s.name;
